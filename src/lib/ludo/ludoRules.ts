import { LudoBotSkill, LudoColor, LudoToken } from './ludoTypes';

// Main 52-tile track starting coordinates for each color
export const COLOR_START_POSITIONS: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

// Safe tiles on 52-tile board (Starts + Star tiles)
export const SAFE_POSITIONS = new Set<number>([
  0, 8, 13, 21, 26, 34, 39, 47,
]);

// Turn progression order
export const LUDO_COLOR_ORDER: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

/**
 * 15x15 Coordinate Mapping for the 52 perimeter tiles.
 * (col: 0..14, row: 0..14)
 */
export const TRACK_GRID_COORDS: { col: number; row: number }[] = [
  // Red Track (0..12)
  { col: 1, row: 6 }, // 0 (Red Start)
  { col: 2, row: 6 }, // 1
  { col: 3, row: 6 }, // 2
  { col: 4, row: 6 }, // 3
  { col: 5, row: 6 }, // 4
  { col: 6, row: 5 }, // 5
  { col: 6, row: 4 }, // 6
  { col: 6, row: 3 }, // 7
  { col: 6, row: 2 }, // 8 (Star)
  { col: 6, row: 1 }, // 9
  { col: 6, row: 0 }, // 10
  { col: 7, row: 0 }, // 11
  { col: 8, row: 0 }, // 12

  // Green Track (13..25)
  { col: 8, row: 1 }, // 13 (Green Start)
  { col: 8, row: 2 }, // 14
  { col: 8, row: 3 }, // 15
  { col: 8, row: 4 }, // 16
  { col: 8, row: 5 }, // 17
  { col: 9, row: 6 }, // 18
  { col: 10, row: 6 }, // 19
  { col: 11, row: 6 }, // 20
  { col: 12, row: 6 }, // 21 (Star)
  { col: 13, row: 6 }, // 22
  { col: 14, row: 6 }, // 23
  { col: 14, row: 7 }, // 24
  { col: 14, row: 8 }, // 25

  // Yellow Track (26..38)
  { col: 13, row: 8 }, // 26 (Yellow Start)
  { col: 12, row: 8 }, // 27
  { col: 11, row: 8 }, // 28
  { col: 10, row: 8 }, // 29
  { col: 9, row: 8 }, // 30
  { col: 8, row: 9 }, // 31
  { col: 8, row: 10 }, // 32
  { col: 8, row: 11 }, // 33
  { col: 8, row: 12 }, // 34 (Star)
  { col: 8, row: 13 }, // 35
  { col: 8, row: 14 }, // 36
  { col: 7, row: 14 }, // 37
  { col: 6, row: 14 }, // 38

  // Blue Track (39..51)
  { col: 6, row: 13 }, // 39 (Blue Start)
  { col: 6, row: 12 }, // 40
  { col: 6, row: 11 }, // 41
  { col: 6, row: 10 }, // 42
  { col: 6, row: 9 }, // 43
  { col: 5, row: 8 }, // 44
  { col: 4, row: 8 }, // 45
  { col: 3, row: 8 }, // 46
  { col: 2, row: 8 }, // 47 (Star)
  { col: 1, row: 8 }, // 48
  { col: 0, row: 8 }, // 49
  { col: 0, row: 7 }, // 50
  { col: 0, row: 6 }, // 51
];

// Home column coordinates (steps 100..104 for each color)
export const HOME_COL_GRID_COORDS: Record<LudoColor, { col: number; row: number }[]> = {
  red: [
    { col: 1, row: 7 },
    { col: 2, row: 7 },
    { col: 3, row: 7 },
    { col: 4, row: 7 },
    { col: 5, row: 7 },
  ],
  green: [
    { col: 7, row: 1 },
    { col: 7, row: 2 },
    { col: 7, row: 3 },
    { col: 7, row: 4 },
    { col: 7, row: 5 },
  ],
  yellow: [
    { col: 13, row: 7 },
    { col: 12, row: 7 },
    { col: 11, row: 7 },
    { col: 10, row: 7 },
    { col: 9, row: 7 },
  ],
  blue: [
    { col: 7, row: 13 },
    { col: 7, row: 12 },
    { col: 7, row: 11 },
    { col: 7, row: 10 },
    { col: 7, row: 9 },
  ],
};

