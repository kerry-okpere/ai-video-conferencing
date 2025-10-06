import { useEffect, useRef, useState } from "react";
import "./App.css";
import WaitingRoom from "./page/WaitingRoom";
import useSignaling from "./hooks/useSignaling";
import useWorker from "./hooks/useWorker";
import { WHISPER_SAMPLING_RATE } from "./constants";
import { useMicVAD } from "@ricky0123/vad-react";

const constraints = { audio: true, video: true };
const IS_WEBGPU_AVAILABLE = !!navigator.gpu;

function App() {
  // Signalling and Peer Connection
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const [roomIds, setRoomIds] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Automatic Speech Recognition
  const [isListening, setIsListening] = useState(false); // use in the ui to show user we are listening
  const [transcription, setTranscription] = useState("");
  const [language] = useState("en");
  const [audioChunks, setAudioChunks] = useState([]);

  const {
    loading: loadingModel,
    percentageLoaded,
    isLoaded,
    generate,
    loadModel,
  } = useWorker({
    onStart: () => {
      setIsListening(true);
    },
    onComplete: (event) => {
      setIsListening(false);
      setTranscription((prev) => {
        const newText = prev ? prev + " \n" + event.data.text : event.data.text;
        sendDataChannelMessage(newText);
        return newText;
      });

      // Automatically process the next audio chunk if available
      setAudioChunks((prev) => {
        if (prev.length) {
          const [nextChunk, ...rest] = prev;
          generate(nextChunk);
          return rest;
        }
        return [];
      });
    },
  });

  const { start } = useMicVAD({
    startOnLoad: false,
    onSpeechEnd: (audio) => {
      setAudioChunks((prev) => [...prev, { audio, language }]);
    },
  });

  const { wsRef, pcRef, clientId, sendDataChannelMessage } = useSignaling({
    onTrack: async (event) => {
      const stream = event.streams[0];
      if (stream) {
        setRemoteStream(stream);
      }
    },
    onRoomCreated: (data) => {
      setIsCallActive(true);
      setCurrentRoom(data);
    },
    onNewRoomAdded: (data) => {
      setRoomIds((prev) => [...prev, data.roomId]);
    },
    onRoomClosed: (data) => {
      setRoomIds((prev) => prev.filter((id) => id !== data.roomId));
    },
    onParticipantJoined: (data) => {
      // Use functional update to avoid stale closure
      setCurrentRoom((currentRoom) => {
        if (!currentRoom) return data;

        if (currentRoom && data.roomId === currentRoom.roomId) {
          return {
            ...currentRoom,
            participants: data.participants,
          };
        }
        return currentRoom;
      });
    },
    onDataChannelMessage: (message) => {
      console.log("Received message via data channel:", message);
    },
    onNewClientSocketConnection: (message) => {
      console.log("WebSocket connection established:", message);
      setRoomIds(() => {
        console.log(message.roomIds);
        return message.roomIds || [];
      });
    },
    onicecandidateAdded: () => {
      setIsCallActive(true);
    },
  });

  const participantName = currentRoom?.participants?.find(
    (p) => p.clientId !== clientId
  )?.username;

  const joinCall = async (username) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "join-room",
          roomId: roomIds[0], // TODO: we need to list available roomIds that are not filled
          clientId,
          username,
        })
      );
    }
  };

  const createRoom = async (username) => {
    wsRef.current.send(
      JSON.stringify({
        type: "create-room",
        roomId: "room1",
        clientId,
        username,
      })
    );
  };

  const getMediaStream = async () => {
    console.log("Get media stream - requesting camera access...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      stream.getTracks().forEach((track) => {
        pcRef.current?.addTrack(track, stream);
      });

      setStream(stream);
    } catch (error) {
      console.error("Error accessing media devices.", error);
    }
  };

  useEffect(() => {
    const setRemoteVideoStream = async () => {
      if (remoteVideo.current && remoteStream) {
        const stream = remoteStream;

        remoteVideo.current.srcObject = stream;
        try {
          await remoteVideo.current.play();
        } catch (playError) {
          console.error("Remote video play() failed:", playError);
        }
      }
    };

    setRemoteVideoStream();
  }, [remoteStream]);

  useEffect(() => {
    if (Boolean(audioChunks.length) && !isListening) {
      const [nextChunk, ...rest] = audioChunks;
      generate(nextChunk);
      setAudioChunks(rest);
    }
  }, [audioChunks, isListening]);

  useEffect(() => {
    if (isCallActive && localVideo.current && stream) {
      localVideo.current.srcObject = stream;

      start();
    }
  }, [stream, isCallActive]);

  if (!IS_WEBGPU_AVAILABLE) {
    return <div>WebGPU is not available in your browser.</div>;
  }

  return (
    <>
      {isCallActive ? (
        <>
          <figure>
            <figcaption>Me</figcaption>
            <video
              ref={localVideo}
              id="localVideo"
              autoPlay
              playsInline
              muted
              style={{
                width: "300px",
                height: "200px",
                backgroundColor: "black",
              }}
            ></video>
          </figure>
          <figure>
            <figcaption>{participantName}</figcaption>
            <video
              ref={remoteVideo}
              id="remoteVideo"
              autoPlay
              playsInline
              style={{
                width: "300px",
                height: "200px",
                backgroundColor: "black",
                border: "2px solid red",
              }}
            ></video>
          </figure>

          {isListening ? <div>Listening...</div> : <div>{transcription}</div>}
        </>
      ) : (
        <>
          <WaitingRoom
            stream={stream}
            model={{
              percentage: percentageLoaded,
              loading: loadingModel,
              isLoaded,
              load: loadModel,
            }}
            onCollectMedia={getMediaStream}
            onJoinCall={(name) =>
              roomIds.length ? joinCall(name) : createRoom(name)
            }
            actionText={roomIds.length ? "Join Call" : "Create Room"}
          />
        </>
      )}
    </>
  );
}

export default App;
