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
const activeStreams = new Map();

io.on('connection', (socket) => {
  console.log('🟢 Socket connected:', socket.id);

  socket.on('join', ({ userId }) => {
    socket.join(userId.toString());
    connectedUsers.set(userId, socket.id);
    console.log(`👤 User ${userId} joined room user_${userId}`);
  });

  socket.on('join_group', ({ groupId }) => {
    socket.join(`group_${groupId}`);
    console.log(`👥 User ${socket.id} joined group_${groupId}`);
  });

  socket.on("join_stream", ({ streamId, isHost = false }) => {
    socket.join(`stream_${streamId}`);
    
    if (!activeStreams.has(streamId)) {
      activeStreams.set(streamId, {
        participants: new Set(),
        hostSocketId: null,
        viewerCount: 0
      });
    }

    const streamData = activeStreams.get(streamId);
    
    if (isHost) {
      streamData.hostSocketId = socket.id;
      streamData.participants.add(socket.id);
      console.log(` Host joined stream_${streamId}. Viewers: ${streamData.viewerCount}`);
    } else {
      streamData.participants.add(socket.id);
      streamData.viewerCount = streamData.participants.size - 1;
      console.log(`👤 Viewer joined stream_${streamId}. Viewers: ${streamData.viewerCount}`);
    }

    socket.streamId = streamId;
    socket.isHost = isHost;

    socket.to(`stream_${streamId}`).emit('viewer_joined', {
      viewerCount: streamData.viewerCount
    });
  });

  socket.on('send_gift', (data) => {
    const { streamId } = data;
    if (streamId) {
      io.to(`stream_${streamId}`).emit('gift_sent');
      console.log(`🎁 Gift sent in stream ${streamId}`);
    }
  });

  socket.on('send_super_like', (data) => {
    const { streamId } = data;
    if (streamId) {
      io.to(`stream_${streamId}`).emit('super_like_sent');
      console.log(` Super like sent in stream ${streamId}`);
    }
  });

  socket.on('end_stream', (data) => {
    const { streamId } = data;
    if (!streamId) return;

    const streamData = activeStreams.get(streamId);
    if (streamData) {
      streamData.hostSocketId = null;
      streamData.viewerCount = 0;
      io.to(`stream_${streamId}`).emit('stream_ended');
      console.log(` Stream ${streamId} ended by host`);
      
      activeStreams.delete(streamId);
    }
  });

  socket.on('leave_stream', (data) => {
    const { streamId } = data;
    if (!streamId) return;

    const streamData = activeStreams.get(streamId);
    if (streamData) {
      streamData.participants.delete(socket.id);
      
      if (socket.isHost) {
        streamData.hostSocketId = null;
        streamData.viewerCount = 0;
        io.to(`stream_${streamId}`).emit('stream_ended');
        console.log(` Stream ${streamId} ended by host`);
      } else {
        streamData.viewerCount = Math.max(0, streamData.participants.size - 1);
        socket.to(`stream_${streamId}`).emit('viewer_left', {
          viewerCount: streamData.viewerCount
        });
        console.log(` Viewer left stream_${streamId}. Viewers: ${streamData.viewerCount}`);
      }

      if (streamData.participants.size === 0) {
        activeStreams.delete(streamId);
        console.log(` Stream ${streamId} cleaned up - no participants left`);
      }
    }

    socket.leave(`stream_${streamId}`);
    delete socket.streamId;
    delete socket.isHost;
  });

  socket.on('disconnect', () => {
    if (socket.streamId) {
      const streamData = activeStreams.get(socket.streamId);
      if (streamData) {
        streamData.participants.delete(socket.id);
        
        if (socket.isHost) {
          streamData.hostSocketId = null;
          streamData.viewerCount = 0;
          io.to(`stream_${socket.streamId}`).emit('stream_ended');
          console.log(`📺 Stream ${socket.streamId} ended - host disconnected`);
        } else {
          streamData.viewerCount = Math.max(0, streamData.participants.size - 1);
          socket.to(`stream_${socket.streamId}`).emit('viewer_left', {
            viewerCount: streamData.viewerCount
          });
          console.log(`👤 Viewer disconnected from stream_${socket.streamId}. Viewers: ${streamData.viewerCount}`);
        }
        if (streamData.participants.size === 0) {
          activeStreams.delete(socket.streamId);
          console.log(` Stream ${socket.streamId} cleaned up - no participants left`);
        }
      }
    }

    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        break;
      }
    }
    console.log(`🔴 Socket disconnected: ${socket.id}`);
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

  const { id, sender_id, receiver_id, group_id, message, attachments, created_at, stream_id } = req.body;
  
  if (group_id) {
    if (!group_id || !message) {
      return res.status(400).json({ status: 'error', message: 'Missing group_id or message' });
    }

    const sender_name = req.body.sender_name;
    const sender_profile_image = req.body.sender_profile_image;

    const payload = {
      id,
      sender_id,
      sender_name,
      sender_profile_image,
      group_id,
      message,
      attachments,
      created_at,
      isGroup: true
    };
    
    io.to(`group_${group_id}`).emit('receive_message', payload);
    return res.json({ status: 'ok', delivered_to: `group_${group_id}` });
  } else if (stream_id) {
    if (!stream_id || !message) {
      return res.status(400).json({ status: 'error', message: 'Missing stream_id or message' });
    }

    const sender_name = req.body.sender_name;
    const sender_profile_image = req.body.sender_profile_image;

    const payload = {
      id,
      stream_id,
      sender_id,
      sender_name,
      sender_profile_image,
      receiver_id,
      message,
      attachments,
      created_at,
      isStream: true
    };
    
    io.to(`stream_${stream_id}`).emit('receive_message', payload);
    return res.json({ status: 'ok', delivered_to: `stream_${stream_id}` });
  } else {
    if (!receiver_id || !message) {
      return res.status(400).json({ status: 'error', message: 'Missing receiver_id or message' });
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
    return res.json({ status: 'ok', delivered_to: receiver_id });
  }
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Socket.IO server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});
