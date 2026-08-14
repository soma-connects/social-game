import { BoardNode, GamePhase, MiniGameId, PowerupType, SocialReactionId, TileNodeType } from './types';

/**
 * Shared between the client, the board renderer and the server.
 *
 * The voice call is a full mesh — every player holds a peer connection to every
 * other — so this is 15 connections at 6 players. That is about the ceiling for
 * mobile devices; going higher needs an SFU rather than a bigger number here.
 */
export const MAX_PLAYERS = 6;
export const TOTAL_TILES = 99;
export const DEFAULT_TURN_SECONDS = 8;

/** Rooms with no activity for this long are swept from the server cache. */
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

// ─── The turn loop ──────────────────────────────────────────────────────────
//
// Per PROJECT_GOALS.md the board is the main game and the voice rounds are the
// qualifying mini-games that feed it:
//
//   mini-game  →  points + a movement roll  →  buff shop  →  move on the board
//
// The dice is a reveal of what the mini-game earned, not a random number. Play
// badly and you shuffle forward one node; play well and you get the full six.

/**
 * Best realistic score for each mini-game, used to put them on one scale.
 * The voice arena tops out around 310 (150 x confidence + 8s x 20) while a good
 * PitchBird run clears 1000+, so raw scores are not comparable.
 */
export const MINIGAME_MAX_SCORE: Record<MiniGameId, number> = {
  voice_arena: 310,
  pitch_bird: 1200,
  // 5 rounds x 100 points. Unlike the other two this ceiling is exact rather
  // than estimated, because the scoring is bounded by design.
  solfege: 500,
  spelling_bee: 310,
  // Performer base 100 + fooling everyone bonus 80 = 180 ceiling.
  truth_or_bluff: 180,
  story_builder: 100,
  debate: 200,
  guess_the_voice: 150,
  trivia_showdown: 100,
  asteroid_defense: 300,
};

export const MINIGAME_LABELS: Record<MiniGameId, string> = {
  voice_arena: 'Voice Arena',
  pitch_bird: 'PitchBird',
  solfege: 'Karaoke',
  spelling_bee: 'Spelling Bee',
  truth_or_bluff: 'Truth or Bluff',
  story_builder: 'Story Builder',
  debate: 'Debate',
  guess_the_voice: 'Guess the Voice',
  trivia_showdown: 'Trivia Showdown',
  asteroid_defense: 'Asteroid Defense',
};

export const MINIGAME_ICONS: Record<MiniGameId, string> = {
  voice_arena: '🎙️',
  pitch_bird: '🐦',
  solfege: '🎵',
  spelling_bee: '🐝',
  truth_or_bluff: '🎭',
  story_builder: '📖',
  debate: '⚖️',
  guess_the_voice: '🕵️',
  trivia_showdown: '🧠',
  asteroid_defense: '☄️',
};

/** Raw mini-game score → 0..1 performance. */
export function scoreToPerformance(game: MiniGameId, score: number): number {
  const max = MINIGAME_MAX_SCORE[game] ?? 1;
  return Math.max(0, Math.min(1, score / max));
}

/**
 * Performance → how many nodes the player moves.
 *
 * A failed round still moves you one node. Freezing a player in place for a
 * missed word makes a party game drag, and they have already lost the points.
 */
export function performanceToSteps(performance: number): number {
  const p = Math.max(0, Math.min(1, performance));
  if (p < 0.05) return 2;
  if (p < 0.2) return 4;
  if (p < 0.4) return 6;
  if (p < 0.6) return 8;
  if (p < 0.8) return 10;
  return 12;
}

export function describePerformance(performance: number): string {
  const p = Math.max(0, Math.min(1, performance));
  if (p < 0.05) return 'Whaala! Barely moved.';
  if (p < 0.2) return 'Shaky round.';
  if (p < 0.4) return 'Decent effort.';
  if (p < 0.6) return 'Solid run!';
  if (p < 0.8) return 'Sharp! Big movement.';
  if (p < 0.95) return 'Excellent — maximum distance!';
  return 'Flawless! Maximum distance.';
}

// ─── Buff shop ──────────────────────────────────────────────────────────────
//
// Points are both the score and the currency, so buying a buff is a real
// trade-off: spend to move faster now, or hoard and stay top of the table.

