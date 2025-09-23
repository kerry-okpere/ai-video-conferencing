import { useEffect, useRef, useState } from "react";
import "./App.css";

const MAX_RECONNECTION_ATTEMPTS = 3;
// https://www.youtube.com/watch?v=8I2axE6j204
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

const constraints = { audio: false, video: true };

function App() {
  const pcRef = useRef(null);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const wsRef = useRef(null);

  const [numberOfParticipants, setNumberOfParticipants] = useState(0);
  const [clientId, setClientId] = useState(null);
  const reconnectionAttemptsRef = useRef(0);
  const wsConnected =
    wsRef.current && wsRef.current.readyState === WebSocket.OPEN;

  useEffect(() => {
    const connectWebRTC = () => {
      if (pcRef.current) return;
      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Sending ICE candidate via WebSocket:", event.candidate);

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
        if (remoteVideo.current && event.streams[0]) {
          const stream = event.streams[0];

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
    };

    const connectWebSocket = () => {
      const ws = new WebSocket(import.meta.env.VITE_WEBSOCKET_URL);
      wsRef.current = ws;

      ws.onopen = () => {};

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        setNumberOfParticipants(message.connected || 0);

        console.log("Received via WebSocket:", message);

        switch (message.type) {
          case "welcome":
            setClientId(message.clientId);
            break;

          case "offer":
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

          case "join":
            createOfferWebSocket();
            break;

          case "answer":
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

    console.log("Connecting to WebSocket and setting up WebRTC...");

    connectWebSocket();
    connectWebRTC();

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

  const joinCall = async () => {
    await start();
    // Notify signaling server that we want to join a call
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "join",
        })
      );
    }
  };

  const start = async () => {
    console.log("Starting call - requesting camera access...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      stream.getTracks().forEach((track) => {
        pcRef.current?.addTrack(track, stream);
      });

      if (localVideo.current) {
        localVideo.current.srcObject = stream;
        console.log("Local video stream set");
      }
      console.log("Local stream setup complete");
    } catch (error) {
      console.error("Error accessing media devices.", error);
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

  return (
    <>
      <div
        style={{
          marginBottom: "10px",
          padding: "10px",
          backgroundColor: wsConnected ? "#0cb433ff" : "#4b1116ff",
          border: "1px solid",
          borderRadius: "5px",
        }}
      >
        <strong>
          WebSocket Status: {wsConnected ? "Connected" : "Disconnected"}
        </strong>
        {clientId && <span> | Client ID: {clientId}</span>}
      </div>

      {numberOfParticipants <= 1 ? (
        <button onClick={start}>Start Call</button>
      ) : (
        <button onClick={joinCall}>
          Join as a participant
        </button>
      )}

      <figure>
        <figcaption>Local Video</figcaption>
        <video
          ref={localVideo}
          id="localVideo"
          autoPlay
          playsInline
          muted
          style={{ width: "300px", height: "200px", backgroundColor: "black" }}
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
  );
}

export default App;
