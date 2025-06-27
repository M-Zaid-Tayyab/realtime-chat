const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');

require('dotenv').config();
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(bodyParser.json());

const JWT_SECRET = process.env.NODE_JWT_SECRET;

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
});

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

app.post('/socket-message', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const { id, sender_id, receiver_id, message,attachments, created_at } = req.body;
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
  io.to(receiver_id.toString()).emit('receive_message', payload);
  io.to(sender_id.toString()).emit('receive_message', payload);
  

  return res.json({ status: 'ok', delivered_to: receiver_id });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Socket.IO server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});
