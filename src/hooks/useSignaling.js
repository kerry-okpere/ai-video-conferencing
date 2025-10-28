import { useEffect, useRef, useState } from "react";
import { MAX_RECONNECTION_ATTEMPTS, rtcConfig } from "../constants";

// TODO signalling sever should only handle signalling and not room management
// Move room management to a separate service
const useSignaling = ({
    onTrack,
    onRoomCreated,
    onNewRoomAdded,
    onParticipantJoined,
    onRoomClosed,
    onNewClientSocketConnection,
    onicecandidateAdded
}) => {
    const pcRef = useRef(null);
    const wsRef = useRef(null);
    const [clientId, setClientId] = useState(null);
    const clientIdRef = useRef(null);
    const reconnectionAttemptsRef = useRef(0);

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

            pcRef.current.ontrack = (event) => {
                onTrack && onTrack(event);
            };
        };

        const connectWebSocket = () => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
            console.log("Connecting to WebSocket server...");
            const ws = new WebSocket(import.meta.env.VITE_WEBSOCKET_URL);
            wsRef.current = ws;

            ws.onopen = () => { };

            ws.onmessage = async (event) => {
                const message = JSON.parse(event.data);

                switch (message.type) {
                    case "welcome":
                        setClientId(message.clientId);
                        clientIdRef.current = message.clientId;
                        onNewClientSocketConnection && onNewClientSocketConnection(message);
                        break;

                    case "room-created":
                        // This only triggers for the user that created the room
                        onRoomCreated && onRoomCreated({
                            roomId: message.roomId,
                            participants: message.participants
                        });
                        break;

                    case "room-closed":
                        onRoomClosed && onRoomClosed({
                            roomId: message.roomId,
                        });
                        break;
                    case "new-room":
                        // This triggers for all other users when a new room is created
                        onNewRoomAdded && onNewRoomAdded({
                            roomId: message.roomId,
                        });
                        break;
                    case "new-participant":
                        onParticipantJoined && onParticipantJoined({
                            participants: message.participants,
                            roomId: message.roomId
                        });
                        break;
                    case "joined-room":
                        console.log("Participant is attempting to join the call");
                        await createOfferWebSocket();
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
                            onicecandidateAdded && onicecandidateAdded(message.candidate);
                        }
                        break;

                    case "error":
                        console.error(`Error from server: ${message.message}`);
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


    return { wsRef, pcRef, clientId };
};

export default useSignaling;