/**
 * Who a powerup acts on.
 *
 * This is what decides whether using it opens a target picker. Without it every
 * item silently applied to whoever pressed the button, which is why the four
 * offensive items in the shop did nothing at all.
 */
export type PowerupTarget =
  /** Applies to the buyer. */
  | 'self'
  /** Needs an opponent chosen before it can be used. */
  | 'opponent'
  /** Picks its victim itself — no prompt. */
  | 'leader';

export type ShopItem = {
  id: PowerupType;
  name: string;
  icon: string;
  description: string;
  price: number;
  target: PowerupTarget;
  /** Shown while choosing a victim. */
  targetPrompt?: string;
};

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'boost', name: 'Rocket Nitro', icon: '🚀', description: 'Fly 3 spaces further down the road', price: 50, target: 'self' },
  {
    id: 'rewind',
    name: 'Rewind Trap',
    icon: '⏪',
    // Named "Trap" and priced above a self-boost, so it was never meant to
    // rewind the person using it — which is what it actually did.
    description: 'Shove a rival back 2 spaces',
    price: 75,
    target: 'opponent',
    targetPrompt: 'Who gets shoved back?',
  },
  { id: 'shield', name: 'Magic Shield', icon: '🛡️', description: 'Block the next asteroid, dare or freeze', price: 100, target: 'self' },
  {
    id: 'dare_gun',
    name: 'Dare Gun',
    icon: '🎤',
    description: 'Force an opponent into a live dare',
    price: 110,
    target: 'opponent',
    targetPrompt: 'Who has to perform?',
  },
  {
    id: 'freeze',
    name: 'Ice Freeze',
    icon: '❄️',
    description: 'Make an opponent miss their next roll',
    price: 125,
    target: 'opponent',
    targetPrompt: 'Who loses their turn?',
  },
  { id: 'bomb', name: 'Point Bomb', icon: '💣', description: 'Blast 50 coins off whoever is leading', price: 150, target: 'leader' },
];

/** Coins a Supply Drop tile pays out. */
export const SUPPLY_DROP_COINS = 75;

/** Coins the Point Bomb strips from the leader. */
export const BOMB_DAMAGE = 50;

export function getShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === id);
}

// ─── Social scoring ─────────────────────────────────────────────────────────
//
// Shared by the server and the laugh meter. Keep them here rather than in both
// places: if the two copies drift, the meter shows the room one bonus while the
// server awards another.

export const REACTION_POINTS: Record<SocialReactionId, number> = {
  laugh: 12,
  fire: 10,
  almost: 8,
  drama: 14,
};

/** Ceiling on the reaction bonus, so a big room cannot dwarf actual accuracy. */
export const MAX_REACTION_BONUS = 60;

/** Awarded when the peer judges vote a round through. */
export const JUDGE_PASS_BONUS = 35;

export function sumReactionBonus(reactions: { reaction: SocialReactionId }[]): number {
  return Math.min(
    MAX_REACTION_BONUS,
    reactions.reduce((sum, r) => sum + REACTION_POINTS[r.reaction], 0)
  );
}

// ─── Teams ──────────────────────────────────────────────────────────────────
//
// Team mode keeps everyone performing solo — the energy of the game comes from
// one person on the mic with the room watching, and splitting that in half
// would waste it. What teams change is who you are performing *for*: your
// points feed a shared total, the opposing side judges you, and the finish line
// is won by a team rather than a person.

export type TeamId = 'red' | 'blue';

export const TEAMS: { id: TeamId; name: string; color: string; icon: string }[] = [
  { id: 'red', name: 'Red Crew', color: '#EF4444', icon: '🔴' },
  { id: 'blue', name: 'Blue Crew', color: '#38BDF8', icon: '🔵' },
];

export function getTeam(id: TeamId | undefined) {
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0];
}

/** Do two arrangements pair the same people together? Colour swaps do not count. */
function sameGrouping(a: Set<string>, redBefore: Set<string>, blueBefore: Set<string>): boolean {
  const equals = (x: Set<string>, y: Set<string>) =>
    x.size === y.size && [...x].every((id) => y.has(id));
  return equals(a, redBefore) || equals(a, blueBefore);
}

