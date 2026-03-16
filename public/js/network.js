/**
 * network.js — WebSocket Networking Module
 * Handles all real-time communication between client and server.
 */

'use strict';

const Network = (() => {
  let socket = null;
  const handlers = {};

  function on(event, fn) {
    handlers[event] = fn;
  }

  function emit(event, data) {
    if (socket && socket.connected) {
      socket.emit(event, data);
    } else {
      console.warn('[Network] Cannot emit, socket not connected:', event);
    }
  }

  function connect() {
    return new Promise((resolve, reject) => {
      // Socket.IO is loaded from CDN in index.html
      socket = io();

      socket.on('connect', () => {
        console.log('[Network] Connected:', socket.id);
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        console.error('[Network] Connection error:', err);
        reject(err);
      });

      socket.on('disconnect', (reason) => {
        console.warn('[Network] Disconnected:', reason);
        if (handlers['disconnect']) handlers['disconnect']({ reason });
      });

      // ── Server Events ────────────────────────────────────────────────
      const serverEvents = [
        'room_created', 'room_joined', 'opponent_joined',
        'game_start', 'move_made', 'game_over',
        'opponent_disconnected', 'rematch_requested', 'rematch_start',
        'chat_message', 'draw_offered', 'draw_declined',
        'timer_sync', 'error'
      ];

      serverEvents.forEach(evt => {
        socket.on(evt, (data) => {
          if (handlers[evt]) handlers[evt](data);
        });
      });
    });
  }

  // ── Public Actions ───────────────────────────────────────────────────────
  return {
    on,
    connect,

    createRoom(playerName, timeControl) {
      emit('create_room', { playerName, timeControl });
    },

    joinRoom(roomId, playerName) {
      emit('join_room', { roomId: roomId.toUpperCase(), playerName });
    },

    makeMove(moveData) {
      emit('make_move', moveData);
    },

    resign() {
      emit('resign');
    },

    requestRematch() {
      emit('request_rematch');
    },

    acceptRematch() {
      emit('accept_rematch');
    },

    sendChat(message) {
      emit('chat_message', { message });
    },

    offerDraw() {
      emit('offer_draw');
    },

    acceptDraw() {
      emit('accept_draw');
    },

    declineDraw() {
      emit('decline_draw');
    },

    timerExpired(color) {
      emit('timer_expired', { color });
    },

    syncTimer(white, black) {
      emit('timer_update', { white, black });
    },

    gameOver(data) {
      emit('game_over', data);
    },

    isConnected() {
      return socket && socket.connected;
    }
  };
})();
