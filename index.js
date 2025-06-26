const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');


const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(bodyParser.json());

require('dotenv').config();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.NODE_JWT_SECRET;

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Track connected users (optional for typing/online status)
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);

  socket.on('join', ({ userId }) => {
    socket.join(userId.toString());
    connectedUsers.set(userId, socket.id);
    console.log(`👤 User ${userId} joined room user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔴 User disconnected:', socket.id);
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        break;
      }
    }
  });
});

// Laravel POSTs to this endpoint to trigger real-time messages
app.post('/socket-message', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { id, sender_id, receiver_id, message,attachments, created_at } = req.body;

  console.log('token:',token);
  if (!receiver_id || !message) {
    return res.status(400).json({ status: 'error', message: 'Missing data' });
  }

  const payload = {
    id,
    sender_id,
    receiver_id,
    message,
    attachments,
    created_at,
  };

  console.log('📨 New message from Laravel:', payload);

  // Emit to the specific user's room
  io.to(receiver_id.toString()).emit('receive_message', payload);

  return res.json({ status: 'ok', delivered_to: receiver_id });
});

server.listen(3001, () => {
  console.log('✅ Socket.IO server running at http://localhost:3001');
});
