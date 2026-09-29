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

/** Beyond any material score, so a mate always outranks winning a queen. */
const MATE_SCORE = 1_000_000;

/**
 * Static evaluation. Positive favours White, negative favours Black.
 *
 * `terminal` is how the caller says it has already ruled out mate and
 * stalemate. It used to ask chess.js four separate questions here —
 * isCheckmate, isDraw, isStalemate, isThreefoldRepetition — and every one of
 * them generates the full legal move list. Four move generations on every leaf
 * of the tree was most of what the bot's thinking time was spent on, and three
 * of them were redundant: isDraw already covers stalemate and repetition.
 */
export function evaluateBoard(chess: Chess, terminal = true): number {
  if (terminal && chess.isGameOver()) {
    if (chess.isCheckmate()) return chess.turn() === 'w' ? -MATE_SCORE : MATE_SCORE;
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
 * Orders moves so alpha-beta gets to prune early.
 *
 * Alpha-beta is only as fast as its move ordering: search the best move first
 * and most of the rest of the list is cut off unexamined, search it last and
 * the pruning buys almost nothing. The old ordering sorted on `captured` as a
 * boolean, so a pawn taking a queen ranked level with a queen taking a pawn.
 *
 * This is MVV-LVA — most valuable victim, least valuable attacker — which puts
 * the biggest gains for the smallest risk at the front of the list.
 */
function orderingScore(move: { captured?: string; piece: string; promotion?: string; san: string }): number {
  let score = 0;
  if (move.captured) score += 10 * (PIECE_VALUES[move.captured] ?? 0) - (PIECE_VALUES[move.piece] ?? 0);
  if (move.promotion) score += PIECE_VALUES[move.promotion] ?? 0;
  // Checks are forcing, so they narrow the reply list and cut off fast.
  if (move.san.includes('+') || move.san.includes('#')) score += 50;
  return score;
}

/** Thrown to unwind the search when its time is up. */
class SearchExpired extends Error {}

/**
 * Nodes visited since the clock was last read.
 *
 * Date.now() at every node is itself a measurable cost when there are hundreds
 * of thousands of them, and the search cannot overrun by much in 256 nodes.
 */
let nodesSinceClockCheck = 0;
const CLOCK_CHECK_INTERVAL = 256;

/**
 * Minimax with alpha-beta pruning, abandoned when the deadline passes.
 *
 * `ply` is the distance from the root, and it is subtracted from mate scores so
 * that mate in one is preferred over mate in three — without it the bot sees
 * every forced mate as equally good and can shuffle around indefinitely.
 */
function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  deadline: number,
  ply: number
): number {
  if (++nodesSinceClockCheck >= CLOCK_CHECK_INTERVAL) {
    nodesSinceClockCheck = 0;
    if (Date.now() >= deadline) throw new SearchExpired();
  }

  if (depth === 0) {
    // One move generation, to tell a finished game from a quiet one. Skipping
    // it unless the king is in check is tempting and wrong: with no legal reply
    // and no check the position is stalemate, and scoring that as material is
    // how a bot that is winning walks into a draw. The time budget absorbs the
    // cost — it is still a quarter of the four generations this used to do.
    if (chess.moves().length === 0) {
      if (!chess.inCheck()) return 0;
      return chess.turn() === 'w' ? -MATE_SCORE + ply : MATE_SCORE - ply;
    }
    return evaluateBoard(chess, false);
  }

  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    // No legal reply: mate if the king is attacked, stalemate if it is not.
    if (!chess.inCheck()) return 0;
    return chess.turn() === 'w' ? -MATE_SCORE + ply : MATE_SCORE - ply;
  }
  moves.sort((a, b) => orderingScore(b) - orderingScore(a));

  if (isMaximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const score = minimax(chess, depth - 1, alpha, beta, false, deadline, ply + 1);
      chess.undo();
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const move of moves) {
    chess.move(move);
    const score = minimax(chess, depth - 1, alpha, beta, true, deadline, ply + 1);
    chess.undo();
    if (score < best) best = score;
    if (best < beta) beta = best;
    if (beta <= alpha) break;
  }
  return best;
}

export type BotMove = { from: string; to: string; promotion?: string; san: string };

/**
 * How long each level may think, and how far ahead it may look.
 *
 * Both limits matter for different reasons. The depth is what makes the levels
 * feel different from each other; the clock is what stops a crowded middlegame
 * on a cheap phone taking the better part of a minute. A depth-4 search of a
 * busy middlegame measured over ten seconds on a fast desktop before this, and
 * every one of those seconds was the whole page frozen — the player could not
 * even scroll while the bot thought.
 */
