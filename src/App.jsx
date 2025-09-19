import { useEffect, useRef, useState } from "react";
import "./App.css";
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

  const [localOffer, setLocalOffer] = useState(null);
  const [remoteOffer, setRemoteOffer] = useState(null);
  const [remoteAnswer, setRemoteAnswer] = useState(null);
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [localCandidates, setLocalCandidates] = useState([]);
  const [remoteCandidates, setRemoteCandidates] = useState("");

  useEffect(() => {
    if (pcRef.current) return;
    const configuration = rtcConfig;
    const pc = new RTCPeerConnection(configuration);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Send candidate to signaling serverrrr:", event.candidate);
        setLocalCandidates(prev => [...prev, event.candidate]);
      }
    };

    pcRef.current.ontrack = async (event) => {
      console.log("On Remote track received:", event.streams);
      if (remoteVideo.current && event.streams[0]) {
        const stream = event.streams[0];
        
        // Debug: Check the tracks in the stream
        console.log("Stream tracks:", stream.getTracks());
        console.log("Video tracks:", stream.getVideoTracks());
        console.log("Audio tracks:", stream.getAudioTracks());
        
        stream.getTracks().forEach(track => {
          console.log(`Track: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}, muted: ${track.muted}`);
        });
        
        remoteVideo.current.srcObject = stream;
        console.log("Remote video stream set successfully");
        
        // Debug: Check video element properties
        console.log("Remote video element:", {
          srcObject: remoteVideo.current.srcObject,
          videoWidth: remoteVideo.current.videoWidth,
          videoHeight: remoteVideo.current.videoHeight,
          readyState: remoteVideo.current.readyState,
          paused: remoteVideo.current.paused
        });
        
        // Try to force play the video
        try {
          await remoteVideo.current.play();
          console.log("Remote video play() succeeded");
        } catch (playError) {
          console.error("Remote video play() failed:", playError);
        }
      }
    };

    return () => {
      // Cleanup when leaving call
      pc.close();
      pcRef.current = null;
    };
  }, []);

  const start = async () => {
    console.log("Starting call - requesting camera access...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Camera access granted, stream details:", {
        id: stream.id,
        active: stream.active,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
          muted: t.muted,
          id: t.id
        }))
      });
      
      stream
        .getTracks()
        .forEach((track) => {
          console.log("Adding track to peer connection:", {
            kind: track.kind,
            enabled: track.enabled,
            readyState: track.readyState
          });
          pcRef.current?.addTrack(track, stream);
        });
        
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
        console.log("Local video stream set");
      }

      const remoteStream = new MediaStream();
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = remoteStream;
        console.log("Remote video element prepared");
      }
      
      console.log("Local stream setup complete");
      setIsCallStarted(true);
    } catch (error) {
      console.error("Error accessing media devices.", error);
    }
  };

  const createOffer = async () => {
    if (!pcRef.current) return;
    try {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      console.log("Offer created and set as local description:", offer);
      // TODO:Send the offer to the remote peer via signaling server

      setLocalOffer(JSON.stringify(offer));
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  const createAnswer = async (remoteOffer) => {
    if (!pcRef.current) return;
    try {
      // First set the remote offer as remote description
      await pcRef.current.setRemoteDescription(remoteOffer);

      // Then create and set the answer
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      console.log("Answer created and set as local description:", answer);
      // Send the answer to the remote peer via signaling server
      return answer;
    } catch (error) {
      console.error("Error creating answer:", error);
    }
  };

  const handleRemoteAnswer = async (remoteAnswer) => {
    if (!pcRef.current) return;
    try {
      await pcRef.current.setRemoteDescription(remoteAnswer);
      console.log("Remote answer set as remote description");
    } catch (error) {
      console.error("Error setting remote answer:", error);
    }
  };

  return (
    <>
      <button disabled={!isCallStarted} onClick={createOffer}>
        Create Offer
      </button>

      <button onClick={start}>Start Call</button>
      
      <button onClick={() => {
        console.log("=== DEBUG REMOTE VIDEO ===");
        console.log("Remote video element:", remoteVideo.current);
        console.log("Remote video srcObject:", remoteVideo.current?.srcObject);
        console.log("Remote video tracks:", remoteVideo.current?.srcObject?.getTracks());
        console.log("Peer connection:", pcRef.current);
        console.log("Peer connection state:", pcRef.current?.connectionState);
        console.log("ICE connection state:", pcRef.current?.iceConnectionState);
      }}>
        Debug Remote Video
      </button>

      <div>
        <h3>Remote Offer</h3>
        <textarea
          name="remoteOffer"
          id="remoteOffer"
          value={remoteOffer}
          onChange={(e) => setRemoteOffer(e.target.value)}
        ></textarea>
        <button
          onClick={async () => {
            if (remoteOffer) {
              const parsedOffer = JSON.parse(remoteOffer);
              const answer = await createAnswer(parsedOffer);
              if (answer) {
                setRemoteAnswer(JSON.stringify(answer));
              }
            }
          }}
        >
          Create Answer
        </button>
        <pre style={{ whiteSpace: "pre-wrap", maxWidth: "300px" }}>{remoteAnswer} Copy to A</pre>
      </div>

      <div>
        <h3>Local Offer</h3>
        <pre style={{ whiteSpace: "pre-wrap", maxWidth: "300px" }}>{localOffer} Copy to B</pre>

        <h3>Remote Answer (Copy to A)</h3>
        <textarea
          name="remoteAnswer"
          id="remoteAnswer"
          value={remoteAnswer}
          onChange={(e) => setRemoteAnswer(e.target.value)}
        ></textarea>
        <button
          onClick={async () => {
            if (remoteAnswer) {
              const parsedAnswer = JSON.parse(remoteAnswer);
              await handleRemoteAnswer(parsedAnswer);
            }
          }}
        >
          Set Remote Answer
        </button>
      </div>

      <div>
        <h3>ICE Candidates</h3>
        <h4>Local Candidates (Copy to remote peer)</h4>
        <pre style={{ whiteSpace: "pre-wrap", maxWidth: "300px", fontSize: "10px" }}>
          {JSON.stringify(localCandidates, null, 2)}
        </pre>
        
        <h4>Remote Candidates (Paste from remote peer)</h4>
        <textarea
          value={remoteCandidates}
          onChange={(e) => setRemoteCandidates(e.target.value)}
          placeholder="Paste remote peer's candidates here"
          rows="3"
          cols="50"
        />
        <button
          onClick={async () => {
            if (remoteCandidates && pcRef.current) {
              try {
                const candidates = JSON.parse(remoteCandidates);
                for (const candidate of candidates) {
                  await pcRef.current.addIceCandidate(candidate);
                  console.log("Added ICE candidate:", candidate);
                }
                console.log("All ICE candidates added successfully");
              } catch (error) {
                console.error("Error adding ICE candidates:", error);
              }
            }
          }}
        >
          Add Remote ICE Candidates
        </button>
      </div>

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
          onLoadedMetadata={() => console.log("Remote video metadata loaded")}
          onCanPlay={() => console.log("Remote video can play")}
          onPlay={() => console.log("Remote video started playing")}
          onError={(e) => console.error("Remote video error:", e)}
          style={{ width: "300px", height: "200px", backgroundColor: "black", border: "2px solid red" }}
        ></video>
      </figure>
    </>
  );
}

export default App;
