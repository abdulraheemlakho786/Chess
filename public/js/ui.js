/**
 * ui.js — User Interface Module
 * Handles board rendering, drag-and-drop, themes, piece styles,
 * move highlighting, captured pieces, move history, chat, timers.
 */

'use strict';

const UI = (() => {

  // ─── State ────────────────────────────────────────────────────────────────
  let myColor = 'white';
  let flipped = false;
  let selectedSquare = null;
  let legalTargets = [];
  let lastMove = null;
  let currentTheme = 'classic';
  let currentPieceSet = 'neo';
  let onMoveCallback = null;
  let promotionResolver = null;
  let gameActive = false;

  // ─── Board Themes ─────────────────────────────────────────────────────────
  const THEMES = {
    classic: {
      name: 'Classic Wood',
      light: '#f0d9b5',
      dark: '#b58863',
      highlight: 'rgba(20,85,30,0.5)',
      lastMove: 'rgba(20,85,30,0.3)',
      check: 'rgba(220,30,30,0.6)',
      selected: 'rgba(20,85,30,0.5)',
      border: '#8b6914'
    },
    marble: {
      name: 'Marble',
      light: '#e8e0d0',
      dark: '#9e9a94',
      highlight: 'rgba(70,130,180,0.5)',
      lastMove: 'rgba(70,130,180,0.3)',
      check: 'rgba(220,30,30,0.6)',
      selected: 'rgba(70,130,180,0.5)',
      border: '#7a7068'
    },
    green: {
      name: 'Green Tournament',
      light: '#eeeed2',
      dark: '#769656',
      highlight: 'rgba(235,210,5,0.5)',
      lastMove: 'rgba(235,210,5,0.4)',
      check: 'rgba(220,30,30,0.6)',
      selected: 'rgba(235,210,5,0.5)',
      border: '#5a7340'
    },
    dark: {
      name: 'Dark Modern',
      light: '#4a4a5a',
      dark: '#2a2a3a',
      highlight: 'rgba(120,180,255,0.5)',
      lastMove: 'rgba(120,180,255,0.3)',
      check: 'rgba(220,30,30,0.6)',
      selected: 'rgba(120,180,255,0.5)',
      border: '#1a1a2a'
    },
    ocean: {
      name: 'Ocean Blue',
      light: '#b0c4d8',
      dark: '#4a7aaa',
      highlight: 'rgba(255,220,50,0.5)',
      lastMove: 'rgba(255,220,50,0.3)',
      check: 'rgba(220,30,30,0.6)',
      selected: 'rgba(255,220,50,0.5)',
      border: '#2a5a8a'
    }
  };

  // ─── Piece Sets (SVG Unicode fallback + CSS-based sets) ───────────────────
  // Using Unicode chess pieces as primary, with SVG for styled sets
  const PIECE_UNICODE = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
  };

  // SVG piece definitions - inline SVGs for crisp rendering
  // Based on the classic Staunton / Merida style (public domain)
  const PIECE_SVG = {
    // White pieces
    wK: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-width="2" stroke-linecap="square"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V17s-5.5-5.5-10.5 0c-3 5.5 5 10.5 5 10.5v7" fill="#fff"/><path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0"/></g></svg>`,
    wQ: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/><path d="M9 26c8.5-8.5 15.5-8.5 24 0l-5-3c-4-5-10-5-14 0z"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 3 16.5 3 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c4-1.5 17-1.5 21 0"/></g></svg>`,
    wR: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23"/></g></svg>`,
    wB: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g stroke="none" fill="#000"><circle cx="36" cy="36" r="3.5"/><circle cx="9" cy="36" r="3.5"/></g><path d="M15 32s4.5-2.5 9-2.5 9 2.5 9 2.5M17.5 26h10M15 22l2.5 4h10l2.5-4M22.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke-linecap="butt"/><path d="M17.5 26L8.5 38h28L27.5 26" stroke-linecap="butt"/><path d="M22.5 8C22.5 10 25 15 25 15c3 3 3.5 4 3 7 1.5 1 2.5 3.5 2.5 6l-4-4-3 4h-2l-3-4-4 4c0-2.5 1-5 2.5-6-.5-3 0-4 3-7 0 0 2.5-5 2.5-7"/><path d="M9.5 25.5a20 20 0 0 1 26 0"/></g></svg>`,
    wN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff"/><path d="M24 18c.38 5.12-5.5 7.63-8 9c-2.5 1.5-3.51 3.95-3.51 3.95l-5.27-1.52c4.38-3.78 8.97-1.88 13.02-9.03c-5.93 2.04-4.23-8.59-4.23-8.59S22 10 24 18z"/><path d="M9.5 25.5a.5 3 0 1 0 1 0" fill="#000"/></g></svg>`,
    wP: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M22.5 9c-5 0-8 3-8 7 0 2.5 1.5 4 4 5l-3 3H11v4h23v-4h-4.5l-3-3c2.5-1 4-2.5 4-5 0-4-3-7-8-7z"/><path d="M11 39h23" stroke-linecap="butt"/></g></svg>`,
    // Black pieces (same shapes, dark fill)
    bK: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#1a1a1a" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke="#fff" stroke-width="2" stroke-linecap="square"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V17s-5.5-5.5-10.5 0c-3 5.5 5 10.5 5 10.5v7"/><path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" stroke="#fff"/></g></svg>`,
    bQ: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#1a1a1a" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/><path d="M9 26c8.5-8.5 15.5-8.5 24 0l-5-3c-4-5-10-5-14 0z"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 3 16.5 3 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c4-1.5 17-1.5 21 0" stroke="#fff"/></g></svg>`,
    bR: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#1a1a1a" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23"/></g></svg>`,
    bB: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#1a1a1a" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g stroke="none" fill="#555"><circle cx="36" cy="36" r="3.5"/><circle cx="9" cy="36" r="3.5"/></g><path d="M15 32s4.5-2.5 9-2.5 9 2.5 9 2.5M17.5 26h10M15 22l2.5 4h10l2.5-4M22.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" stroke="#fff" stroke-linecap="butt"/><path d="M17.5 26L8.5 38h28L27.5 26" stroke-linecap="butt"/><path d="M22.5 8C22.5 10 25 15 25 15c3 3 3.5 4 3 7 1.5 1 2.5 3.5 2.5 6l-4-4-3 4h-2l-3-4-4 4c0-2.5 1-5 2.5-6-.5-3 0-4 3-7 0 0 2.5-5 2.5-7"/><path d="M9.5 25.5a20 20 0 0 1 26 0" stroke="#fff"/></g></svg>`,
    bN: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#1a1a1a" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path d="M24 18c.38 5.12-5.5 7.63-8 9c-2.5 1.5-3.51 3.95-3.51 3.95l-5.27-1.52c4.38-3.78 8.97-1.88 13.02-9.03c-5.93 2.04-4.23-8.59-4.23-8.59S22 10 24 18z"/><path d="M9.5 25.5a.5 3 0 1 0 1 0" fill="#fff"/></g></svg>`,
    bP: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#1a1a1a" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M22.5 9c-5 0-8 3-8 7 0 2.5 1.5 4 4 5l-3 3H11v4h23v-4h-4.5l-3-3c2.5-1 4-2.5 4-5 0-4-3-7-8-7z"/><path d="M11 39h23" stroke-linecap="butt"/></g></svg>`,
  };

  // ─── Sound Effects ────────────────────────────────────────────────────────
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new AudioCtx();
    return audioCtx;
  }

  function playSound(type) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const configs = {
        move:    { freq: 440, type: 'sine',   dur: 0.08, vol: 0.15 },
        capture: { freq: 200, type: 'square', dur: 0.15, vol: 0.2  },
        check:   { freq: 600, type: 'sine',   dur: 0.3,  vol: 0.25 },
        castle:  { freq: 350, type: 'sine',   dur: 0.2,  vol: 0.2  },
        promote: { freq: 660, type: 'sine',   dur: 0.4,  vol: 0.3  },
        start:   { freq: 440, type: 'sine',   dur: 0.5,  vol: 0.2  },
        gameover:{ freq: 220, type: 'triangle',dur: 0.8, vol: 0.25 }
      };

      const cfg = configs[type] || configs.move;
      osc.type = cfg.type;
      osc.frequency.setValueAtTime(cfg.freq, ctx.currentTime);
      gain.gain.setValueAtTime(cfg.vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + cfg.dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + cfg.dur);
    } catch (e) { /* Ignore audio errors */ }
  }

  // ─── Piece Rendering ─────────────────────────────────────────────────────
  function getPieceKey(piece) {
    const color = piece === piece.toUpperCase() ? 'w' : 'b';
    return color + piece.toUpperCase();
  }

  function createPieceElement(piece) {
    const key = getPieceKey(piece);
    const el = document.createElement('div');
    el.classList.add('piece');
    el.dataset.piece = piece;
    el.innerHTML = PIECE_SVG[key] || `<span>${PIECE_UNICODE[piece]}</span>`;
    return el;
  }

  // ─── Board Creation ───────────────────────────────────────────────────────
  let squares = []; // 8x8 DOM element grid [row][col]

  function createBoard() {
    const boardEl = document.getElementById('chess-board');
    boardEl.innerHTML = '';
    squares = [];

    for (let r = 0; r < 8; r++) {
      squares[r] = [];
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.classList.add('square');
        sq.dataset.row = r;
        sq.dataset.col = c;
        sq.addEventListener('click', onSquareClick);
        sq.addEventListener('dragover', e => e.preventDefault());
        sq.addEventListener('drop', onDrop);
        boardEl.appendChild(sq);
        squares[r][c] = sq;
      }
    }

    // Add file/rank labels
    renderLabels();
    applyTheme(currentTheme);
  }

  function renderLabels() {
    const boardEl = document.getElementById('chess-board');
    // Remove old labels
    boardEl.querySelectorAll('.label').forEach(l => l.remove());

    const files = flipped ? 'hgfedcba' : 'abcdefgh';
    const ranks = flipped ? '12345678' : '87654321';

    for (let i = 0; i < 8; i++) {
      const sq = squares[7][i];
      const fl = document.createElement('span');
      fl.className = 'label file-label';
      fl.textContent = files[i];
      sq.appendChild(fl);
    }
    for (let i = 0; i < 8; i++) {
      const sq = squares[i][0];
      const rl = document.createElement('span');
      rl.className = 'label rank-label';
      rl.textContent = ranks[i];
      sq.appendChild(rl);
    }
  }

  function renderBoard(board) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const displayRow = flipped ? 7 - r : r;
        const displayCol = flipped ? 7 - c : c;
        const sq = squares[displayRow][displayCol];

        // Remove piece
        const existing = sq.querySelector('.piece');
        if (existing) existing.remove();

        const piece = board[r][c];
        if (piece) {
          const el = createPieceElement(piece);
          el.draggable = true;
          el.addEventListener('dragstart', onDragStart);
          el.addEventListener('touchstart', onTouchStart, { passive: true });
          el.addEventListener('touchmove', onTouchMove, { passive: false });
          el.addEventListener('touchend', onTouchEnd);
          sq.appendChild(el);
        }
      }
    }
  }

  // ─── Square Click Handler ──────────────────────────────────────────────
  function onSquareClick(e) {
    if (!gameActive) return;
    const sq = e.currentTarget;
    const row = parseInt(sq.dataset.row);
    const col = parseInt(sq.dataset.col);
    const [boardRow, boardCol] = displayToBoard(row, col);

    if (selectedSquare) {
      // Try to move
      const target = legalTargets.find(t => {
        const [tr, tc] = displayToBoard(
          flipped ? 7 - t.row : t.row,
          flipped ? 7 - t.col : t.col
        );
        return tr === boardRow && tc === boardCol;
      });

      if (target) {
        onMoveCallback && onMoveCallback(target.move);
        clearSelection();
        return;
      }
    }

    // Select piece
    selectSquare(boardRow, boardCol);
  }

  function selectSquare(boardRow, boardCol) {
    clearSelection();
    const piece = window.gameState?.board[boardRow][boardCol];
    if (!piece) return;
    if (window.gameState.turn !== myColor[0]) return;
    const pieceColor = piece === piece.toUpperCase() ? 'white' : 'black';
    if (pieceColor !== myColor) return;

    selectedSquare = { row: boardRow, col: boardCol };
    legalTargets = window.ChessEngine.getLegalTargets(window.gameState, boardRow, boardCol);

    // Highlight selected
    const [dr, dc] = boardToDisplay(boardRow, boardCol);
    squares[dr][dc].classList.add('selected');

    // Highlight legal targets
    legalTargets.forEach(t => {
      const [dr2, dc2] = boardToDisplay(t.row, t.col);
      const sq = squares[dr2][dc2];
      sq.classList.add(window.gameState.board[t.row][t.col] ? 'legal-capture' : 'legal-move');
    });
  }

  function clearSelection() {
    selectedSquare = null;
    legalTargets = [];
    document.querySelectorAll('.square').forEach(sq => {
      sq.classList.remove('selected', 'legal-move', 'legal-capture');
    });
  }

  // ─── Drag and Drop ────────────────────────────────────────────────────────
  let dragSource = null;

  function onDragStart(e) {
    if (!gameActive) { e.preventDefault(); return; }
    const sq = e.target.closest('.square');
    const row = parseInt(sq.dataset.row);
    const col = parseInt(sq.dataset.col);
    const [boardRow, boardCol] = displayToBoard(row, col);
    const piece = window.gameState?.board[boardRow][boardCol];
    if (!piece) return;
    const pieceColor = piece === piece.toUpperCase() ? 'white' : 'black';
    if (pieceColor !== myColor || window.gameState.turn !== myColor[0]) { e.preventDefault(); return; }

    dragSource = { row: boardRow, col: boardCol };
    selectSquare(boardRow, boardCol);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${boardRow},${boardCol}`);

    // Ghost image
    const ghost = e.target.cloneNode(true);
    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 30, 30);
    setTimeout(() => ghost.remove(), 0);
  }

  function onDrop(e) {
    e.preventDefault();
    if (!dragSource || !gameActive) return;
    const sq = e.currentTarget;
    const row = parseInt(sq.dataset.row);
    const col = parseInt(sq.dataset.col);
    const [boardRow, boardCol] = displayToBoard(row, col);

    const target = legalTargets.find(t => t.row === boardRow && t.col === boardCol);
    if (target) {
      onMoveCallback && onMoveCallback(target.move);
    }
    clearSelection();
    dragSource = null;
  }

  // ─── Touch Drag ───────────────────────────────────────────────────────────
  let touchPiece = null;
  let touchGhost = null;

  function onTouchStart(e) {
    if (!gameActive) return;
    const sq = e.target.closest('.square');
    const row = parseInt(sq.dataset.row);
    const col = parseInt(sq.dataset.col);
    const [boardRow, boardCol] = displayToBoard(row, col);
    const piece = window.gameState?.board[boardRow][boardCol];
    if (!piece) return;
    const pieceColor = piece === piece.toUpperCase() ? 'white' : 'black';
    if (pieceColor !== myColor || window.gameState.turn !== myColor[0]) return;

    touchPiece = { row: boardRow, col: boardCol };
    selectSquare(boardRow, boardCol);

    // Create ghost
    touchGhost = e.target.cloneNode(true);
    touchGhost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;width:60px;height:60px;opacity:0.8;transform:translate(-50%,-50%)`;
    document.body.appendChild(touchGhost);
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (!touchGhost) return;
    const touch = e.touches[0];
    touchGhost.style.left = touch.clientX + 'px';
    touchGhost.style.top = touch.clientY + 'px';
  }

  function onTouchEnd(e) {
    if (!touchPiece || !touchGhost) return;
    touchGhost.remove();
    touchGhost = null;

    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const sq = el?.closest('.square');
    if (!sq) { clearSelection(); touchPiece = null; return; }

    const row = parseInt(sq.dataset.row);
    const col = parseInt(sq.dataset.col);
    const [boardRow, boardCol] = displayToBoard(row, col);

    const target = legalTargets.find(t => t.row === boardRow && t.col === boardCol);
    if (target) {
      onMoveCallback && onMoveCallback(target.move);
    }
    clearSelection();
    touchPiece = null;
  }

  // ─── Coordinate Conversion ────────────────────────────────────────────────
  function displayToBoard(displayRow, displayCol) {
    if (flipped) return [7 - displayRow, 7 - displayCol];
    return [displayRow, displayCol];
  }

  function boardToDisplay(boardRow, boardCol) {
    if (flipped) return [7 - boardRow, 7 - boardCol];
    return [boardRow, boardCol];
  }

  // ─── Highlights ───────────────────────────────────────────────────────────
  function highlightLastMove(from, to) {
    document.querySelectorAll('.last-move').forEach(el => el.classList.remove('last-move'));
    if (!from || !to) return;
    const [fr, fc] = boardToDisplay(from.row, from.col);
    const [tr, tc] = boardToDisplay(to.row, to.col);
    squares[fr][fc]?.classList.add('last-move');
    squares[tr][tc]?.classList.add('last-move');
  }

  function highlightCheck(kingRow, kingCol) {
    document.querySelectorAll('.in-check').forEach(el => el.classList.remove('in-check'));
    if (kingRow === undefined) return;
    const [dr, dc] = boardToDisplay(kingRow, kingCol);
    squares[dr]?.[dc]?.classList.add('in-check');
  }

  // ─── Theme Application ────────────────────────────────────────────────────
  function applyTheme(themeName) {
    currentTheme = themeName;
    const theme = THEMES[themeName] || THEMES.classic;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        squares[r][c].style.background = isLight ? theme.light : theme.dark;
        squares[r][c].dataset.baseColor = isLight ? 'light' : 'dark';
      }
    }

    const root = document.documentElement;
    root.style.setProperty('--sq-highlight', theme.highlight);
    root.style.setProperty('--sq-last-move', theme.lastMove);
    root.style.setProperty('--sq-check', theme.check);
    root.style.setProperty('--sq-selected', theme.selected);
    root.style.setProperty('--board-border', theme.border);

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === themeName);
    });
  }

  // ─── Promotion Dialog ─────────────────────────────────────────────────────
  function showPromotionDialog(color) {
    return new Promise(resolve => {
      promotionResolver = resolve;
      const dialog = document.getElementById('promotion-dialog');
      const pieces = ['q', 'r', 'b', 'n'];
      const container = dialog.querySelector('.promotion-pieces');
      container.innerHTML = '';

      pieces.forEach(p => {
        const btn = document.createElement('div');
        btn.className = 'promo-piece';
        const key = (color === 'white' ? 'w' : 'b') + p.toUpperCase();
        btn.innerHTML = PIECE_SVG[key] || PIECE_UNICODE[color === 'white' ? p.toUpperCase() : p];
        btn.addEventListener('click', () => {
          dialog.classList.remove('visible');
          resolve(p);
        });
        container.appendChild(btn);
      });

      dialog.classList.add('visible');
    });
  }

  // ─── Captured Pieces ──────────────────────────────────────────────────────
  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  function updateCapturedPieces(board) {
    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
    const count = { w: {}, b: {} };
    for (const t of Object.keys(initial)) { count.w[t] = 0; count.b[t] = 0; }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        const color = p === p.toUpperCase() ? 'w' : 'b';
        count[color][p.toLowerCase()]++;
      }
    }

    const wCaptured = [], bCaptured = [];
    let wAdv = 0, bAdv = 0;

    for (const t of Object.keys(initial)) {
      const wMissing = initial[t] - count.w[t];
      const bMissing = initial[t] - count.b[t];
      for (let i = 0; i < wMissing; i++) bCaptured.push({ piece: t, key: 'w' + t.toUpperCase() });
      for (let i = 0; i < bMissing; i++) wCaptured.push({ piece: t, key: 'b' + t.toUpperCase() });
      bAdv += wMissing * PIECE_VALUES[t];
      wAdv += bMissing * PIECE_VALUES[t];
    }

    const renderCaptured = (containerId, pieces, advantage) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = pieces
        .sort((a, b) => PIECE_VALUES[b.piece] - PIECE_VALUES[a.piece])
        .map(p => `<span class="cap-piece">${PIECE_SVG[p.key] || PIECE_UNICODE[p.piece]}</span>`)
        .join('');
      if (advantage > 0) el.innerHTML += `<span class="advantage">+${advantage}</span>`;
    };

    renderCaptured('white-captured', wCaptured, wAdv - bAdv > 0 ? wAdv - bAdv : 0);
    renderCaptured('black-captured', bCaptured, bAdv - wAdv > 0 ? bAdv - wAdv : 0);
  }

  // ─── Move History ─────────────────────────────────────────────────────────
  function addMoveToHistory(san, moveNumber, color) {
    const historyEl = document.getElementById('move-history');
    if (!historyEl) return;

    if (color === 'w') {
      const row = document.createElement('div');
      row.className = 'move-row';
      row.innerHTML = `<span class="move-num">${moveNumber}.</span><span class="move-san white-move">${san}</span><span class="move-san black-move"></span>`;
      historyEl.appendChild(row);
    } else {
      const rows = historyEl.querySelectorAll('.move-row');
      const lastRow = rows[rows.length - 1];
      if (lastRow) {
        lastRow.querySelector('.black-move').textContent = san;
      }
    }

    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function clearMoveHistory() {
    const el = document.getElementById('move-history');
    if (el) el.innerHTML = '';
  }

  // ─── Timer ────────────────────────────────────────────────────────────────
  function formatTime(seconds) {
    if (seconds === null || seconds === undefined) return '∞';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function updateTimerDisplay(white, black) {
    const wel = document.getElementById('timer-white');
    const bel = document.getElementById('timer-black');
    if (wel) wel.textContent = formatTime(white);
    if (bel) bel.textContent = formatTime(black);
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────
  function addChatMessage(sender, message, color) {
    const chatEl = document.getElementById('chat-messages');
    if (!chatEl) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${color}-msg`;
    div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(message)}`;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function addSystemMessage(message) {
    const chatEl = document.getElementById('chat-messages');
    if (!chatEl) return;
    const div = document.createElement('div');
    div.className = 'chat-msg system-msg';
    div.textContent = message;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── UI Updates ───────────────────────────────────────────────────────────
  function setTurnIndicator(turn, myCol) {
    const el = document.getElementById('turn-indicator');
    if (!el) return;
    const isMyTurn = (turn === 'w' && myCol === 'white') || (turn === 'b' && myCol === 'black');
    el.textContent = isMyTurn ? 'Your turn' : "Opponent's turn";
    el.className = 'turn-indicator ' + (isMyTurn ? 'my-turn' : 'opp-turn');
  }

  function showStatus(message, type = 'info') {
    const el = document.getElementById('game-status');
    if (!el) return;
    el.textContent = message;
    el.className = `game-status ${type}`;
    el.style.display = 'block';
  }

  function hideStatus() {
    const el = document.getElementById('game-status');
    if (el) el.style.display = 'none';
  }

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(screenId);
    if (el) el.classList.add('active');
  }

  function setPlayerNames(white, black) {
    const wp = document.getElementById('player-white-name');
    const bp = document.getElementById('player-black-name');
    if (wp) wp.textContent = white || 'White';
    if (bp) bp.textContent = black || 'Black';
  }

  function setGameActive(active) {
    gameActive = active;
  }

  function setMyColor(color) {
    myColor = color;
    flipped = color === 'black';
    renderLabels();
  }

  function flipBoard() {
    flipped = !flipped;
    renderLabels();
    if (window.gameState) {
      renderBoard(window.gameState.board);
      highlightLastMove(lastMove?.from, lastMove?.to);
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    createBoard,
    renderBoard,
    highlightLastMove,
    highlightCheck,
    applyTheme,
    clearSelection,
    selectSquare,
    showPromotionDialog,
    updateCapturedPieces,
    addMoveToHistory,
    clearMoveHistory,
    formatTime,
    updateTimerDisplay,
    addChatMessage,
    addSystemMessage,
    setTurnIndicator,
    showStatus,
    hideStatus,
    showScreen,
    setPlayerNames,
    setGameActive,
    setMyColor,
    flipBoard,
    playSound,
    THEMES,
    getThemes: () => Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name })),

    onMove(callback) { onMoveCallback = callback; },

    setLastMove(from, to) {
      lastMove = from && to ? { from, to } : null;
    }
  };

})();