const BOT_BUDGET: Record<BotDifficulty, { ms: number; maxDepth: number }> = {
  cadet: { ms: 200, maxDepth: 1 },
  navigator: { ms: 450, maxDepth: 2 },
  commander: { ms: 900, maxDepth: 3 },
  overlord: { ms: 1600, maxDepth: 4 },
};

/**
 * Hands the browser a turn, so a thinking bot does not freeze the page.
 *
 * Not setTimeout: browsers clamp a timer nested more than five deep to 4ms
 * minimum, and a search that yields a few hundred times would spend most of its
 * budget waiting on that clamp rather than searching. A MessageChannel message
 * is not clamped, and still lets the frame paint and pending taps run first.
 */
function yieldToUi(): Promise<void> {
  if (typeof MessageChannel === 'undefined') {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/**
 * How long the search may hold the thread before handing it back.
 *
 * Yielding after every single root move is its own kind of waste — at depth 1
 * the whole iteration is over in less time than the yields would cost. So the
 * search only breaks once a slice has actually been used up, which keeps the
 * page responsive without paying for a hand-off that buys nothing.
 */
const SLICE_MS = 40;
let lastYieldAt = 0;

/**
 * Searches every move at the root, one at a time, yielding between them.
 *
 * The recursion below each root move stays synchronous — that is where the
 * work is and awaiting inside it would cost more than it saved — but breaking
 * at the root turns one long block into a series of short ones, so the board
 * still redraws and taps still register while the bot thinks.
 *
 * Running this in a Web Worker would remove the blocking entirely; it is the
 * next step if the slices ever get long enough to feel.
 */
async function searchRoot(
  fen: string,
  depth: number,
  deadline: number,
  isWhite: boolean
): Promise<BotMove | null> {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  moves.sort((a, b) => orderingScore(b) - orderingScore(a));

  let best: BotMove | null = null;
  let bestScore = isWhite ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  for (const move of moves) {
    chess.move(move);
    const score = minimax(chess, depth - 1, alpha, beta, !isWhite, deadline, 1);
    chess.undo();

    if (isWhite ? score > bestScore : score < bestScore) {
      bestScore = score;
      best = { from: move.from, to: move.to, promotion: move.promotion, san: move.san };
    }
    if (isWhite) alpha = Math.max(alpha, bestScore);
    else beta = Math.min(beta, bestScore);

    if (Date.now() - lastYieldAt >= SLICE_MS) {
      await yieldToUi();
      lastYieldAt = Date.now();
    }
  }

  return best;
}

/**
 * Picks the bot's move, within a time budget it is guaranteed to respect.
 *
 * Searches depth 1, then 2, then 3, keeping the best move from the last depth
 * that finished. Re-searching the shallow depths sounds wasteful and is not:
 * each one costs a fraction of the next, and it is the only way to have an
 * answer ready when the clock runs out mid-search — which is what makes the
 * bot's response time predictable on a slow device instead of open-ended.
 */
export async function getBotMove(
  fen: string,
  difficulty: BotDifficulty = 'navigator'
): Promise<BotMove | null> {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;

  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  const pick = (m: (typeof legalMoves)[number]): BotMove => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion,
    san: m.san,
  });

  // Cadet blunders on purpose most of the time — that is the whole difficulty.
  if (difficulty === 'cadet' && Math.random() < 0.6) {
    return pick(legalMoves[Math.floor(Math.random() * legalMoves.length)]);
  }

  const { ms, maxDepth } = BOT_BUDGET[difficulty] ?? BOT_BUDGET.navigator;
  const deadline = Date.now() + ms;
  const isWhite = chess.turn() === 'w';

  // Never return nothing: the shallowest answer is ready before the search
  // starts, so even an immediate timeout plays a legal move.
  let best: BotMove = pick(legalMoves[0]);
  nodesSinceClockCheck = 0;
  lastYieldAt = Date.now();

  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      const found = await searchRoot(fen, depth, deadline, isWhite);
      if (found) best = found;
    } catch (error) {
      // Out of time. The previous depth's answer stands — a completed shallow
      // search is trustworthy, half of a deep one is not.
      if (!(error instanceof SearchExpired)) throw error;
      break;
    }
    if (Date.now() >= deadline) break;
  }

  return best;
}
