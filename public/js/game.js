/**
 * game.js — Main Game Controller
 * Orchestrates the chess engine, UI, and networking modules.
 * Handles all game flow: lobby, game start, moves, timers, game over.
 */

'use strict';

const Game = (() => {

  // ─── State ────────────────────────────────────────────────────────────────
  let myColor = null;        // 'white' or 'black'
  let myName = '';
  let opponentName = '';
  let roomId = null;
  let gameState = null;       // Chess engine state
  let positionHistory = [];   // For threefold repetition
  let moveNumber = 1;
  let timeControl = null;
  let timers = { white: null, black: null };
  let timerInterval = null;
  let gameOver = false;
  let lastTimerSync = Date.now();

  // ─── Initialization ───────────────────────────────────────────────────────
  async function init() {
    await Network.connect();

    UI.createBoard();
    setupNetworkHandlers();
    setupUIHandlers();
    UI.showScreen('lobby-screen');

    console.log('[Game] Initialized');
  }

  // ─── Network Event Handlers ───────────────────────────────────────────────
  function setupNetworkHandlers() {

    Network.on('room_created', (data) => {
      roomId = data.roomId;
      myColor = data.color;
      myName = data.playerName;
      timeControl = data.timeControl;

      document.getElementById('room-code-display').textContent = data.roomId;
      document.getElementById('room-code-display').style.display = 'inline';
      document.getElementById('share-code-section').style.display = 'block';
      document.getElementById('waiting-msg').style.display = 'block';
      UI.showStatus('Waiting for opponent...', 'waiting');
    });

    Network.on('room_joined', (data) => {
      roomId = data.roomId;
      myColor = data.color;
      myName = data.playerName;
      opponentName = data.opponentName;
      timeControl = data.timeControl;
    });

    Network.on('opponent_joined', (data) => {
      UI.addSystemMessage(`${data.playerName} joined as ${data.color}.`);
    });

    Network.on('game_start', (data) => {
      opponentName = myColor === 'white' ? data.black : data.white;
      timers.white = data.timers?.white ?? null;
      timers.black = data.timers?.black ?? null;
      startGame();
    });

    Network.on('rematch_start', (data) => {
      // Swap colors
      myColor = myColor === 'white' ? 'black' : 'white';
      opponentName = myColor === 'white' ? data.black : data.white;
      timers.white = data.timers?.white ?? null;
      timers.black = data.timers?.black ?? null;
      startGame();
    });

    Network.on('move_made', (data) => {
      // Opponent made a move — apply it
      receiveMove(data);
    });

    Network.on('game_over', (data) => {
      endGame(data);
    });

    Network.on('opponent_disconnected', (data) => {
      stopTimer();
      UI.showStatus(data.message, 'warning');
      UI.addSystemMessage(data.message);
      UI.setGameActive(false);
      document.getElementById('rematch-btn').style.display = 'none';
    });

    Network.on('rematch_requested', (data) => {
      const accept = confirm(`${opponentName} wants a rematch! Accept?`);
      if (accept) {
        Network.acceptRematch();
      }
    });

    Network.on('chat_message', (data) => {
      UI.addChatMessage(data.sender, data.message, data.color);
    });

    Network.on('draw_offered', (data) => {
      UI.addSystemMessage(`${opponentName} offers a draw.`);
      document.getElementById('draw-response').style.display = 'flex';
    });

    Network.on('draw_declined', () => {
      UI.addSystemMessage('Draw offer declined.');
    });

    Network.on('timer_sync', (data) => {
      timers.white = data.white;
      timers.black = data.black;
      UI.updateTimerDisplay(timers.white, timers.black);
    });

    Network.on('error', (data) => {
      UI.showStatus(data.message, 'error');
      setTimeout(() => UI.hideStatus(), 4000);
    });
  }

  // ─── UI Event Handlers ────────────────────────────────────────────────────
  function setupUIHandlers() {

    // Lobby — Create Room
    document.getElementById('create-room-btn').addEventListener('click', () => {
      const name = document.getElementById('player-name-input').value.trim() || 'Player 1';
      const tc = getTimeControl();
      myName = name;
      Network.createRoom(name, tc);
    });

    // Lobby — Join Room
    document.getElementById('join-room-btn').addEventListener('click', () => {
      const name = document.getElementById('player-name-input').value.trim() || 'Player 2';
      const code = document.getElementById('room-code-input').value.trim().toUpperCase();
      if (!code) { UI.showStatus('Enter a room code to join.', 'error'); return; }
      myName = name;
      Network.joinRoom(code, name);
    });

    // Copy room code
    document.getElementById('copy-code-btn')?.addEventListener('click', () => {
      const code = document.getElementById('room-code-display').textContent;
      navigator.clipboard?.writeText(code).then(() => {
        document.getElementById('copy-code-btn').textContent = 'Copied!';
        setTimeout(() => document.getElementById('copy-code-btn').textContent = 'Copy', 2000);
      });
    });

    // In-game — Resign
    document.getElementById('resign-btn').addEventListener('click', () => {
      if (gameOver) return;
      if (confirm('Are you sure you want to resign?')) {
        Network.resign();
      }
    });

    // Rematch
    document.getElementById('rematch-btn').addEventListener('click', () => {
      Network.requestRematch();
      UI.addSystemMessage('Rematch requested...');
    });

    // Flip board
    document.getElementById('flip-btn').addEventListener('click', () => {
      UI.flipBoard();
    });

    // Draw offer
    document.getElementById('draw-btn').addEventListener('click', () => {
      Network.offerDraw();
      UI.addSystemMessage('Draw offered...');
    });

    // Draw response
    document.getElementById('accept-draw-btn')?.addEventListener('click', () => {
      Network.acceptDraw();
      document.getElementById('draw-response').style.display = 'none';
    });
    document.getElementById('decline-draw-btn')?.addEventListener('click', () => {
      Network.declineDraw();
      document.getElementById('draw-response').style.display = 'none';
      UI.addSystemMessage('Draw declined.');
    });

    // Chat
    const chatInput = document.getElementById('chat-input');
    document.getElementById('chat-send-btn').addEventListener('click', sendChat);
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChat();
    });

    // Theme buttons
    UI.getThemes().forEach(({ id, name }) => {
      const btn = document.getElementById(`theme-${id}`);
      if (btn) {
        btn.addEventListener('click', () => UI.applyTheme(id));
      }
    });

    // Settings toggle
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      const panel = document.getElementById('settings-panel');
      if (panel) panel.classList.toggle('open');
    });

    // Board flipping
    document.getElementById('flip-board-check')?.addEventListener('change', (e) => {
      if (e.target.checked) UI.flipBoard();
      else UI.flipBoard();
    });

    // Piece move callback
    UI.onMove(async (move) => {
      await handleMyMove(move);
    });
  }

  function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input?.value.trim();
    if (msg) {
      Network.sendChat(msg);
      UI.addChatMessage(myName, msg, myColor);
      input.value = '';
    }
  }

  function getTimeControl() {
    const val = document.getElementById('time-control-select')?.value;
    if (!val || val === '0') return { minutes: 0, increment: 0 };
    const [m, inc] = val.split('+').map(Number);
    return { minutes: m, increment: inc || 0 };
  }

  // ─── Game Start ───────────────────────────────────────────────────────────
  function startGame() {
    gameOver = false;
    gameState = ChessEngine.newGame();
    window.gameState = gameState;
    positionHistory = [];
    moveNumber = 1;

    UI.setMyColor(myColor);
    UI.setGameActive(true);
    UI.setPlayerNames(
      myColor === 'white' ? myName : opponentName,
      myColor === 'black' ? myName : opponentName
    );
    UI.clearMoveHistory();
    UI.hideStatus();
    UI.updateTimerDisplay(timers.white, timers.black);
    UI.renderBoard(gameState.board);
    UI.setTurnIndicator('w', myColor);
    UI.updateCapturedPieces(gameState.board);
    UI.playSound('start');

    // Show game screen
    UI.showScreen('game-screen');

    // Setup timers if time control
    if (timers.white !== null) {
      document.getElementById('timers-section').style.display = 'flex';
    } else {
      document.getElementById('timers-section').style.display = 'none';
    }

    stopTimer();
    console.log(`[Game] Started — I am ${myColor}`);
  }

  // ─── Handle My Move ───────────────────────────────────────────────────────
  async function handleMyMove(move) {
    if (gameOver) return;
    if (gameState.turn !== myColor[0]) return;

    // Handle promotion
    let finalMove = move;
    if (move.promotion && !move.promotion) {
      finalMove = { ...move, promotion: 'q' }; // Default
    } else if (move.promotion) {
      // Multiple promotion moves — need player to choose
      const promos = ChessEngine.getLegalTargets(gameState, move.from.row, move.from.col)
        .filter(t => t.row === move.to.row && t.col === move.to.col);

      if (promos.length > 1) {
        const chosen = await UI.showPromotionDialog(myColor);
        finalMove = promos.find(t => t.move.promotion === chosen)?.move || move;
      }
    }

    const san = ChessEngine.moveToSan(gameState, finalMove);
    const newState = ChessEngine.applyMove(gameState, finalMove);
    const fen = ChessEngine.boardToFen(newState);

    // Update local state
    const fromSq = finalMove.from;
    const toSq = finalMove.to;
    gameState = newState;
    window.gameState = gameState;
    positionHistory.push(fen.split(' ').slice(0, 4).join(' '));

    // Update UI
    UI.renderBoard(gameState.board);
    UI.highlightLastMove(fromSq, toSq);
    UI.setLastMove(fromSq, toSq);
    UI.updateCapturedPieces(gameState.board);

    // Sound
    const soundType = finalMove.castle ? 'castle'
      : finalMove.enPassant || newState.board[toSq.row]?.[toSq.col] !== gameState.board[toSq.row]?.[toSq.col]
        ? 'capture' : 'move';
    UI.playSound(finalMove.promotion ? 'promote' : soundType);

    // Move history
    const color = myColor === 'white' ? 'w' : 'b';
    if (color === 'w') {
      UI.addMoveToHistory(san, moveNumber, 'w');
    } else {
      UI.addMoveToHistory(san, moveNumber, 'b');
      moveNumber++;
    }

    // Timer: hand off to opponent
    if (timers.white !== null) {
      if (timerInterval === null) {
        // First move starts the clock for opponent
      }
      startTimerFor(myColor === 'white' ? 'black' : 'white');
    }

    // Check game status
    const status = ChessEngine.getGameStatus(gameState, positionHistory);
    handleGameStatus(status);

    // Send move to server
    Network.makeMove({
      from: fromSq,
      to: toSq,
      piece: finalMove.piece,
      promotion: finalMove.promotion || null,
      san,
      fen,
      color: myColor,
      castle: finalMove.castle || null,
      enPassant: finalMove.enPassant || false
    });

    UI.setTurnIndicator(gameState.turn, myColor);
    UI.clearSelection();
  }

  // ─── Receive Opponent Move ─────────────────────────────────────────────────
  function receiveMove(data) {
    if (gameOver) return;

    const { from, to, promotion, san, fen, castle, enPassant } = data;

    // Find the actual move object
    const legalMoves = ChessEngine.getAllLegalMoves(gameState);
    let move = legalMoves.find(m => {
      if (m.from.row !== from.row || m.from.col !== from.col) return false;
      if (m.to.row !== to.row || m.to.col !== to.col) return false;
      if (promotion && m.promotion !== promotion) return false;
      return true;
    });

    if (!move) {
      console.error('[Game] Received invalid move:', data);
      return;
    }

    const newState = ChessEngine.applyMove(gameState, move);
    gameState = newState;
    window.gameState = gameState;
    positionHistory.push(ChessEngine.boardToFen(gameState).split(' ').slice(0, 4).join(' '));

    // Update UI
    UI.renderBoard(gameState.board);
    UI.highlightLastMove(from, to);
    UI.setLastMove(from, to);
    UI.updateCapturedPieces(gameState.board);

    // Sound
    const soundType = castle ? 'castle'
      : enPassant ? 'capture'
      : gameState.board[to.row]?.[to.col] ? 'capture'
      : 'move';
    UI.playSound(promotion ? 'promote' : soundType);

    // Move history
    const opColor = myColor === 'white' ? 'b' : 'w';
    if (opColor === 'w') {
      UI.addMoveToHistory(san, moveNumber, 'w');
    } else {
      UI.addMoveToHistory(san, moveNumber, 'b');
      moveNumber++;
    }

    // Update timers from server
    if (data.timers && timers.white !== null) {
      timers.white = data.timers.white;
      timers.black = data.timers.black;
      UI.updateTimerDisplay(timers.white, timers.black);
      startTimerFor(myColor);
    }

    // Check game status
    const status = ChessEngine.getGameStatus(gameState, positionHistory);
    handleGameStatus(status);

    UI.setTurnIndicator(gameState.turn, myColor);
  }

  // ─── Game Status Handler ──────────────────────────────────────────────────
  function handleGameStatus(status) {
    if (status.status === 'check') {
      // Find king position
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = gameState.board[r][c];
          if (p && (p === 'K' || p === 'k') && ChessEngine.pieceColor(p) === gameState.turn) {
            UI.highlightCheck(r, c);
          }
        }
      }
      UI.playSound('check');
      UI.showStatus('Check!', 'check');
    } else {
      UI.highlightCheck();
      UI.hideStatus();
    }

    if (status.status === 'checkmate') {
      const winner = status.winner === 'w' ? 'White' : 'Black';
      const loser = status.winner === 'w' ? 'Black' : 'White';
      Network.gameOver({ reason: 'checkmate', winner: status.winner === 'w' ? 'white' : 'black', message: `Checkmate! ${winner} wins!` });
      endGame({ reason: 'checkmate', winner: status.winner === 'w' ? 'white' : 'black', message: `Checkmate! ${winner} wins!` });
    } else if (status.status === 'stalemate') {
      Network.gameOver({ reason: 'stalemate', winner: null, message: 'Stalemate! Draw.' });
      endGame({ reason: 'stalemate', winner: null, message: 'Stalemate! Draw.' });
    } else if (status.status === 'draw') {
      Network.gameOver({ reason: 'draw', winner: null, message: `Draw by ${status.reason}.` });
      endGame({ reason: 'draw', winner: null, message: `Draw by ${status.reason}.` });
    }
  }

  // ─── Game Over ────────────────────────────────────────────────────────────
  function endGame(data) {
    if (gameOver) return;
    gameOver = true;
    stopTimer();
    UI.setGameActive(false);

    const { reason, winner, message } = data;
    let statusType = 'info';

    if (winner) {
      const iWin = winner === myColor;
      statusType = iWin ? 'win' : 'loss';
      UI.playSound('gameover');
    } else {
      statusType = 'draw';
    }

    UI.showStatus(message || 'Game over!', statusType);
    UI.addSystemMessage(`Game over: ${message}`);

    // Show rematch button
    document.getElementById('rematch-btn').style.display = 'inline-flex';

    console.log('[Game] Over:', message);
  }

  // ─── Timer Logic ──────────────────────────────────────────────────────────
  function startTimerFor(color) {
    stopTimer();
    if (timers.white === null) return;

    const interval = 100; // 100ms ticks for smooth display
    timerInterval = setInterval(() => {
      timers[color] -= interval / 1000;

      if (timers[color] <= 0) {
        timers[color] = 0;
        UI.updateTimerDisplay(timers.white, timers.black);
        stopTimer();
        Network.timerExpired(color);
        endGame({
          reason: 'timeout',
          winner: color === 'white' ? 'black' : 'white',
          message: `${color === 'white' ? 'White' : 'Black'} ran out of time!`
        });
        return;
      }

      UI.updateTimerDisplay(timers.white, timers.black);

      // Sync every 5 seconds
      if (Date.now() - lastTimerSync > 5000) {
        Network.syncTimer(timers.white, timers.black);
        lastTimerSync = Date.now();
      }
    }, interval);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return { init };

})();

// Boot when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  Game.init().catch(err => {
    console.error('[Game] Init failed:', err);
    document.body.innerHTML = '<div style="padding:2rem;color:red;font-family:monospace">Failed to connect to server. Make sure the server is running at the same address.</div>';
  });
});
