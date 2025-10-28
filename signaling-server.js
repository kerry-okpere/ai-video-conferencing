import { WebSocketServer, WebSocket } from 'ws';

export const MAX_PARTICIPANTS = 2;

const wss = new WebSocketServer({ port: 8080, host: '0.0.0.0' });

const clients = new Map();
const rooms = new Map();

console.log('WebRTC Signaling Server running');

function broadcastToSubscribers(clientId, message) {
    // Broadcast to all other clients (simple room)
    clients.forEach((client, id) => {
        if (id !== clientId && client.readyState === WebSocket.OPEN) {
            // Forward the message with sender info
            client.send(JSON.stringify(message));
        }
    });
}
wss.on('connection', (ws) => {
    console.log('New client connected');

    const clientId = Date.now().toString();
    clients.set(clientId, ws);

    ws.send(JSON.stringify({
        type: 'welcome',
        clientId: clientId,
        roomIds: Array.from(rooms.keys()),
        connected: Array.from(clients.keys()).length
    }));

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message.type, 'from client:', clientId);

            if (message.type === 'create-room') {
                const roomId = message.roomId || `room-${Date.now()}`;
                rooms.set(roomId, new Set([{ clientId, username: message.username }]));
                ws.send(JSON.stringify({
                    type: 'room-created',
                    participants: Array.from(rooms.get(roomId).values()),
                    roomId: roomId
                }));

                // Notify all clients about the new room
                broadcastToSubscribers(clientId, {
                    type: 'new-room',
                    roomId: roomId,
                });
                console.log(`Room created: ${roomId} by client: ${clientId}`);
                return;
            }

            if (message.type === 'join-room') {
                console.log('Client attempting to join room:', message.roomId);
                const room = rooms.get(message.roomId);

                if (!room || room.size >= MAX_PARTICIPANTS) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Room not found or Room is full'
                    }));
                    return;
                }

                // Add client to room
                room.add({ clientId, username: message.username });
                ws.send(JSON.stringify({
                    type: 'joined-room',
                    roomId: message.roomId
                }));
                broadcastToSubscribers(null, {
                    type: 'new-participant',
                    participants: Array.from(room.values()),
                    roomId: message.roomId
                });
                console.log(`Client ${clientId} joined room: ${message.roomId}`);

                return;
            }

            broadcastToSubscribers(clientId, {
                ...message,
                from: clientId
            });
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected:', clientId);
        clients.delete(clientId);
        rooms.forEach((roomSet, roomId) => {
            roomSet.forEach((participant) => {
                if (participant.clientId === clientId) {
                    roomSet.delete(participant);
                }
            });
            if (roomSet.size === 0) {
                rooms.delete(roomId);
                console.log(`Room deleted: ${roomId}`);
                broadcastToSubscribers(clientId, {
                    type: 'room-closed',
                    roomId: roomId,
                });
            }
        });


        // Notify other clients about disconnection
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'peer-disconnected',
                    clientId: clientId,
                }));
            }
        });
    });
});