/**
 * Draws crews at random, evenly.
 *
 * Deciding teams out loud is the least fun part of a party game — somebody ends
 * up picked last. Letting the room blame the shuffle removes that entirely.
 *
 * Replaces an older `balanceTeams` that alternated by array index. That was
 * fully deterministic: the same set of players in the same join order always
 * produced the same two crews, so pressing the button again visibly did
 * nothing, and the first crew you were given was the only one on offer.
 *
 * An odd headcount puts the spare player on red. Re-rolling avoids handing back
 * the grouping the room already has, so a second press is never a no-op while
 * another arrangement exists.
 */
export function shuffleTeams<T extends { id: string; teamId?: TeamId }>(players: T[]): T[] {
  if (players.length < 2) {
    return players.map((player) => ({ ...player, teamId: 'red' as TeamId }));
  }

  const redBefore = new Set(players.filter((p) => p.teamId === 'red').map((p) => p.id));
  const blueBefore = new Set(players.filter((p) => p.teamId === 'blue').map((p) => p.id));
  // Only worth avoiding a repeat if everyone already had a crew, and if more
  // than one arrangement actually exists — with two players there is only one.
  const avoidRepeat = redBefore.size + blueBefore.size === players.length && players.length >= 3;

  let assignment = new Map<string, TeamId>();

  for (let attempt = 0; attempt < 12; attempt++) {
    const order = [...players];
    // Fisher-Yates. Sorting by Math.random() is the usual shortcut here and it
    // is biased — with six players that bias is visible over an evening.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    assignment = new Map(order.map((p, i) => [p.id, (i % 2 === 0 ? 'red' : 'blue') as TeamId]));
    if (!avoidRepeat) break;

    const redNow = new Set(order.filter((p) => assignment.get(p.id) === 'red').map((p) => p.id));
    if (!sameGrouping(redNow, redBefore, blueBefore)) break;
  }

  return players.map((player) => ({ ...player, teamId: assignment.get(player.id) ?? 'red' }));
}

/** Interleaves the roll order so the sides alternate instead of batching. */
export function alternateByTeam<T extends { teamId?: TeamId }>(ordered: T[]): T[] {
  const red = ordered.filter((p) => p.teamId === 'red');
  const blue = ordered.filter((p) => p.teamId === 'blue');
  // The side whose best player scored highest keeps the first slot.
  const [first, second] = ordered[0]?.teamId === 'blue' ? [blue, red] : [red, blue];

  const woven: T[] = [];
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    if (first[i]) woven.push(first[i]);
    if (second[i]) woven.push(second[i]);
  }
  return woven;
}

export const ALL_MINI_GAMES: MiniGameId[] = [
  'voice_arena',
  'pitch_bird',
  'solfege',
  'spelling_bee',
  'truth_or_bluff',
  'story_builder',
  'debate',
  'guess_the_voice',
  'trivia_showdown',
  'asteroid_defense',
];
export const BOARD_MINI_GAMES: MiniGameId[] = ['voice_arena', 'pitch_bird', 'solfege', 'truth_or_bluff', 'trivia_showdown', 'asteroid_defense'];

/** Maps a mini-game to the phase that runs it. */
export function miniGamePhase(game: MiniGameId): GamePhase {
  if (game === 'pitch_bird') return 'pitch_bird';
  if (game === 'solfege') return 'solfege';
  if (game === 'truth_or_bluff') return 'truth_or_bluff';
  if (game === 'story_builder') return 'story_builder';
  if (game === 'debate') return 'debate';
  if (game === 'guess_the_voice') return 'guess_the_voice';
  if (game === 'trivia_showdown') return 'trivia_showdown';
  if (game === 'asteroid_defense') return 'asteroid_defense';
  return 'qualifying_voice';
}

