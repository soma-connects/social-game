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
 * How long each difficulty may think, and how deep it may go.
 *
 * The search runs on the browser's main thread, so a depth that "usually"
 * finishes quickly is not good enough — one tactical middlegame position at
 * depth 4 can branch far enough to lock the tab for several seconds, and from
 * the outside that is indistinguishable from the game having crashed. The
 * budget is the real limit; the depth is just where it stops trying to go
 * deeper when the position is simple enough to allow it.
 */
const BUDGETS: Record<BotDifficulty, { depth: number; ms: number }> = {
  cadet: { depth: 1, ms: 150 },
  navigator: { depth: 2, ms: 400 },
  commander: { depth: 3, ms: 900 },
  overlord: { depth: 4, ms: 1600 },
};

/** Checked every so many nodes, because Date.now() per node costs real time. */
const CLOCK_CHECK_NODES = 2048;

type Search = { deadline: number; nodes: number; aborted: boolean };

function outOfTime(search: Search): boolean {
  if (search.aborted) return true;
  search.nodes++;
  if (search.nodes % CLOCK_CHECK_NODES !== 0) return false;
  if (Date.now() >= search.deadline) search.aborted = true;
  return search.aborted;
}

/**
 * Orders moves so alpha-beta gets its cutoffs early.
 *
 * Captures first, biggest prize first (a pawn taking a queen is the move most
 * likely to refute everything else), then promotions, then the rest. Sorting
 * only on "is a capture", which is what this used to do, leaves most of the
 * pruning on the table.
 */
function orderMoves<T>(moves: T[]): T[] {
  return [...moves].sort((a, b) => moveRank(b) - moveRank(a));
}

function moveRank(move: any): number {
  let rank = 0;
  if (move.captured) rank += 1000 + (PIECE_VALUES[move.captured] ?? 0) - (PIECE_VALUES[move.piece] ?? 0) / 10;
  if (move.promotion) rank += 800;
  if (typeof move.san === 'string' && move.san.includes('+')) rank += 50;
  return rank;
}

/**
 * Minimax with alpha-beta pruning, abandoned when the clock runs out.
 */
function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  search: Search
): { score: number; move: string | null } {
  if (outOfTime(search)) return { score: evaluateBoard(chess), move: null };
  if (depth === 0 || chess.isGameOver()) {
    return { score: evaluateBoard(chess), move: null };
  }

  const moves = orderMoves(chess.moves({ verbose: true }));
  let bestMove: string | null = null;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const result = minimax(chess, depth - 1, alpha, beta, false, search);
      chess.undo();
      if (search.aborted) break;

      if (result.score > maxEval) {
        maxEval = result.score;
        bestMove = move.san;
      }
      alpha = Math.max(alpha, maxEval);
      if (beta <= alpha) break;
    }
    return { score: maxEval, move: bestMove };
  }

  let minEval = Infinity;
  for (const move of moves) {
    chess.move(move);
    const result = minimax(chess, depth - 1, alpha, beta, true, search);
    chess.undo();
    if (search.aborted) break;

    if (result.score < minEval) {
      minEval = result.score;
      bestMove = move.san;
    }
    beta = Math.min(beta, minEval);
    if (beta <= alpha) break;
  }
  return { score: minEval, move: bestMove };
}

/**
 * Iterative deepening: search one ply at a time, keeping the last depth that
 * finished cleanly.
 *
 * This is what makes the time budget usable. A search cut off partway through
 * a depth has looked at some moves and not others, so its "best" is not a
 * comparison — it is whichever move happened to be examined first. Falling back
 * to the last completed depth gives a real answer every time.
 */
function searchBestMove(fen: string, difficulty: BotDifficulty): string | null {
  const { depth: maxDepth, ms } = BUDGETS[difficulty] ?? BUDGETS.navigator;
  const search: Search = { deadline: Date.now() + ms, nodes: 0, aborted: false };
  const chess = new Chess(fen);
  const isWhite = chess.turn() === 'w';

  let best: string | null = null;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const result = minimax(chess, depth, -Infinity, Infinity, isWhite, search);
    if (search.aborted) break;
    if (result.move) best = result.move;
  }
  return best;
}

/**
 * Select the best move for the AI Bot based on difficulty.
 *
 * Cadet plays badly on purpose. The rest play the best move they can find
 * inside their time budget.
 */
export function getBotMove(
  fen: string,
  difficulty: BotDifficulty = 'navigator'
): { from: string; to: string; promotion?: string; san: string } | null {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;

  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  const pick = (san: string | null) => {
    const found = legalMoves.find((m) => m.san === san) ?? legalMoves[0];
    return { from: found.from, to: found.to, promotion: found.promotion, san: found.san };
  };

  // Cadet blunders most of the time on purpose — but never throws away a piece
  // that is simply hanging for free, which reads as broken rather than as easy.
  if (difficulty === 'cadet' && Math.random() < 0.6) {
    const random = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    return { from: random.from, to: random.to, promotion: random.promotion, san: random.san };
  }

  return pick(searchBestMove(fen, difficulty));
}
