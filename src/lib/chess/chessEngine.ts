import { Chess, Square } from 'chess.js';
import { BotDifficulty } from './chessTypes';

// Piece value weights (centipawns)
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Positional piece-square tables (from White's perspective)
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

const ROOK_TABLE = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0
];

const QUEEN_TABLE = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20
];

const KING_TABLE_MID = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20
];

function squareToIndex(square: Square, isWhite: boolean): number {
  const file = square.charCodeAt(0) - 97; // 'a' -> 0, 'h' -> 7
  const rank = parseInt(square[1], 10) - 1; // '1' -> 0, '8' -> 7
  return isWhite ? (7 - rank) * 8 + file : rank * 8 + file;
}

/**
 * Static evaluation function. Positive = White advantage, Negative = Black advantage.
 */
export function evaluateBoard(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -99999 : 99999;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) {
    return 0;
  }

  let score = 0;
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const isWhite = piece.color === 'w';
      const type = piece.type;
      let val = PIECE_VALUES[type] || 0;

      // Add positional table bonus
      const fileChar = String.fromCharCode(97 + c);
      const rankChar = String(8 - r);
      const sq = `${fileChar}${rankChar}` as Square;
      const idx = squareToIndex(sq, isWhite);

      let posBonus = 0;
      switch (type) {
        case 'p': posBonus = PAWN_TABLE[idx] || 0; break;
        case 'n': posBonus = KNIGHT_TABLE[idx] || 0; break;
        case 'b': posBonus = BISHOP_TABLE[idx] || 0; break;
        case 'r': posBonus = ROOK_TABLE[idx] || 0; break;
        case 'q': posBonus = QUEEN_TABLE[idx] || 0; break;
        case 'k': posBonus = KING_TABLE_MID[idx] || 0; break;
      }

      val += posBonus;
      score += isWhite ? val : -val;
    }
  }

  return score;
}

/**
 * Minimax with Alpha-Beta Pruning.
 */
function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean
): { score: number; move: string | null } {
  if (depth === 0 || chess.isGameOver()) {
    return { score: evaluateBoard(chess), move: null };
  }

  const moves = chess.moves({ verbose: true });
  // Move ordering heuristic (captures first)
  moves.sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));

  let bestMove: string | null = null;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const result = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();

      if (result.score > maxEval) {
        maxEval = result.score;
        bestMove = move.san;
      }
      alpha = Math.max(alpha, maxEval);
      if (beta <= alpha) break;
    }
    return { score: maxEval, move: bestMove };
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const result = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();

      if (result.score < minEval) {
        minEval = result.score;
        bestMove = move.san;
      }
      beta = Math.min(beta, minEval);
      if (beta <= alpha) break;
    }
    return { score: minEval, move: bestMove };
  }
}

/**
 * Select the best move for the AI Bot based on difficulty.
 */
export function getBotMove(fen: string, difficulty: BotDifficulty = 'navigator'): { from: string; to: string; promotion?: string; san: string } | null {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;

  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  const isWhite = chess.turn() === 'w';

  // Cadet (Beginner): 70% random / shallow blunder, 30% decent
  if (difficulty === 'cadet') {
    if (Math.random() < 0.6) {
      const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      return { from: randomMove.from, to: randomMove.to, promotion: randomMove.promotion, san: randomMove.san };
    }
    const { move } = minimax(chess, 1, -Infinity, Infinity, isWhite);
    const found = legalMoves.find(m => m.san === move) || legalMoves[0];
    return { from: found.from, to: found.to, promotion: found.promotion, san: found.san };
  }

  // Navigator (Intermediate): Depth 2
  if (difficulty === 'navigator') {
    const { move } = minimax(chess, 2, -Infinity, Infinity, isWhite);
    const found = legalMoves.find(m => m.san === move) || legalMoves[0];
    return { from: found.from, to: found.to, promotion: found.promotion, san: found.san };
  }

  // Commander (Advanced): Depth 3
  if (difficulty === 'commander') {
    const { move } = minimax(chess, 3, -Infinity, Infinity, isWhite);
    const found = legalMoves.find(m => m.san === move) || legalMoves[0];
    return { from: found.from, to: found.to, promotion: found.promotion, san: found.san };
  }

  // Overlord (Master): Depth 4
  const { move } = minimax(chess, 4, -Infinity, Infinity, isWhite);
  const found = legalMoves.find(m => m.san === move) || legalMoves[0];
  return { from: found.from, to: found.to, promotion: found.promotion, san: found.san };
}
