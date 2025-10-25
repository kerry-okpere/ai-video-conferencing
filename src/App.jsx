import { useEffect, useRef, useState, useCallback } from "react";
import "./App.css";
import WaitingRoom from "./page/WaitingRoom";
import CallArea from "./components/CallArea";
import useSignaling from "./hooks/useSignaling";
import useWorker from "./hooks/useWorker";
import { LANGUAGES } from "./constants";
import { useMicVAD } from "@ricky0123/vad-react";
import { useTranslatorManager } from "./hooks/useTranslatorManager";

const constraints = { audio: true, video: true };
const IS_WEBGPU_AVAILABLE = !!navigator.gpu;

// Todo: reconnecting after ending call is not working
function App() {
  // Signalling and Peer Connection
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const [roomIds, setRoomIds] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [stream, setStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const participantName = useRef(null);

  // Automatic Speech Recognition
  const vadStarted = useRef(false);
  const [isTranslating, setIsTranslating] = useState(false); // use in the ui to show user we are listening
  const [transcriptions, setTranscriptions] = useState([]);
  const [language, setLanguage] = useState("en");
  const [audioChunks, setAudioChunks] = useState([]);
  const [remoteUserLanguage, setRemoteUserLanguage] = useState("en");

  const {
    loading: loadingModel,
    generate,
    terminate,
  } = useWorker({
    onStart: () => {
      setIsTranslating(true);
    },
    onComplete: (event) => {
      console.log("captured audio");
      setIsTranslating(false);

      // Handle the new event structure with status: "complete" and text: decoded.join(" ")
      const text = event.data?.text || "";
      const sentLanguage = language; // We know the user's language from state
      
      // Only process if we have text and status is complete
      if (!text || (event.data?.status && event.data.status !== "complete")) {
        return;
      }
      
      setTranscriptions((prev) => {
        // Handle translation and message sending
        const handleTranslationAndSend = async () => {
          console.log(
            "Handling translation and sending for text:",
            text,
            "in language:",
            sentLanguage,
            "target language:",
            remoteUserLanguage
          );
          
          // Check if we need to translate (user's language different from remote user's language)
          if (isTranslatorSupported && language !== remoteUserLanguage) {
            try {
              // Translate from user's language to remote user's language
              const translatedText = await translate(text, language, remoteUserLanguage);

              sendDataChannelMessage(
                JSON.stringify({
                  message: translatedText, // Send translation in remote user's language
                  language: remoteUserLanguage,
                  translation: {
                    message: text, // Original in user's language
                    language: language,
                  },
                  senderLanguage: language, // Include sender's language for context
                })
              );
            } catch (error) {
              console.error("Translation failed:", error);
              // Send original message if translation fails
              sendDataChannelMessage(
                JSON.stringify({ 
                  message: text, 
                  language: sentLanguage,
                  senderLanguage: language 
                })
              );
            }
          } else {
            // No translation needed (same language or translation not supported)
            sendDataChannelMessage(
              JSON.stringify({ 
                message: text, 
                language: sentLanguage,
                senderLanguage: language 
              })
            );
          }
        };

        handleTranslationAndSend();

        return [
          ...prev,
          {
            id: Date.now(),
            text: text,
            sender: "me",
            outgoing: true,
            language: sentLanguage,
          },
        ];
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

  const { start, pause, listening } = useMicVAD({
    startOnLoad: false,
    onSpeechEnd: (audio) => {
      setAudioChunks((prev) => [...prev, { audio, language }]);
    },
  });

  const { wsRef, pcRef, clientId, leaveRoom, sendDataChannelMessage } =
    useSignaling({
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
      onDataChannelMessage: async (data) => {
        // store incoming data as a bubble
        const { message, language: messageLanguage, translation, senderLanguage } = JSON.parse(data);
        console.log("Parsed data channel message:", {
          message,
          messageLanguage,
          translation,
          senderLanguage,
        });

        // Check if we need to translate the incoming message to our language
        let displayMessage = message;
        let displayTranslation = translation;

        if (isTranslatorSupported && senderLanguage && senderLanguage !== language && messageLanguage !== language) {
          try {
            // If the message isn't already in our language, translate it
            const translatedToOurLanguage = await translate(message, messageLanguage, language);
            displayMessage = translatedToOurLanguage;
            
            // Keep the original as translation info
            displayTranslation = {
              message: message,
              language: messageLanguage
            };
          } catch (error) {
            console.error("Failed to translate incoming message:", error);
            // Keep original message if translation fails
          }
        }

        setTranscriptions((prev) => [
          ...prev,
          {
            id: Date.now(),
            text: displayMessage,
            sender: participantName.current || "Remote",
            outgoing: false,
            language: language, // Display in our language
            translation: displayTranslation,
          },
        ]);
        console.log("Received message via data channel:", displayMessage);
      },
      onNewClientSocketConnection: (message) => {
        console.log("WebSocket connection established:", message);
        setRoomIds(() => {
          return message.roomIds || [];
        });
      },
      onicecandidateAdded: () => {
        setIsCallActive(true);
      },
    });

  const toggleAudioTracks = useCallback(
    (enabled) => {
      if (!stream) return;
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || !audioTracks.length) return;

      audioTracks.forEach((t) => {
        try {
          t.enabled = Boolean(enabled);
        } catch (err) {
          console.warn("Failed to set track.enabled:", err);
        }
      });
    },
    [stream]
  );

  const handleEndCall = useCallback(async () => {
    // pause VAD listening and mute audio tracks
    try {
      if (listening) {
        pause();
        toggleAudioTracks(false);
      }
      vadStarted.current = false; // Reset VAD started flag
    } catch (err) {
      console.warn("Failed to pause VAD", err);
    }

    try {
      terminate();
    } catch (err) {
      console.warn("Failed to terminate worker", err);
    }

    // Inform peers/room that we are leaving but keep WebSocket open for waiting room updates
    leaveRoom();

    // Close peer connection
    try {
      pcRef.current?.close();
    } catch (err) {
      console.warn("Failed to close peer connection", err);
    }

    // Note: keep local media `stream` running so the WaitingRoom continues to show
    // the user's local video/audio. We only clear call-related state below.
    setRemoteStream(null);
    setIsCallActive(false);
    setCurrentRoom(null);
    setTranscriptions([]);
    setAudioChunks([]);
    setRemoteUserLanguage("en"); // Reset remote user language
  }, [listening, pause, terminate, leaveRoom, pcRef, toggleAudioTracks]);

  const {
    isSupported: isTranslatorSupported,
    translate,
    prewarmTranslators,
  } = useTranslatorManager();

  const remoteParticipant = currentRoom?.participants?.find(
    (p) => p.clientId !== clientId
  );
  participantName.current = remoteParticipant?.username;

  // Update remote user language when participants change
  useEffect(() => {
    if (remoteParticipant?.language) {
      setRemoteUserLanguage(remoteParticipant.language);
    }
  }, [remoteParticipant?.language]);

  const joinCall = async (username) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "join-room",
          roomId: roomIds[0], // TODO: we need to list available roomIds that are not filled
          clientId,
          username,
          language,
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
        language,
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
    if (Boolean(audioChunks.length) && !isTranslating) {
      const [nextChunk, ...rest] = audioChunks;
      generate(nextChunk);
      setAudioChunks(rest);
    }
  }, [audioChunks, isTranslating, generate]);

  useEffect(() => {
    if (isCallActive && localVideo.current && stream && !vadStarted.current) {
      localVideo.current.srcObject = stream;

      start();
      vadStarted.current = true;
    }

    // Reset when call ends
    if (!isCallActive) {
      vadStarted.current = false;
    }
  }, [stream, isCallActive, start]);

  if (!IS_WEBGPU_AVAILABLE) {
    return <div>WebGPU is not available in your browser.</div>;
  }

  return (
    <>
      {isCallActive ? (
        <div className="call-layout">
          <CallArea
            localVideoRef={localVideo}
            remoteVideoRef={remoteVideo}
            remoteStream={remoteStream}
            currentRoom={currentRoom}
            clientId={clientId}
            participantName={participantName.current}
            stream={stream}
            listening={listening}
            videoEnabled={videoEnabled}
            onToggleMic={() => {
              if (listening) {
                pause();
                toggleAudioTracks(false);
              } else {
                start();
                toggleAudioTracks(true);
              }
            }}
            onToggleVideo={() => {
              if (!stream) return;
              const newVideoEnabled = !videoEnabled;
              stream
                .getVideoTracks()
                .forEach((t) => (t.enabled = newVideoEnabled));
              setVideoEnabled(newVideoEnabled);
            }}
            onEndCall={handleEndCall}
          />

          <aside className="transcript-panel">
            <div className="transcript-header">
              <h3>Live Transcription</h3>
            </div>

            <div className="transcript-list">
              {transcriptions.map((m) => (
                <div
                  key={m.id}
                  className={`bubble ${m.outgoing ? "you" : "other"}`}
                >
                  <div className="bubble-sender">{m.sender}</div>
                  <div className="bubble-text">
                    {m?.translation ? (
                      <p>
                        <span>{m.text}</span>
                        <i className="bubble-text-original">
                          Original: {m.translation.message}
                        </i>
                      </p>
                    ) : (
                      <p>{m.text}</p>
                    )}
                  </div>
                </div>
              ))}

              {loadingModel || isTranslating ? (
                <p>Listening...</p>
              ) : (
                transcriptions.length === 0 && (
                  <div className="empty">No transcripts yet.</div>
                )
              )}
            </div>

            <footer className="transcript-footer">
              <select
                value={language}
                // disabled={!isTranslatorSupported}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              {/* {!isTranslatorSupported && (
                <p>Translator API is not supported in this browser.</p>
              )} */}
            </footer>
          </aside>
        </div>
      ) : (
        <>
          <WaitingRoom
            stream={stream}
            onCollectMedia={getMediaStream}
            onJoinCall={(name) => {
              // Prewarm translation models when joining
              if (isTranslatorSupported) {
                const otherLanguages = LANGUAGES.filter(
                  (l) => l.value !== language
                ).map((l) => l.value);
                // Prewarm translators for both directions
                if (language !== "en") {
                  prewarmTranslators(language, otherLanguages);
                }
                // Also prewarm from other languages to our language
                otherLanguages.forEach(lang => {
                  if (lang !== language) {
                    prewarmTranslators(lang, [language]);
                  }
                });
              }
              return roomIds.length ? joinCall(name) : createRoom(name);
            }}
            actionText={roomIds.length ? "Join Call" : "Create Room"}
            onLanguageChange={setLanguage}
            selectedLanguage={language}
            isTranslatorSupported={isTranslatorSupported}
            supportedLanguages={LANGUAGES}
          />
        </>
      )}
    </>
  );
}

export default App;
