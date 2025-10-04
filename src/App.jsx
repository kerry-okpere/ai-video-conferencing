// https://www.youtube.com/watch?v=8I2axE6j204
import { useEffect, useRef, useState } from "react";
import "./App.css";
import WaitingRoom from "./page/WaitingRoom";
import useSignaling from "./hooks/useSignaling";
import useWorker from "./hooks/useWorker";
import { WHISPER_SAMPLING_RATE } from "./constants";
import getAudioInput from "./utils/getAudioInput";

const constraints = { audio: true, video: true };
const IS_WEBGPU_AVAILABLE = !!navigator.gpu;



function App() {
  // Signalling and Peer Connection
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const [rooms, setRooms] = useState([]);
  const [isCallActive, setIsCallActive] = useState(false);
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Automatic Speech Recognition
  const recorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [chunks, setChunks] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [language] = useState("en");

  const {
    loading: loadingModel,
    percentageLoaded,
    modelIsLoaded,
    generate,
    loadModel,
  } = useWorker({
    onStart: () => {
      setIsListening(true);
      recorderRef.current?.requestData();
    },
    onComplete: (event) => {
      setIsListening(false);
      setTranscription(event.data.output);
    },
  });

  const { wsRef, pcRef, clientId } = useSignaling({
    onTrack: async (event) => {
      const stream = event.streams[0];
      if (stream) {
        setRemoteStream(stream);
      }
    },
    onRoomCreated: (roomId) => {
      console.log("Room created:", roomId);
      setIsCallActive(true);
      setRooms((prevRooms) => [...prevRooms, roomId]);
    },
    onNewClientSocketConnection: (message) => {
      console.log("WebSocket connection established:", message);
      setRooms(message.rooms || []);
    },
    onicecandidateAdded: () => {
      setIsCallActive(true);
    },
  });

  const joinCall = async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "join",
        })
      );
    }
  };

  const createRoom = async () => {
    wsRef.current.send(
      JSON.stringify({
        type: "create-room",
        roomId: "room1",
        clientId,
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

  const setRemoteVideoStream = async () => {
    if (remoteVideo.current && remoteStream) {
      const stream = remoteStream;

      remoteVideo.current.srcObject = stream;
      // Try to force play the video
      try {
        await remoteVideo.current.play();
      } catch (playError) {
        console.error("Remote video play() failed:", playError);
      }
    }
  };

  useEffect(() => {
    if (isCallActive && localVideo.current && stream) {
      localVideo.current.srcObject = stream;

      const audioTrack = stream.getAudioTracks()[0];
      const audioStream = new MediaStream([audioTrack]);

      recorderRef.current = new MediaRecorder(audioStream);
      audioContextRef.current = new AudioContext({
        sampleRate: WHISPER_SAMPLING_RATE,
      });

      recorderRef.current.onstart = () => {
        setRecording(true);
        setChunks([]);
      };
      recorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          setChunks((prev) => [...prev, e.data]);
        } else {
          // Empty chunk received, so we request new data after a short timeout
          setTimeout(() => {
            recorderRef.current.requestData();
          }, 25);
        }
      };

      recorderRef.current.onstop = () => {
        setRecording(false);
      };
    }

    if (isCallActive && localVideo.current && stream && modelIsLoaded) {
      recorderRef.current?.start();
    }

    return () => {
      recorderRef.current?.stop();
      recorderRef.current = null;
    };
  }, [stream, isCallActive]);

  useEffect(() => {
    setRemoteVideoStream();
  }, [remoteStream]);

  useEffect(() => {
    if (!recorderRef.current) return;
    if (!recording) return;
    if (isListening) return;
    if (!modelIsLoaded) return;

    if (chunks.length > 0) {
      // Generate from data
      getAudioInput(
        chunks,
        recorderRef.current.mimeType,
        audioContextRef,
        (audio) => generate({ audio, language })
      );
    } else {
      recorderRef.current?.requestData();
    }
  }, [recording, isListening, chunks, language]);

  return (
    <>
      {JSON.stringify(transcription)}
      {isCallActive ? (
        <>
          <figure>
            <figcaption>Local Video</figcaption>
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
            <figcaption>Remote Video</figcaption>
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
        </>
      ) : (
        <>
          <button disabled={loadingModel} onClick={loadModel}>
            {loadingModel
              ? `loading model... (${percentageLoaded}%)`
              : "Load model"}
          </button>
          <WaitingRoom
            stream={stream}
            onCollectMedia={getMediaStream}
            onJoinCall={rooms.length ? joinCall : createRoom}
            actionText={rooms.length ? "Join Call" : "Create Room"}
          />
        </>
      )}
    </>
  );
}

export default App;