/** Picks the mini-game for a turn from whatever the host enabled. */
export function pickMiniGame(enabled: MiniGameId[], isBoardGame: boolean = true): MiniGameId {
  let pool = enabled.length > 0 ? enabled : ALL_MINI_GAMES;
  if (isBoardGame) {
    pool = pool.filter(g => BOARD_MINI_GAMES.includes(g));
    if (pool.length === 0) pool = ['voice_arena'];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export const BOARD_GRAPH: Record<number, BoardNode> = {
  0: { id: 0, type: 'normal', next: [24], x: 15, y: 85 },
  1: { id: 1, type: 'buff', next: [27], x: 10, y: 65 },
  2: { id: 2, type: 'normal', next: [30], x: 12, y: 45 },
  3: { id: 3, type: 'dare', next: [33, 36], x: 20, y: 25 },
  4: { id: 4, type: 'normal', next: [39], x: 35, y: 15 },
  5: { id: 5, type: 'buff', next: [42], x: 55, y: 12 },
  6: { id: 6, type: 'mystery', next: [45], x: 75, y: 18 },
  7: { id: 7, type: 'debuff', next: [48], x: 35, y: 35 },
  8: { id: 8, type: 'trap', next: [51], x: 50, y: 30 },
  9: { id: 9, type: 'duel', next: [54], x: 65, y: 32 },
  10: { id: 10, type: 'bonus', next: [57], x: 75, y: 38 },
  11: { id: 11, type: 'dare', next: [60], x: 82, y: 45 },
  12: { id: 12, type: 'normal', next: [63], x: 88, y: 55 },
  13: { id: 13, type: 'mystery', next: [66], x: 85, y: 75 },
  14: { id: 14, type: 'debuff', next: [69, 72], x: 70, y: 88 },
  15: { id: 15, type: 'bonus', next: [75], x: 50, y: 92 },
  16: { id: 16, type: 'trap', next: [78], x: 30, y: 88 },
  17: { id: 17, type: 'duel', next: [81], x: 22, y: 75 },
  18: { id: 18, type: 'dare', next: [84], x: 65, y: 75 },
  19: { id: 19, type: 'buff', next: [87], x: 55, y: 70 },
  20: { id: 20, type: 'normal', next: [90], x: 45, y: 72 },
  21: { id: 21, type: 'mystery', next: [93], x: 35, y: 65 },
  22: { id: 22, type: 'buff', next: [96], x: 40, y: 55 },
  23: { id: 23, type: 'normal', next: [], x: 50, y: 50 },
  24: { id: 24, type: 'empty', next: [25], x: 15.1, y: 79.7 },
  25: { id: 25, type: 'empty', next: [26], x: 14.4, y: 74.5 },
  26: { id: 26, type: 'empty', next: [1], x: 12.6, y: 69.7 },
  27: { id: 27, type: 'empty', next: [28], x: 11.9, y: 60.1 },
  28: { id: 28, type: 'empty', next: [29], x: 13, y: 55.2 },
  29: { id: 29, type: 'empty', next: [2], x: 12.9, y: 50.1 },
  30: { id: 30, type: 'empty', next: [31], x: 15.3, y: 40.5 },
  31: { id: 31, type: 'empty', next: [32], x: 17.9, y: 35.7 },
  32: { id: 32, type: 'empty', next: [3], x: 19.3, y: 30.5 },
  33: { id: 33, type: 'empty', next: [34], x: 24.5, y: 23.7 },
  34: { id: 34, type: 'empty', next: [35], x: 28.6, y: 21.7 },
  35: { id: 35, type: 'empty', next: [4], x: 32, y: 18.7 },
  36: { id: 36, type: 'empty', next: [37], x: 23, y: 28.7 },
  37: { id: 37, type: 'empty', next: [38], x: 26.4, y: 31.7 },
  38: { id: 38, type: 'empty', next: [7], x: 30.5, y: 33.7 },
  39: { id: 39, type: 'empty', next: [40], x: 40.2, y: 15.6 },
  40: { id: 40, type: 'empty', next: [41], x: 45.3, y: 15.5 },
  41: { id: 41, type: 'empty', next: [5], x: 50.2, y: 14.1 },
  42: { id: 42, type: 'empty', next: [43], x: 59.6, y: 14.9 },
  43: { id: 43, type: 'empty', next: [44], x: 64.4, y: 16.9 },
  44: { id: 44, type: 'empty', next: [6], x: 69.6, y: 17.9 },
  45: { id: 45, type: 'empty', next: [46], x: 76.9, y: 27.7 },
  46: { id: 46, type: 'empty', next: [47], x: 79.6, y: 37.2 },
  47: { id: 47, type: 'empty', next: [12], x: 83.4, y: 46.2 },
  48: { id: 48, type: 'empty', next: [49], x: 39.2, y: 35.1 },
  49: { id: 49, type: 'empty', next: [50], x: 43.1, y: 34.4 },
  50: { id: 50, type: 'empty', next: [8], x: 46.7, y: 32.6 },
  51: { id: 51, type: 'empty', next: [52], x: 53.6, y: 31.9 },
  52: { id: 52, type: 'empty', next: [53], x: 57.2, y: 33 },
  53: { id: 53, type: 'empty', next: [9], x: 61.1, y: 32.9 },
  54: { id: 54, type: 'empty', next: [55], x: 66.8, y: 34.7 },
  55: { id: 55, type: 'empty', next: [56], x: 69, y: 36.7 },
  56: { id: 56, type: 'empty', next: [10], x: 71.8, y: 37.7 },
  57: { id: 57, type: 'empty', next: [58], x: 75.8, y: 40.8 },
  58: { id: 58, type: 'empty', next: [59], x: 77.1, y: 42.9 },
  59: { id: 59, type: 'empty', next: [11], x: 79.3, y: 44.3 },
  60: { id: 60, type: 'empty', next: [61], x: 82.3, y: 48.2 },
  61: { id: 61, type: 'empty', next: [62], x: 83.3, y: 51 },
  62: { id: 62, type: 'empty', next: [12], x: 85.3, y: 53.2 },
  63: { id: 63, type: 'empty', next: [64], x: 85.9, y: 59.8 },
  64: { id: 64, type: 'empty', next: [65], x: 84.5, y: 64.7 },
  65: { id: 65, type: 'empty', next: [13], x: 84.4, y: 69.8 },
  66: { id: 66, type: 'empty', next: [67], x: 80.3, y: 77.2 },
  67: { id: 67, type: 'empty', next: [68], x: 76.2, y: 80 },
  68: { id: 68, type: 'empty', next: [14], x: 72.8, y: 83.7 },
  69: { id: 69, type: 'empty', next: [70], x: 64.7, y: 87.6 },
  70: { id: 70, type: 'empty', next: [71], x: 59.6, y: 88 },
  71: { id: 71, type: 'empty', next: [15], x: 54.7, y: 89.6 },
  72: { id: 72, type: 'empty', next: [73], x: 70.1, y: 84.2 },
  73: { id: 73, type: 'empty', next: [74], x: 69.4, y: 80.8 },
  74: { id: 74, type: 'empty', next: [18], x: 67.6, y: 77.7 },
  75: { id: 75, type: 'empty', next: [76], x: 45.3, y: 89.6 },
  76: { id: 76, type: 'empty', next: [77], x: 40.4, y: 88 },
  77: { id: 77, type: 'empty', next: [16], x: 35.3, y: 87.6 },
  78: { id: 78, type: 'empty', next: [79], x: 29.2, y: 84 },
  79: { id: 79, type: 'empty', next: [80], x: 27.7, y: 80.5 },
  80: { id: 80, type: 'empty', next: [17], x: 25.2, y: 77.5 },
  81: { id: 81, type: 'empty', next: [82], x: 27.6, y: 70.9 },
  82: { id: 82, type: 'empty', next: [83], x: 32.5, y: 66.3 },
  83: { id: 83, type: 'empty', next: [22], x: 36.6, y: 60.9 },
  84: { id: 84, type: 'empty', next: [85], x: 63.1, y: 72.5 },
  85: { id: 85, type: 'empty', next: [86], x: 60.9, y: 70.7 },
  86: { id: 86, type: 'empty', next: [19], x: 58.1, y: 70 },
  87: { id: 87, type: 'empty', next: [88], x: 52.2, y: 69.1 },
  88: { id: 88, type: 'empty', next: [89], x: 49.6, y: 69 },
  89: { id: 89, type: 'empty', next: [20], x: 47.2, y: 70.1 },
  90: { id: 90, type: 'empty', next: [91], x: 43.3, y: 69.1 },
  91: { id: 91, type: 'empty', next: [92], x: 41.1, y: 66.9 },
  92: { id: 92, type: 'empty', next: [21], x: 38.3, y: 65.6 },
  93: { id: 93, type: 'empty', next: [94], x: 37.5, y: 63.1 },
  94: { id: 94, type: 'empty', next: [95], x: 39.3, y: 60.9 },
  95: { id: 95, type: 'empty', next: [22], x: 40, y: 58.1 },
  96: { id: 96, type: 'empty', next: [97], x: 43.1, y: 55 },
  97: { id: 97, type: 'empty', next: [98], x: 45.9, y: 54.3 },
  98: { id: 98, type: 'empty', next: [23], x: 48.1, y: 52.5 },
};

// ─── Moving on the graph ────────────────────────────────────────────────────
//
// Node ids are identifiers, NOT distances. Ids 0–23 are the feature tiles and
// 24–98 are the filler nodes that draw the curve between them, so `id + 5` is
// a jump to an unrelated corner of the map rather than five spaces forward.
// Anything that moves a player has to walk the `next` edges instead.

/** Reverse adjacency, so a player can be pushed back along the road they came. */
const PREV_NODES: Record<number, number[]> = (() => {
  const prev: Record<number, number[]> = {};
  for (const node of Object.values(BOARD_GRAPH)) {
    for (const nextId of node.next) (prev[nextId] ??= []).push(node.id);
  }
  return prev;
})();

/** The one node with nowhere left to go — the board's actual finish line. */
export const FINISH_NODE: number =
  Object.values(BOARD_GRAPH).find((node) => node.next.length === 0)?.id ?? TOTAL_TILES - 1;

/**
 * Nodes travelled from the launchpad to reach each node.
 *
 * Ids are not ordered along the road — node 24 sits one step from the start
 * while node 23 is the finish — so "node id / 99" reads as nonsense progress.
 * This is the number the UI should show.
 */
export const BOARD_DEPTH: Record<number, number> = (() => {
  const depth: Record<number, number> = { 0: 0 };
  const queue = [0];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const nextId of BOARD_GRAPH[id]?.next ?? []) {
      if (depth[nextId] === undefined) {
        depth[nextId] = depth[id] + 1;
        queue.push(nextId);
      }
    }
  }
  return depth;
})();