// Yard spawn slot coordinates (4 per color)
export const YARD_GRID_COORDS: Record<LudoColor, { col: number; row: number }[]> = {
  red: [
    { col: 2, row: 2 },
    { col: 3, row: 2 },
    { col: 2, row: 3 },
    { col: 3, row: 3 },
  ],
  green: [
    { col: 11, row: 2 },
    { col: 12, row: 2 },
    { col: 11, row: 3 },
    { col: 12, row: 3 },
  ],
  yellow: [
    { col: 11, row: 11 },
    { col: 12, row: 11 },
    { col: 11, row: 12 },
    { col: 12, row: 12 },
  ],
  blue: [
    { col: 2, row: 11 },
    { col: 3, row: 11 },
    { col: 2, row: 12 },
    { col: 3, row: 12 },
  ],
};

// Home triangle central point for winning tokens (999)
export const HOME_TRIANGLE_COORDS: Record<LudoColor, { col: number; row: number }> = {
  red: { col: 6.5, row: 7 },
  green: { col: 7, row: 6.5 },
  yellow: { col: 7.5, row: 7 },
  blue: { col: 7, row: 7.5 },
};

/**
 * Checks if a specific token can legally move given the dice roll.
 */
export function canMoveLudoToken(token: LudoToken, roll: number): boolean {
  if (token.position === 999) return false; // Already finished

  if (token.position === -1) {
    return roll === 6; // Needs a 6 to exit yard
  }

  if (token.position >= 100) {
    // Inside home column (100..104, 105 is home)
    const currentStep = token.position - 100;
    return currentStep + roll <= 5; // Must land <= 5 (5 is exact home finish 999)
  }

  // On main track: check if advancing would overshoot home column
  const startPos = COLOR_START_POSITIONS[token.color];
  const distFromStart = (token.position - startPos + 52) % 52;

  if (distFromStart + roll > 51) {
    const homeStep = distFromStart + roll - 52;
    return homeStep <= 5;
  }

  return true;
}

/**
 * Calculates the new position for a token after applying the roll.
 */
export function getLudoNextPosition(token: LudoToken, roll: number): number {
  if (token.position === -1) {
    return COLOR_START_POSITIONS[token.color];
  }

  if (token.position >= 100) {
    const currentStep = token.position - 100;
    const nextStep = currentStep + roll;
    if (nextStep === 5) return 999; // Reached home!
    return 100 + nextStep;
  }

  const startPos = COLOR_START_POSITIONS[token.color];
  const distFromStart = (token.position - startPos + 52) % 52;

  if (distFromStart + roll > 51) {
    const homeStep = distFromStart + roll - 52;
    if (homeStep === 5) return 999; // Finished!
    return 100 + homeStep;
  }

  return (token.position + roll) % 52;
}

/**
 * Seating for a match of 2, 3 or 4.
 *
 * Two players sit opposite each other rather than side by side: adjacent
 * colours share a long stretch of track, so red-vs-green is a knife fight in a
 * corridor while red-vs-yellow is an actual race. Turn order always runs in the
 * board's own clockwise direction, so the arrows painted on the start squares
 * still tell you who is next.
 */
export const LUDO_SEATING: Record<number, LudoColor[]> = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: ['red', 'green', 'yellow', 'blue'],
};

/** Clamps any requested seat count onto a lineup the board can actually seat. */
export function seatingFor(seatCount: number): LudoColor[] {
  const clamped = Math.min(4, Math.max(2, Math.round(seatCount) || 4));
  return LUDO_SEATING[clamped] ?? LUDO_SEATING[4];
}

/**
 * The next colour to play, skipping seats that are empty or already finished.
 *
 * Returns null when nobody is left to move, which is how a match ends.
 */
export function nextLudoColor(
  seatOrder: LudoColor[],
  current: LudoColor,
  isDone: (color: LudoColor) => boolean
): LudoColor | null {
  const start = seatOrder.indexOf(current);
  if (start === -1) return seatOrder.find((c) => !isDone(c)) ?? null;

  for (let step = 1; step <= seatOrder.length; step++) {
    const candidate = seatOrder[(start + step) % seatOrder.length];
    if (!isDone(candidate)) return candidate;
  }
  return null;
}

