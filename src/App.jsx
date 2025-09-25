// https://www.youtube.com/watch?v=8I2axE6j204
import { useEffect, useRef, useState } from "react";
import "./App.css";
import WaitingRoom from "./page/WaitingRoom";
import { MAX_RECONNECTION_ATTEMPTS, rtcConfig } from "./constants";

const constraints = { audio: true, video: true };

function App() {
  const pcRef = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const wsRef = useRef(null);
  const wsConnected =
    wsRef.current && wsRef.current.readyState === WebSocket.OPEN;

  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [clientId, setClientId] = useState(null);
  const clientIdRef = useRef(null);
  const reconnectionAttemptsRef = useRef(0);
  const [isCallActive, setIsCallActive] = useState(false);

  const joinCall = async () => {
    if (wsConnected) {
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

  const createOfferWebSocket = async () => {
    if (
      !pcRef.current ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    ) {
      alert("WebSocket not connected!");
      return;
    }

    try {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      console.log("Offer created, sending via WebSocket:", offer);

      // Send offer via WebSocket
      wsRef.current.send(
        JSON.stringify({
          type: "offer",
          offer: offer,
        })
      );
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  useEffect(() => {
    const connectWebRTC = () => {
      if (pcRef.current) return;

      console.log("Initializing RTCPeerConnection...");
      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(
            clientIdRef.current,
            "Sending ICE candidate via WebSocket:",
            event.candidate
          );

          // Send ICE candidate via WebSocket
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "ice-candidate",
                candidate: event.candidate,
              })
            );
          }
        }
      };

      pcRef.current.ontrack = async (event) => {
        const stream = event.streams[0];
        if (stream) {
          setRemoteStream(stream);
        }
      };
    };

    const connectWebSocket = () => {
      if (wsConnected) return;
      console.log("Connecting to WebSocket server...");
      const ws = new WebSocket(import.meta.env.VITE_WEBSOCKET_URL);
      wsRef.current = ws;

      ws.onopen = () => {};

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case "welcome":
            console.log("Received via WebSocket:", message);
            setClientId(message.clientId);
            clientIdRef.current = message.clientId;
            setRooms(message.rooms || []);
            break;

          case "room-created":
            console.log("Room created:", message.roomId);
            setIsCallActive(true);
            setRooms((prevRooms) => [...prevRooms, message.roomId]);
            break;

          case "join":
            console.log("Participant is attempting to join the call");
            createOfferWebSocket();
            break;

          case "offer":
            console.log("Received offer from incoming peer:", message.offer);
            // Received offer from remote peer
            if (pcRef.current) {
              await pcRef.current.setRemoteDescription(message.offer);
              const answer = await pcRef.current.createAnswer();
              await pcRef.current.setLocalDescription(answer);

              // Send answer back via WebSocket
              ws.send(
                JSON.stringify({
                  type: "answer",
                  answer: answer,
                })
              );
            }
            break;

          case "answer":
            console.log("Sending answer to remote peer");
            // Received answer from remote peer
            if (pcRef.current) {
              await pcRef.current.setRemoteDescription(message.answer);
            }
            break;

          case "ice-candidate":
            // Received ICE candidate from remote peer
            if (pcRef.current && message.candidate) {
              console.log("Adding received ICE candidate:", message.candidate);
              await pcRef.current.addIceCandidate(message.candidate);
              setIsCallActive(true);
            }
            break;
        }
      };

      ws.onclose = () => {
        console.log("Disconnected from signaling server");
        if (reconnectionAttemptsRef.current < MAX_RECONNECTION_ATTEMPTS) {
          reconnectionAttemptsRef.current++;
          // Attempt to reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    };

    connectWebRTC();
    connectWebSocket();

    return () => {
      // Cleanup WebSocket
      if (wsRef.current) {
        wsRef.current.close();
      }

      // Cleanup WebRTC
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, []);

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
      {clientId}
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