/** Total steps from the launchpad to the finish, for progress readouts. */
export const BOARD_LENGTH: number = BOARD_DEPTH[FINISH_NODE] ?? TOTAL_TILES - 1;

/** How far along the road a player is, in steps. */
export function boardProgress(position: number): number {
  return BOARD_DEPTH[position] ?? 0;
}

/**
 * Walks `steps` nodes along the road, stopping early at the finish.
 *
 * At a fork this takes the first branch. Only tile effects use that — a real
 * dice move hands the choice to the player via the branch_choice phase.
 */
export function walkForward(from: number, steps: number): number {
  let current = from;
  for (let i = 0; i < steps; i++) {
    const node = BOARD_GRAPH[current];
    if (!node || node.next.length === 0) break;
    current = node.next[0];
  }
  return current;
}

/** Walks `steps` nodes back down the road, stopping at the launchpad. */
export function walkBack(from: number, steps: number): number {
  let current = from;
  for (let i = 0; i < steps; i++) {
    const prev = PREV_NODES[current];
    if (!prev || prev.length === 0) break;
    current = prev[0];
  }
  return current;
}

export type TileOutcome = {
  /** Board position after the tile effect is applied. */
  position: number;
  banner: string | null;
  message: string;
  triggersDare: boolean;
  triggersDuel: boolean;
  triggersTrap: boolean;
  isFinish: boolean;

  grantsShield?: boolean;
  breaksShield?: boolean;
  skipNextTurn?: boolean;
  extraRoll?: boolean;
  /**
   * Whether the tile moved the player backwards. Node ids are not ordered
   * along the road, so callers cannot tell by comparing before/after.
   */
  setback?: boolean;
  /** Coins the tile pays out (or takes, if negative). */
  coins?: number;
};

