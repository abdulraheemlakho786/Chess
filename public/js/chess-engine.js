/**
 * chess-engine.js — Full Chess Rules Engine
 * Implements all official chess rules:
 * - Legal move generation & validation
 * - Check, checkmate, stalemate detection
 * - Castling (kingside & queenside)
 * - En passant
 * - Pawn promotion
 * - 50-move rule
 * - Threefold repetition
 */

'use strict';

const ChessEngine = (() => {

  // ─── Constants ─────────────────────────────────────────────────────────────
  const PIECE_TYPES = { PAWN: 'p', KNIGHT: 'n', BISHOP: 'b', ROOK: 'r', QUEEN: 'q', KING: 'k' };
  const WHITE = 'w', BLACK = 'b';
  const FILES = 'abcdefgh';

  // Initial board position (FEN format pieces)
  const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // ─── Board Representation ────────────────────────────────────────────────
  // Board is 8x8 array, index [row][col], row 0 = rank 8, col 0 = file a
  // Pieces: uppercase = white, lowercase = black

  function createEmptyBoard() {
    return Array(8).fill(null).map(() => Array(8).fill(null));
  }

  function fenToBoard(fen) {
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    const board = createEmptyBoard();

    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) {
          c += parseInt(ch);
        } else {
          board[r][c] = ch;
          c++;
        }
      }
    }

    return {
      board,
      turn: parts[1] || WHITE,
      castling: parts[2] || '-',
      enPassant: parts[3] || '-',
      halfMoves: parseInt(parts[4]) || 0,
      fullMoves: parseInt(parts[5]) || 1
    };
  }

  function boardToFen(state) {
    let fen = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const piece = state.board[r][c];
        if (piece) {
          if (empty > 0) { fen += empty; empty = 0; }
          fen += piece;
        } else {
          empty++;
        }
      }
      if (empty > 0) fen += empty;
      if (r < 7) fen += '/';
    }
    fen += ` ${state.turn} ${state.castling} ${state.enPassant} ${state.halfMoves} ${state.fullMoves}`;
    return fen;
  }

  // ─── Coordinate Helpers ─────────────────────────────────────────────────
  function sq(row, col) { return { row, col }; }
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function algebraic(r, c) { return FILES[c] + (8 - r); }
  function fromAlgebraic(s) { return { row: 8 - parseInt(s[1]), col: FILES.indexOf(s[0]) }; }
  function isWhitePiece(p) { return p && p === p.toUpperCase(); }
  function isBlackPiece(p) { return p && p === p.toLowerCase(); }
  function pieceColor(p) { if (!p) return null; return isWhitePiece(p) ? WHITE : BLACK; }
  function pieceType(p) { return p ? p.toLowerCase() : null; }
  function isFriendly(p, color) { return p && pieceColor(p) === color; }
  function isEnemy(p, color) { return p && pieceColor(p) !== color; }

  // ─── Raw Move Generation (pseudo-legal) ─────────────────────────────────
  function getRawMoves(state, row, col) {
    const piece = state.board[row][col];
    if (!piece) return [];
    const color = pieceColor(piece);
    const type = pieceType(piece);
    const moves = [];

    const addMove = (r, c, flags = {}) => {
      if (inBounds(r, c) && !isFriendly(state.board[r][c], color)) {
        moves.push({ from: { row, col }, to: { row: r, col: c }, piece, ...flags });
      }
    };
    const addSlide = (dr, dc) => {
      let r = row + dr, c = col + dc;
      while (inBounds(r, c)) {
        if (state.board[r][c]) {
          if (isEnemy(state.board[r][c], color)) moves.push({ from: { row, col }, to: { row: r, col: c }, piece });
          break;
        }
        moves.push({ from: { row, col }, to: { row: r, col: c }, piece });
        r += dr; c += dc;
      }
    };

    switch (type) {
      case 'p': {
        const dir = color === WHITE ? -1 : 1;
        const startRow = color === WHITE ? 6 : 1;
        const promRow = color === WHITE ? 0 : 7;

        // Forward move
        if (inBounds(row + dir, col) && !state.board[row + dir][col]) {
          const isPromo = (row + dir) === promRow;
          if (isPromo) {
            for (const p of ['q', 'r', 'b', 'n']) {
              moves.push({ from: { row, col }, to: { row: row + dir, col }, piece, promotion: p });
            }
          } else {
            moves.push({ from: { row, col }, to: { row: row + dir, col }, piece });
          }
          // Double push from start
          if (row === startRow && !state.board[row + 2 * dir][col]) {
            moves.push({ from: { row, col }, to: { row: row + 2 * dir, col }, piece, doublePush: true });
          }
        }

        // Captures
        for (const dc of [-1, 1]) {
          const tc = col + dc;
          const tr = row + dir;
          if (!inBounds(tr, tc)) continue;
          const isPromo = tr === promRow;

          if (isEnemy(state.board[tr][tc], color)) {
            if (isPromo) {
              for (const p of ['q', 'r', 'b', 'n']) {
                moves.push({ from: { row, col }, to: { row: tr, col: tc }, piece, promotion: p });
              }
            } else {
              moves.push({ from: { row, col }, to: { row: tr, col: tc }, piece });
            }
          }

          // En passant
          if (state.enPassant !== '-') {
            const ep = fromAlgebraic(state.enPassant);
            if (ep.row === tr && ep.col === tc) {
              moves.push({ from: { row, col }, to: { row: tr, col: tc }, piece, enPassant: true, capturedRow: row });
            }
          }
        }
        break;
      }

      case 'n': {
        const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of knightMoves) addMove(row + dr, col + dc);
        break;
      }

      case 'b':
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) addSlide(dr, dc);
        break;

      case 'r':
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) addSlide(dr, dc);
        break;

      case 'q':
        for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) addSlide(dr, dc);
        break;

      case 'k': {
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) addMove(row + dr, col + dc);

        // Castling
        if (color === WHITE) {
          const r = 7;
          if (state.castling.includes('K') && !state.board[r][5] && !state.board[r][6]) {
            moves.push({ from: { row, col }, to: { row: r, col: 6 }, piece, castle: 'K' });
          }
          if (state.castling.includes('Q') && !state.board[r][3] && !state.board[r][2] && !state.board[r][1]) {
            moves.push({ from: { row, col }, to: { row: r, col: 2 }, piece, castle: 'Q' });
          }
        } else {
          const r = 0;
          if (state.castling.includes('k') && !state.board[r][5] && !state.board[r][6]) {
            moves.push({ from: { row, col }, to: { row: r, col: 6 }, piece, castle: 'k' });
          }
          if (state.castling.includes('q') && !state.board[r][3] && !state.board[r][2] && !state.board[r][1]) {
            moves.push({ from: { row, col }, to: { row: r, col: 2 }, piece, castle: 'q' });
          }
        }
        break;
      }
    }

    return moves;
  }

  // ─── Apply Move ──────────────────────────────────────────────────────────
  function applyMove(state, move) {
    // Deep clone
    const newState = {
      board: state.board.map(row => [...row]),
      turn: state.turn === WHITE ? BLACK : WHITE,
      castling: state.castling,
      enPassant: '-',
      halfMoves: state.halfMoves + 1,
      fullMoves: state.turn === BLACK ? state.fullMoves + 1 : state.fullMoves
    };

    const { from, to, piece, promotion, enPassant, capturedRow, doublePush, castle } = move;

    // Reset half-move clock on pawn move or capture
    if (pieceType(piece) === 'p' || newState.board[to.row][to.col]) {
      newState.halfMoves = 0;
    }

    // Move piece
    newState.board[to.row][to.col] = promotion
      ? (state.turn === WHITE ? promotion.toUpperCase() : promotion.toLowerCase())
      : piece;
    newState.board[from.row][from.col] = null;

    // En passant capture
    if (enPassant) {
      newState.board[capturedRow][to.col] = null;
      newState.halfMoves = 0;
    }

    // Double push: set en passant square
    if (doublePush) {
      const epRow = (from.row + to.row) / 2;
      newState.enPassant = algebraic(epRow, from.col);
    }

    // Castling: move rook
    if (castle) {
      const r = from.row;
      if (castle === 'K') { newState.board[r][5] = newState.board[r][7]; newState.board[r][7] = null; }
      if (castle === 'Q') { newState.board[r][3] = newState.board[r][0]; newState.board[r][0] = null; }
      if (castle === 'k') { newState.board[r][5] = newState.board[r][7]; newState.board[r][7] = null; }
      if (castle === 'q') { newState.board[r][3] = newState.board[r][0]; newState.board[r][0] = null; }
    }

    // Update castling rights
    let castling = newState.castling;
    if (castling !== '-') {
      if (pieceType(piece) === 'k') {
        castling = castling.replace(state.turn === WHITE ? 'K' : 'k', '').replace(state.turn === WHITE ? 'Q' : 'q', '');
      }
      if (from.row === 7 && from.col === 7) castling = castling.replace('K', '');
      if (from.row === 7 && from.col === 0) castling = castling.replace('Q', '');
      if (from.row === 0 && from.col === 7) castling = castling.replace('k', '');
      if (from.row === 0 && from.col === 0) castling = castling.replace('q', '');
      if (to.row === 7 && to.col === 7) castling = castling.replace('K', '');
      if (to.row === 7 && to.col === 0) castling = castling.replace('Q', '');
      if (to.row === 0 && to.col === 7) castling = castling.replace('k', '');
      if (to.row === 0 && to.col === 0) castling = castling.replace('q', '');
      newState.castling = castling || '-';
    }

    return newState;
  }

  // ─── Check Detection ────────────────────────────────────────────────────
  function isSquareAttacked(board, row, col, byColor) {
    // Check if (row, col) is attacked by any piece of byColor
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece || pieceColor(piece) !== byColor) continue;
        const type = pieceType(piece);
        const dr = row - r, dc = col - c;

        switch (type) {
          case 'p': {
            const dir = byColor === WHITE ? -1 : 1;
            if (dr === dir && Math.abs(dc) === 1) return true;
            break;
          }
          case 'n':
            if ((Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2)) return true;
            break;
          case 'b':
            if (Math.abs(dr) === Math.abs(dc)) {
              const sr = Math.sign(dr), sc = Math.sign(dc);
              let blocked = false;
              for (let i = 1; i < Math.abs(dr); i++) { if (board[r + i * sr][c + i * sc]) { blocked = true; break; } }
              if (!blocked) return true;
            }
            break;
          case 'r':
            if (dr === 0 || dc === 0) {
              const sr = Math.sign(dr), sc = Math.sign(dc);
              let blocked = false;
              const steps = Math.max(Math.abs(dr), Math.abs(dc));
              for (let i = 1; i < steps; i++) { if (board[r + i * sr][c + i * sc]) { blocked = true; break; } }
              if (!blocked) return true;
            }
            break;
          case 'q':
            if (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) {
              const sr = Math.sign(dr), sc = Math.sign(dc);
              let blocked = false;
              const steps = Math.max(Math.abs(dr), Math.abs(dc));
              for (let i = 1; i < steps; i++) { if (board[r + i * sr][c + i * sc]) { blocked = true; break; } }
              if (!blocked) return true;
            }
            break;
          case 'k':
            if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) return true;
            break;
        }
      }
    }
    return false;
  }

  function findKing(board, color) {
    const king = color === WHITE ? 'K' : 'k';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c] === king) return { row: r, col: c };
      }
    }
    return null;
  }

  function isInCheck(state, color) {
    const king = findKing(state.board, color);
    if (!king) return false;
    return isSquareAttacked(state.board, king.row, king.col, color === WHITE ? BLACK : WHITE);
  }

  // ─── Legal Move Generation ───────────────────────────────────────────────
  function getLegalMoves(state, row, col) {
    const piece = state.board[row][col];
    if (!piece || pieceColor(piece) !== state.turn) return [];

    const rawMoves = getRawMoves(state, row, col);
    const legal = [];

    for (const move of rawMoves) {
      // For castling: check if king passes through attacked square
      if (move.castle) {
        const color = state.turn;
        const opColor = color === WHITE ? BLACK : WHITE;
        const r = row;

        // King cannot be in check, or pass through, or land in check
        if (isInCheck(state, color)) continue;

        let passThroughCol;
        if (move.castle === 'K' || move.castle === 'k') passThroughCol = 5;
        else passThroughCol = 3;

        if (isSquareAttacked(state.board, r, passThroughCol, opColor)) continue;
        if (isSquareAttacked(state.board, r, move.to.col, opColor)) continue;
      }

      const newState = applyMove(state, move);
      // Must not leave own king in check
      if (!isInCheck(newState, state.turn)) {
        legal.push(move);
      }
    }

    return legal;
  }

  function getAllLegalMoves(state) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = state.board[r][c];
        if (piece && pieceColor(piece) === state.turn) {
          moves.push(...getLegalMoves(state, r, c));
        }
      }
    }
    return moves;
  }

  // ─── Game Status ────────────────────────────────────────────────────────
  function getGameStatus(state, positionHistory) {
    const inCheck = isInCheck(state, state.turn);
    const hasLegal = getAllLegalMoves(state).length > 0;

    if (!hasLegal) {
      if (inCheck) return { status: 'checkmate', winner: state.turn === WHITE ? BLACK : WHITE };
      else return { status: 'stalemate' };
    }

    if (inCheck) return { status: 'check' };

    // 50-move rule
    if (state.halfMoves >= 100) return { status: 'draw', reason: '50-move rule' };

    // Threefold repetition
    if (positionHistory) {
      const fenKey = boardToFen(state).split(' ').slice(0, 4).join(' ');
      const count = positionHistory.filter(f => f === fenKey).length;
      if (count >= 3) return { status: 'draw', reason: 'threefold repetition' };
    }

    // Insufficient material
    if (isInsufficientMaterial(state)) return { status: 'draw', reason: 'insufficient material' };

    return { status: 'normal' };
  }

  function isInsufficientMaterial(state) {
    const pieces = { w: [], b: [] };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (p && pieceType(p) !== 'k') {
          pieces[pieceColor(p)].push({ type: pieceType(p), row: r, col: c });
        }
      }
    }
    const w = pieces.w, b = pieces.b;
    // K vs K
    if (w.length === 0 && b.length === 0) return true;
    // K vs K+B or K vs K+N
    if (w.length === 0 && b.length === 1 && (b[0].type === 'b' || b[0].type === 'n')) return true;
    if (b.length === 0 && w.length === 1 && (w[0].type === 'b' || w[0].type === 'n')) return true;
    // K+B vs K+B (same color bishops)
    if (w.length === 1 && b.length === 1 && w[0].type === 'b' && b[0].type === 'b') {
      const wLight = (w[0].row + w[0].col) % 2;
      const bLight = (b[0].row + b[0].col) % 2;
      if (wLight === bLight) return true;
    }
    return false;
  }

  // ─── Move to SAN (Standard Algebraic Notation) ───────────────────────────
  function moveToSan(state, move) {
    const { from, to, piece, promotion, castle, enPassant } = move;
    const type = pieceType(piece);

    if (castle === 'K' || castle === 'k') return 'O-O';
    if (castle === 'Q' || castle === 'q') return 'O-O-O';

    let san = '';
    const toAlg = algebraic(to.row, to.col);
    const capture = state.board[to.row][to.col] || enPassant;

    if (type === 'p') {
      if (capture) san = FILES[from.col] + 'x' + toAlg;
      else san = toAlg;
      if (promotion) san += '=' + promotion.toUpperCase();
    } else {
      const pieceChar = type.toUpperCase();
      // Disambiguation
      let ambig = '';
      const samePieces = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (r === from.row && c === from.col) continue;
          if (state.board[r][c] === piece) {
            const mvs = getLegalMoves(state, r, c);
            if (mvs.some(m => m.to.row === to.row && m.to.col === to.col)) {
              samePieces.push({ row: r, col: c });
            }
          }
        }
      }
      if (samePieces.length > 0) {
        if (samePieces.every(p => p.col !== from.col)) ambig = FILES[from.col];
        else if (samePieces.every(p => p.row !== from.row)) ambig = String(8 - from.row);
        else ambig = FILES[from.col] + String(8 - from.row);
      }
      san = pieceChar + ambig + (capture ? 'x' : '') + toAlg;
    }

    // Check/checkmate
    const newState = applyMove(state, move);
    const status = getGameStatus(newState, null);
    if (status.status === 'checkmate') san += '#';
    else if (status.status === 'check') san += '+';

    return san;
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  return {
    INITIAL_FEN,
    fenToBoard,
    boardToFen,
    applyMove,
    getLegalMoves,
    getAllLegalMoves,
    getGameStatus,
    isInCheck,
    moveToSan,
    algebraic,
    fromAlgebraic,
    pieceColor,
    pieceType,

    // Get all legal destination squares for a piece
    getLegalTargets(state, row, col) {
      return getLegalMoves(state, row, col).map(m => ({
        row: m.to.row,
        col: m.to.col,
        move: m
      }));
    },

    // Initialize a new game state from FEN
    newGame(fen = INITIAL_FEN) {
      return fenToBoard(fen);
    }
  };
})();

// Export for both browser and Node.js
if (typeof module !== 'undefined') module.exports = ChessEngine;
