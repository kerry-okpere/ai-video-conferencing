// https://www.youtube.com/watch?v=8I2axE6j204
import { useEffect, useRef, useState } from "react";
import "./App.css";
import WaitingRoom from "./page/WaitingRoom";
import useSignaling from "./hooks/useSignaling";

const constraints = { audio: true, video: true };

function App() {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const [rooms, setRooms] = useState([]);
  const [isCallActive, setIsCallActive] = useState(false);
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

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
    console.log("Creating Room...");
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
        console.log("Remote video play() succeeded");
      } catch (playError) {
        console.error("Remote video play() failed:", playError);
      }
    }
  };

  // For Room Component
  useEffect(() => {
    if (isCallActive && localVideo.current && stream) {
      localVideo.current.srcObject = stream;
      console.log("Local stream setup complete");
    }
  }, [stream, isCallActive]);

  useEffect(() => {
    setRemoteVideoStream();
  }, [remoteStream]);
  return (
    <>
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
        <WaitingRoom
          stream={stream}
          onCollectMedia={getMediaStream}
          onJoinCall={rooms.length ? joinCall : createRoom}
          actionText={rooms.length ? "Join Call" : "Create Room"}
        />
      )}
    </>
  );
}

export default App;