export function resolveTile(position: number, playerHasShield: boolean = false): TileOutcome {
  const clamped = BOARD_GRAPH[position] ? position : 0;

  const finish = (): TileOutcome => ({
    position: FINISH_NODE,
    banner: '🏆 FINISH LINE REACHED!',
    message: 'Victory! The roadmap is complete.',
    triggersDare: false,
    triggersDuel: false,
    triggersTrap: false,
    isFinish: true,
  });

  if (clamped === FINISH_NODE) return finish();

  const nodeType = BOARD_GRAPH[clamped]?.type || 'normal';

  // WORMHOLE (Teleport / Shortcut)
  if (nodeType === 'buff') {
    const warped = walkForward(clamped, 5);
    if (warped === FINISH_NODE) return finish();
    return {
      position: warped,
      banner: '🌌 WORMHOLE! TELEPORT +5 SPACES!',
      message: 'You entered a wormhole and warped across space.',
      triggersDare: false,
      triggersDuel: false,
      triggersTrap: false,
      isFinish: false,
    };
  }

  // SPACE STATION (Shield Buff)
  if (nodeType === 'mystery') {
    return {
      position: clamped,
      banner: '🛡️ SPACE STATION: SHIELD ACQUIRED!',
      message: 'Docked at the station. Your ship is now shielded against the next asteroid strike!',
      triggersDare: false,
      triggersDuel: false,
      triggersTrap: false,
      isFinish: false,
      grantsShield: true,
    };
  }

  // ASTEROID STRIKE (Debuff / Trap)
  if (nodeType === 'debuff' || nodeType === 'trap') {
    if (playerHasShield) {
      return {
        position: clamped,
        banner: '🛡️ ASTEROID DEFLECTED!',
        message: 'Your Space Station shield absorbed the impact!',
        triggersDare: false,
        triggersDuel: false,
        triggersTrap: false,
        isFinish: false,
        breaksShield: true,
      };
    } else {
      return {
        position: walkBack(clamped, 3),
        banner: '💥 ASTEROID STRIKE! PUSHED BACK 3 SPACES!',
        message: 'Hull breached! Forced to retreat 3 spaces.',
        triggersDare: false,
        triggersDuel: false,
        triggersTrap: nodeType === 'trap',
        isFinish: false,
        setback: true,
      };
    }
  }

  // SUPPLY DROP (Bonus)
  //
  // There are two of these on the board and they had no case here at all, so
  // landing on one printed "Landed safely" and did nothing. Coins rather than
  // movement, so the board has a tile that feeds the shop instead of the race.
  if (nodeType === 'bonus') {
    return {
      position: clamped,
      banner: '📦 SUPPLY DROP! +75 COINS!',
      message: `Salvage secured — ${SUPPLY_DROP_COINS} coins for the buff shop.`,
      triggersDare: false,
      triggersDuel: false,
      triggersTrap: false,
      isFinish: false,
      coins: SUPPLY_DROP_COINS,
    };
  }

  if (nodeType === 'dare') {
    // The shield is sold as blocking "the next asteroid, dare or freeze", and
    // this is the dare half of that promise.
    if (playerHasShield) {
      return {
        position: clamped,
        banner: '🛡️ DARE DEFLECTED!',
        message: 'Your shield talked the crew out of it. Shield spent.',
        triggersDare: false,
        triggersDuel: false,
        triggersTrap: false,
        isFinish: false,
        breaksShield: true,
      };
    }
    return {
      position: clamped,
      banner: '🎤 DARE TILE!',
      message: 'The crew has a dare for you — and they are judging it.',
      triggersDare: true,
      triggersDuel: false,
      triggersTrap: false,
      isFinish: false,
    };
  }

  if (nodeType === 'duel') {
    return {
      position: clamped,
      banner: '⚔️ DUEL TILE!',
      message: 'A rival is pulled in to argue it out — the room decides.',
      triggersDare: false,
      triggersDuel: true,
      triggersTrap: false,
      isFinish: false,
    };
  }

  return {
    position: clamped,
    banner: null,
    message: 'Landed safely.',
    triggersDare: false,
    triggersDuel: false,
    triggersTrap: false,
    isFinish: false,
  };
}
