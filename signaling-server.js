import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080, host: '0.0.0.0' });

const clients = new Map();

console.log('WebRTC Signaling Server running');

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  const clientId = Date.now().toString();
  clients.set(clientId, ws);
  
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId: clientId,
    connected: Array.from(clients.keys()).length
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('Received:', message.type, 'from client:', clientId);
      
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