/**
 * server.js — Main server entry point
 * Handles HTTP serving and WebSocket connections for real-time chess.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Game State Store ────────────────────────────────────────────────────────
// rooms: { [roomId]: RoomState }
const rooms = {};

function createRoom(roomId) {
  return {
    id: roomId,
    players: [],      // [{ id, name, color }]
    spectators: [],
    gameStarted: false,
    fen: null,        // Current position as FEN (managed client-side, echoed here)
    moveHistory: [],  // Array of move objects
    chat: [],
    timers: {
      white: null,
      black: null,
      increment: 0,
      lastTick: null,
      activeColor: 'white',
      running: false
    },
    timeControl: null, // { minutes, increment }
    createdAt: Date.now()
  };
}

// ─── Socket.IO Event Handlers ────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ── Create Room ──────────────────────────────────────────────────────────
  socket.on('create_room', ({ playerName, timeControl }) => {
    const roomId = generateRoomCode();
    const room = createRoom(roomId);

    // First player is White
    const player = { id: socket.id, name: playerName || 'Player 1', color: 'white' };
    room.players.push(player);
    room.timeControl = timeControl || null;

    if (timeControl && timeControl.minutes > 0) {
      const secs = timeControl.minutes * 60;
      room.timers.white = secs;
      room.timers.black = secs;
      room.timers.increment = timeControl.increment || 0;
    }

    rooms[roomId] = room;
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = 'white';
    socket.data.name = playerName;

    socket.emit('room_created', {
      roomId,
      color: 'white',
      playerName: player.name,
      timeControl
    });
    console.log(`[Room] Created: ${roomId} by ${playerName}`);
  });

  // ── Join Room ────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomId, playerName }) => {
    const room = rooms[roomId];

    if (!room) {
      socket.emit('error', { message: 'Room not found. Check the code and try again.' });
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full. You can spectate instead.' });
      return;
    }
    if (room.gameStarted) {
      socket.emit('error', { message: 'Game already in progress.' });
      return;
    }

    const player = { id: socket.id, name: playerName || 'Player 2', color: 'black' };
    room.players.push(player);

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = 'black';
    socket.data.name = playerName;

    // Notify joiner
    socket.emit('room_joined', {
      roomId,
      color: 'black',
      playerName: player.name,
      opponentName: room.players[0].name,
      timeControl: room.timeControl
    });

    // Notify the room creator
    io.to(roomId).emit('opponent_joined', {
      playerName: player.name,
      color: 'black'
    });

    // Start the game!
    room.gameStarted = true;
    io.to(roomId).emit('game_start', {
      white: room.players[0].name,
      black: room.players[1].name,
      timeControl: room.timeControl,
      timers: { white: room.timers.white, black: room.timers.black }
    });

    console.log(`[Room] ${roomId}: ${room.players[0].name} vs ${player.name}`);
  });

  // ── Make Move ────────────────────────────────────────────────────────────
  socket.on('make_move', (moveData) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;

    // Record move
    room.moveHistory.push(moveData);
    room.fen = moveData.fen;

    // Handle timer tick
    if (room.timers.running && room.timeControl) {
      const color = moveData.color; // color that just moved
      if (room.timers.increment > 0) {
        room.timers[color] += room.timers.increment;
      }
      room.timers.activeColor = color === 'white' ? 'black' : 'white';
      room.timers.lastTick = Date.now();
    } else if (room.timeControl && room.timers.white !== null) {
      // Start timer on first move
      room.timers.running = true;
      room.timers.activeColor = 'black'; // white just moved, black's turn
      room.timers.lastTick = Date.now();
    }

    // Broadcast to the other player
    socket.to(roomId).emit('move_made', {
      ...moveData,
      timers: { white: room.timers.white, black: room.timers.black }
    });
  });

  // ── Timer Tick (client-driven updates for accuracy) ──────────────────────
  socket.on('timer_update', ({ white, black }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    room.timers.white = white;
    room.timers.black = black;
    socket.to(roomId).emit('timer_sync', { white, black });
  });

  // ── Timer Expired ────────────────────────────────────────────────────────
  socket.on('timer_expired', ({ color }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    io.to(roomId).emit('game_over', {
      reason: 'timeout',
      winner: color === 'white' ? 'black' : 'white',
      message: `${color === 'white' ? 'White' : 'Black'} ran out of time!`
    });
  });

  // ── Game Over (checkmate/stalemate) ──────────────────────────────────────
  socket.on('game_over', (data) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    room.timers.running = false;
    socket.to(roomId).emit('game_over', data);
  });

  // ── Resign ───────────────────────────────────────────────────────────────
  socket.on('resign', () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    const color = socket.data.color;
    const winner = color === 'white' ? 'black' : 'white';
    room.timers.running = false;
    io.to(roomId).emit('game_over', {
      reason: 'resignation',
      winner,
      message: `${color === 'white' ? 'White' : 'Black'} resigned.`
    });
  });

  // ── Request Rematch ──────────────────────────────────────────────────────
  socket.on('request_rematch', () => {
    const roomId = socket.data.roomId;
    socket.to(roomId).emit('rematch_requested', { from: socket.data.color });
  });

  socket.on('accept_rematch', () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;

    // Reset room state
    room.moveHistory = [];
    room.fen = null;
    room.gameStarted = true;

    // Swap colors
    room.players.forEach(p => {
      p.color = p.color === 'white' ? 'black' : 'white';
    });

    if (room.timeControl && room.timeControl.minutes > 0) {
      const secs = room.timeControl.minutes * 60;
      room.timers.white = secs;
      room.timers.black = secs;
      room.timers.running = false;
      room.timers.activeColor = 'white';
    }

    // Update socket data colors
    const myPlayer = room.players.find(p => p.id === socket.id);
    const oppPlayer = room.players.find(p => p.id !== socket.id);
    if (myPlayer) socket.data.color = myPlayer.color;

    io.to(roomId).emit('rematch_start', {
      white: room.players.find(p => p.color === 'white')?.name,
      black: room.players.find(p => p.color === 'black')?.name,
      timeControl: room.timeControl,
      timers: { white: room.timers.white, black: room.timers.black }
    });
  });

  // ── Chat ─────────────────────────────────────────────────────────────────
  socket.on('chat_message', ({ message }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || !message.trim()) return;

    const chatEntry = {
      sender: socket.data.name || 'Player',
      color: socket.data.color,
      message: message.slice(0, 200), // limit length
      timestamp: Date.now()
    };
    room.chat.push(chatEntry);
    io.to(roomId).emit('chat_message', chatEntry);
  });

  // ── Draw Offer ───────────────────────────────────────────────────────────
  socket.on('offer_draw', () => {
    const roomId = socket.data.roomId;
    socket.to(roomId).emit('draw_offered', { from: socket.data.color });
  });

  socket.on('accept_draw', () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;
    room.timers.running = false;
    io.to(roomId).emit('game_over', {
      reason: 'draw',
      winner: null,
      message: 'Draw by agreement.'
    });
  });

  socket.on('decline_draw', () => {
    const roomId = socket.data.roomId;
    socket.to(roomId).emit('draw_declined');
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Socket disconnected: ${socket.id}`);
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;

    room.timers.running = false;
    socket.to(roomId).emit('opponent_disconnected', {
      message: `${socket.data.name || 'Your opponent'} disconnected.`
    });

    // Clean up room after delay
    setTimeout(() => {
      if (rooms[roomId]) {
        const stillConnected = rooms[roomId].players.some(p => {
          const s = io.sockets.sockets.get(p.id);
          return s && s.connected;
        });
        if (!stillConnected) {
          delete rooms[roomId];
          console.log(`[Room] Cleaned up: ${roomId}`);
        }
      }
    }, 30000);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure unique
  return rooms[code] ? generateRoomCode() : code;
}

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n♟  Chess Online Server running at http://localhost:${PORT}\n`);
});
