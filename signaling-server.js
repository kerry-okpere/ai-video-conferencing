import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080, host: '0.0.0.0' });

const clients = new Map();
const rooms = new Map();

console.log('WebRTC Signaling Server running');

wss.on('connection', (ws) => {
    console.log('New client connected');

    const clientId = Date.now().toString();
    clients.set(clientId, ws);

    ws.send(JSON.stringify({
        type: 'welcome',
        clientId: clientId,
        rooms: Array.from(rooms.keys()),
        connected: Array.from(clients.keys()).length
    }));

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message.type, 'from client:', clientId);

            if (message.type === 'create-room') {
                const roomId = message.roomId || `room-${Date.now()}`;
                rooms.set(roomId, new Set([clientId]));
                ws.send(JSON.stringify({
                    type: 'room-created',
                    roomId: roomId
                }));
                console.log(`Room created: ${roomId} by client: ${clientId}`);
                return;
            }

            if (message.type === 'join-room') {
                const room = rooms.get(message.roomId);
                if (room) {
                    room.add(clientId);
                    ws.send(JSON.stringify({
                        type: 'joined-room',
                        roomId: message.roomId
                    }));
                    console.log(`Client ${clientId} joined room: ${message.roomId}`);
                } else {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Room not found'
                    }));
                }
                return;
            }

            // Broadcast to all other clients (simple room)
            clients.forEach((client, id) => {
                if (id !== clientId && client.readyState === WebSocket.OPEN) {
                    // Forward the message with sender info
                    const forwardedMessage = {
                        ...message,
                        from: clientId
                    };
                    client.send(JSON.stringify(forwardedMessage));
                }
            });
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected:', clientId);
        clients.delete(clientId);
        // Fix: below code is causing UI to still remain in call after room is deleted
        // rooms.forEach((room, roomId) => {
        //     room.delete(clientId);
        //     console.log(roomId, room, room.size);
        //     if (room.size === 0) {
        //         rooms.delete(roomId);
        //         console.log(`Room deleted: ${roomId}`);
        //     }
        // });

        // Notify other clients about disconnection
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'peer-disconnected',
                    clientId: clientId
                }));
            }
        });
    });
});