require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const boardsRouter = require('./routes/boards');

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ai-whiteboard';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // large limit for base64 thumbnails

app.use('/api/boards', boardsRouter);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// In-memory presence tracking per board room: { boardId: Set(userName) }
const presence = {};

io.on('connection', (socket) => {
  let currentBoard = null;
  let currentUser = null;

  socket.on('join-board', ({ boardId, user }) => {
    currentBoard = boardId;
    currentUser = user || `Guest-${socket.id.slice(0, 4)}`;
    socket.join(boardId);

    if (!presence[boardId]) presence[boardId] = new Set();
    presence[boardId].add(currentUser);

    io.to(boardId).emit('presence-update', Array.from(presence[boardId]));
    socket.to(boardId).emit('user-joined', currentUser);
  });

  // Broadcast a single stroke segment to everyone else in the room, in real time
  socket.on('draw', ({ boardId, stroke }) => {
    socket.to(boardId).emit('draw', stroke);
  });

  // Broadcast a full canvas clear
  socket.on('clear', ({ boardId }) => {
    socket.to(boardId).emit('clear');
  });

  // Cursor position broadcast (for showing collaborators' pointers)
  socket.on('cursor-move', ({ boardId, user, x, y }) => {
    socket.to(boardId).emit('cursor-move', { user, x, y });
  });

  socket.on('disconnect', () => {
    if (currentBoard && presence[currentBoard]) {
      presence[currentBoard].delete(currentUser);
      io.to(currentBoard).emit('presence-update', Array.from(presence[currentBoard]));
      socket.to(currentBoard).emit('user-left', currentUser);
    }
  });
});

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    
    // Still start the server so drawing/collab works even if persistence is unavailable
    server.listen(PORT, () =>
      console.log(`Server running on port ${PORT} (WITHOUT database persistence)`)
    );
  });