/** All four tokens home. */
export function isLudoColorFinished(tokens: LudoToken[]): boolean {
  return tokens.every((t) => t.position === 999);
}

// ─── computer opponents ─────────────────────────────────────────────────────

/**
 * How much a candidate move is worth, in arbitrary points.
 *
 * Ludo has very few decisions per turn — usually two or three legal moves — so
 * a scored heuristic beats a search here, and it is the only thing that can
 * express "this move is *nearly* as good as that one", which is what the easy
 * bot needs in order to blunder believably rather than randomly.
 */
function scoreLudoMove(
  token: LudoToken,
  roll: number,
  allTokens: Record<LudoColor, LudoToken[]>,
  /** False for the middle skill, which plays forward and never looks behind it. */
  weighThreats: boolean
): number {
  const next = getLudoNextPosition(token, roll);
  let score = 0;

  // Getting a token home is worth more than anything else on the board.
  if (next === 999) return 1000;

  // Reaching the home column puts a token permanently out of danger.
  if (next >= 100) score += 400 + (next - 100) * 20;

  if (next >= 0 && next < 52) {
    const landingOnSafe = SAFE_POSITIONS.has(next);

    // Capturing sends an opponent all the way back to their yard and earns a
    // bonus roll, so it is the strongest move on the open track.
    if (!landingOnSafe) {
      for (const [color, enemies] of Object.entries(allTokens) as [LudoColor, LudoToken[]][]) {
        if (color === token.color) continue;
        for (const enemy of enemies) {
          if (enemy.position !== next) continue;
          // Knocking out a token that had nearly finished hurts most.
          const travelled = (enemy.position - COLOR_START_POSITIONS[color] + 52) % 52;
          score += 300 + travelled * 3;
        }
      }
    }

    if (landingOnSafe) score += 60;

    // Sitting where an opponent can reach you with a single roll is how tokens
    // die. Count the ways it could happen and price them in.
    let threats = 0;
    if (weighThreats) {
      for (const [color, enemies] of Object.entries(allTokens) as [LudoColor, LudoToken[]][]) {
        if (color === token.color) continue;
        for (const enemy of enemies) {
          if (enemy.position < 0 || enemy.position >= 52) continue;
          const gap = (next - enemy.position + 52) % 52;
          if (gap >= 1 && gap <= 6) threats++;
        }
      }
    }
    if (weighThreats && !landingOnSafe) score -= threats * 45;

    // Progress along your own route, so an idle bot still makes ground.
    score += ((next - COLOR_START_POSITIONS[token.color] + 52) % 52) * 2;
  }

  // Leaving the yard puts another piece in play, which is nearly always right
  // early on and pointless once three are already out.
  if (token.position === -1) {
    const stillHome = allTokens[token.color].filter((t) => t.position === -1).length;
    score += 120 + stillHome * 30;
  }

  return score;
}

/**
 * Bot AI decision maker: selects a token to move.
 *
 * `skill` decides how closely the choice tracks the scoring above:
 *   easy   — plays the best move barely half the time, otherwise picks freely,
 *            so it walks its tokens into capture range like a beginner does.
 *   normal — takes the best move, but ignores the danger it is walking into.
 *   hard   — takes the best move on the full evaluation, threats included.
 */
export function chooseBestLudoMove(
  tokens: LudoToken[],
  roll: number,
  allTokens: Record<LudoColor, LudoToken[]>,
  skill: LudoBotSkill = 'normal'
): LudoToken | null {
  const validTokens = tokens.filter((t) => canMoveLudoToken(t, roll));
  if (validTokens.length === 0) return null;
  if (validTokens.length === 1) return validTokens[0];

  if (skill === 'easy' && Math.random() < 0.55) {
    return validTokens[Math.floor(Math.random() * validTokens.length)];
  }

  // The normal bot still sees captures and the run for home; it just never
  // asks what happens to the token it leaves standing there.
  const weighThreats = skill === 'hard';

  const ranked = validTokens
    .map((token) => ({ token, score: scoreLudoMove(token, roll, allTokens, weighThreats) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0].token;
}
