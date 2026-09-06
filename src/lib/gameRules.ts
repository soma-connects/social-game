import { BoardNode, GamePhase, MiniGameId, Player, PowerupType, SocialReactionId, TileNodeType } from './types';

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
  {
    id: 'mine',
    name: 'Buried Mine',
    icon: '💥',
    // Planted on the road ahead rather than on a chosen player: it costs a life
    // from whoever walks into it, which may well turn out to be you.
    description: 'Bury a hidden mine up the road — costs a life to whoever finds it',
    price: 130,
    target: 'self',
  },
];

/** How far ahead of the planter a Buried Mine is laid. */
export const MINE_PLANT_DISTANCE = 4;

/** How far a mine blast throws you back, on top of the life it takes. */
export const MINE_SETBACK = 3;

// ─── Lives ──────────────────────────────────────────────────────────────────
//
// Points are what you win on; lives are what you survive on. They deliberately
// do not interact: a player can be top of the table and still one bad round
// from the launchpad, which is what keeps a runaway leader watchable.

export const STARTING_LIVES = 3;

/**
 * Performance at or below which a round counts as bombed.
 *
 * Lines up with the "Shaky round" tier in describePerformance, so the words the
 * room reads and the life they just lost agree with each other.
 */
export const MINIGAME_FAIL_THRESHOLD = 0.2;

/**
 * Takes one life. What happens at zero is the caller's business.
 *
 * The two games disagree deliberately: the board is long, so running out sends
 * you back to the launchpad with a fresh bar (`respawnToStart`), while the AI
 * Master game is short enough that being knocked out is the point.
 */
export function loseLife(player: Player): { livesLeft: number; empty: boolean } {
  const livesLeft = Math.max(0, (player.lives ?? STARTING_LIVES) - 1);
  player.lives = livesLeft;
  return { livesLeft, empty: livesLeft <= 0 };
}

/** Puts a wiped-out board player back on the launchpad with a full bar. */
export function respawnToStart(player: Player): void {
  player.lives = STARTING_LIVES;
  player.boardPosition = 0;
  delete player.remainingSteps;
}

/** Coins a Supply Drop tile pays out. */
// ─── Heat: momentum across rounds ───────────────────────────────────────────
//
// Every round used to be scored in isolation: you played, you banked coins, and
// nothing at all carried into the next one. That makes a long match feel like a
// series of unrelated auditions rather than a run — there is never a moment
// where a player has something to protect.
//
// Heat is that something. Consecutive decent rounds build a streak, the streak
// pays a rising multiplier on coins, and one bad round takes it all away. The
// reward for a hot streak is real but bounded, because the point is the tension
// of holding one, not the arithmetic.

/**
 * Performance a round needs to keep a streak alive.
 *
 * Set at the "Decent effort" tier in describePerformance rather than at
 * MINIGAME_FAIL_THRESHOLD. Surviving on rounds you barely scraped would let a
 * streak run for an entire match without the player ever playing well, which
 * makes the multiplier meaningless.
 */
export const STREAK_KEEP_THRESHOLD = 0.4;

export type HeatTier = {
  /** Consecutive qualifying rounds needed to reach this tier. */
  min: number;
  label: string;
  icon: string;
  /** Multiplier applied to coins earned this round. */
  multiplier: number;
  /** Extra board steps the tier is worth, on top of what performance earned. */
  stepBonus: number;
  color: string;
};

/**
 * Ordered coldest first. Deliberately shallow at the bottom — a player on a
 * two-round streak gets a small nudge and a label, not a runaway lead — and it
 * tops out at five so the ceiling is reachable inside one evening.
 */
export const HEAT_TIERS: HeatTier[] = [
  { min: 0, label: 'Cold', icon: '', multiplier: 1, stepBonus: 0, color: '#94A3B8' },
  { min: 2, label: 'Warmed Up', icon: '✨', multiplier: 1.15, stepBonus: 0, color: '#FACC15' },
  { min: 3, label: 'Heating Up', icon: '🔥', multiplier: 1.3, stepBonus: 0, color: '#FB923C' },
  { min: 4, label: 'On Fire', icon: '🔥', multiplier: 1.5, stepBonus: 1, color: '#F87171' },
  { min: 5, label: 'Unstoppable', icon: '⚡', multiplier: 1.75, stepBonus: 1, color: '#E879F9' },
];

export function heatTier(streak: number): HeatTier {
  let tier = HEAT_TIERS[0];
  for (const candidate of HEAT_TIERS) {
    if (streak >= candidate.min) tier = candidate;
  }
  return tier;
}

/** Whether a streak is high enough to be worth showing off. */
export function isHot(streak: number): boolean {
  return heatTier(streak).multiplier > 1;
}

/**
 * Applies the streak multiplier to a round's coins.
 *
 * Takes the streak *including* the round being scored, so the first qualifying
 * round pays flat and the bonus only appears once a run actually exists.
 */
export function applyHeat(coins: number, streak: number): number {
  return Math.round(coins * heatTier(streak).multiplier);
}

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

/** How many recent picks the repeat rule looks back over. */
export const MINIGAME_HISTORY_WINDOW = 6;

/** Appearances inside that window before a game is rested. */
export const MINIGAME_REPEAT_LIMIT = 2;

/**
 * Picks the mini-game for a turn from whatever the host enabled.
 *
 * Uniform random is memoryless, which is not what "random" means to a room full
 * of people: it will happily serve the same game four turns running, and that
 * reads as broken rather than unlucky. With six board games a straight repeat is
 * a one-in-six event on every single turn.
 *
 * So a game that has already come up `MINIGAME_REPEAT_LIMIT` times in the last
 * `MINIGAME_HISTORY_WINDOW` picks is rested, and the game played immediately
 * before is skipped outright. Both rules are preferences, not guarantees — they
 * relax in order if they would leave nothing to choose from, so a host who
 * enabled a single game still gets that game.
 */
export function pickMiniGame(
  enabled: MiniGameId[],
  isBoardGame: boolean = true,
  recent: MiniGameId[] = [],
  preferred: MiniGameId[] = []
): MiniGameId {
  let pool = enabled.length > 0 ? enabled : ALL_MINI_GAMES;
  if (isBoardGame) {
    pool = pool.filter((g) => BOARD_MINI_GAMES.includes(g));
    if (pool.length === 0) pool = ['voice_arena'];
  }

  const window = recent.slice(-MINIGAME_HISTORY_WINDOW);
  const appearances = (game: MiniGameId) => window.filter((g) => g === game).length;
  const previous = recent[recent.length - 1];

  // Strictest first: rested games out, and never the same game twice running.
  const fresh = pool.filter((g) => appearances(g) < MINIGAME_REPEAT_LIMIT && g !== previous);
  // Then allow an over-played game back, but still not back-to-back.
  const notPrevious = pool.filter((g) => g !== previous);

  const candidates = fresh.length > 0 ? fresh : notPrevious.length > 0 ? notPrevious : pool;

  // Room-vibe bias: narrow to the vibe's preferred games when any survive the
  // repeat rules above, so the mood shapes selection without ever overriding
  // "don't repeat too much" or "the host only enabled these games".
  const onVibe = candidates.filter((g) => preferred.includes(g));
  const finalists = onVibe.length > 0 ? onVibe : candidates;

  return finalists[Math.floor(Math.random() * finalists.length)];
}

/** Records a pick, keeping only what the repeat rule needs. */
export function rememberMiniGame(recent: MiniGameId[] | undefined, game: MiniGameId): MiniGameId[] {
  return [...(recent ?? []), game].slice(-MINIGAME_HISTORY_WINDOW);
}

/**
 * Upper bound on the archived mini-game log.
 *
 * High enough that no realistic match reaches it — a long evening is well under
 * a hundred rounds — and low enough that a stuck room cannot grow the document
 * the whole table re-reads on every poll.
 */
export const PLAYED_MINIGAMES_LIMIT = 200;

/** Appends to the permanent per-match log the archive reads. */
export function recordPlayedMiniGame(
  played: MiniGameId[] | undefined,
  game: MiniGameId
): MiniGameId[] {
  return [...(played ?? []), game].slice(-PLAYED_MINIGAMES_LIMIT);
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
export const PREV_NODES: Record<number, number[]> = (() => {
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

// ─── Slipstream: staying in the race ────────────────────────────────────────
//
// The board is ~24 nodes deep and every player moves on their own merit, so a
// player who has a bad opening two rounds is, in practice, out of it — while
// still being required to sit through another twenty minutes of the match.
// That is the single fastest way to lose a room's attention.
//
// Slipstream is the standard party-game answer: the further behind the leader
// you are, the more steps you get. It is capped low enough that it never
// overtakes playing well — a hot player still outruns it — and it is announced
// out loud, because a catch-up bonus that happens silently reads as the board
// being buggy rather than as the game keeping you in it.

/**
 * Steps of deficit that buy one bonus step.
 *
 * Proportional to the gap rather than a few fixed bands, and this matters more
 * than it looks. The board is only about five turns long for a strong player,
 * so a catch-up bonus has very few turns in which to do anything: a flat "+1 if
 * you are a long way behind" is spent long before it closes a gap that is still
 * growing. Scaling with the deficit makes the bonus self-correcting — it grows
 * while a player keeps losing ground and disappears the moment they stop.
 *
 * Simulated over the full match loop, this is what holds a room together: the
 * last-placed player finishes around 60% of the leader's distance with it and
 * around 43% without, across realistic spreads of per-mini-game aptitude.
 */
export const SLIPSTREAM_STEPS_PER_GAP = 3;

/** Most steps slipstream will ever hand out in one roll. */
export const SLIPSTREAM_MAX_STEPS = 6;

/**
 * Bonus steps for trailing the leader, as a function of the gap.
 *
 * Measured in board depth (steps walked from the launchpad), not node ids —
 * ids are identifiers rather than distances, so subtracting them is nonsense.
 *
 * Capped deliberately below the spread of the step ladder, so it never inverts
 * the result of a round: a player who aces the mini-game still out-runs a
 * player who bombed it and is being carried by the deficit bonus.
 */
/**
 * How long a player can go without a heartbeat before they count as gone.
 *
 * Shared rather than server-only because the board previews the bonuses a roll
 * has already earned, and that preview has to pick the same leader the server
 * will. A client that only checked `connected` would keep counting somebody who
 * closed their laptop as the pace-setter, and quietly show a slipstream figure
 * the roll then contradicts.
 */
export const PRESENCE_TIMEOUT_MS = 25000;

/** Whether a player is still in the room, by connection flag and heartbeat. */
export function isPresent(
  player: { connected?: boolean; lastSeen?: number },
  now: number = Date.now()
): boolean {
  return player.connected !== false && now - (player.lastSeen ?? now) < PRESENCE_TIMEOUT_MS;
}

/** Board depth of whoever is furthest along, ignoring players who have gone. */
export function leaderProgressOf(
  players: { connected?: boolean; lastSeen?: number; boardPosition: number }[],
  now: number = Date.now()
): number {
  return players.reduce(
    (best, player) => (isPresent(player, now) ? Math.max(best, boardProgress(player.boardPosition)) : best),
    0
  );
}

export function slipstreamSteps(progress: number, leaderProgress: number): number {
  const gap = leaderProgress - progress;
  if (gap <= 0) return 0;
  return Math.min(SLIPSTREAM_MAX_STEPS, Math.floor(gap / SLIPSTREAM_STEPS_PER_GAP));
}

/** The line the room sees when slipstream fires. */
export function slipstreamLabel(steps: number): string {
  if (steps >= 3) return '🌪️ FULL SLIPSTREAM';
  if (steps === 2) return '💨 SLIPSTREAM';
  return '💨 DRAFTING';
}

/**
 * Everything that decides how far one player moves this turn.
 *
 * Kept as one function returning its own breakdown so the server and the UI
 * cannot disagree about the number: the board shows exactly the components the
 * server added up, which is what makes an unexpected roll feel earned rather
 * than arbitrary.
 */
export type MoveBreakdown = {
  /** Steps the mini-game performance bought. */
  base: number;
  /** Extra steps from the player's heat tier. */
  heat: number;
  /** Extra steps for trailing the leader. */
  slipstream: number;
  /** What the dice actually shows. */
  total: number;
};

export function computeMove(
  performance: number,
  streak: number,
  progress: number,
  leaderProgress: number
): MoveBreakdown {
  const base = performanceToSteps(performance);
  const heat = heatTier(streak).stepBonus;
  const slipstream = slipstreamSteps(progress, leaderProgress);
  return { base, heat, slipstream, total: base + heat + slipstream };
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

// ─── Closing awards ─────────────────────────────────────────────────────────
//
// A match already collects far more than it ever shows: every player's average
// performance, their best single round, how often they bombed, how hot they got
// and how much of the board they clawed back. All of it was thrown away at the
// final whistle, which showed one name and one number.
//
// That is a waste of the most valuable minute in a party game. The argument
// after the match — who was actually funniest, who choked, who nearly had it —
// is the part people stay for, and it only happens if the game hands the room
// something to argue about.
//
// Every award below is derived from state the match was already tracking, so
// this costs nothing at play time.

export type Award = {
  id: string;
  title: string;
  icon: string;
  playerId: string;
  playerName: string;
  /** One line saying what they actually did to earn it. */
  detail: string;
  color: string;
};

/** Mean performance across the rounds a player actually took. */
export function averagePerformance(player: Player): number {
  const rounds = player.roundsPlayed ?? 0;
  if (rounds <= 0) return 0;
  return (player.performanceTotal ?? 0) / rounds;
}

/**
 * How much of their worst deficit a player clawed back by the final whistle.
 *
 * Worst gap behind the leader, minus the gap they finished on. Someone who fell
 * twelve steps behind and finished level scores 12; someone who led wire to
 * wire scores 0, which is the distinction the award exists to make.
 */
export function comebackDistance(player: Player, leaderProgress: number): number {
  const finalDeficit = Math.max(0, leaderProgress - boardProgress(player.boardPosition));
  return Math.max(0, (player.worstDeficit ?? 0) - finalDeficit);
}

/**
 * One award category: how to score it, and how to phrase it once won.
 *
 * `score` returns null for a player who does not qualify at all, which is what
 * keeps the ceremony honest — nobody is handed "Comeback Kid" for a match they
 * led wire to wire.
 */
type AwardContext = {
  /** Board depth of whoever finished furthest along. */
  leaderProgress: number;
};

type AwardSpec = {
  id: string;
  title: string;
  icon: string;
  color: string;
  score: (player: Player, ctx: AwardContext) => number | null;
  detail: (player: Player, ctx: AwardContext) => string;
};

const AWARD_SPECS: AwardSpec[] = [
  {
    id: 'mvp',
    title: 'MVP',
    icon: '👑',
    color: '#FFD000',
    score: (p) => p.score,
    detail: (p) => `${p.score} coins banked`,
  },
  {
    id: 'hottest',
    title: 'Hot Streak',
    icon: '🔥',
    color: '#FB923C',
    // Three in a row is the first streak that took real holding.
    score: (p) => ((p.bestStreak ?? 0) >= 3 ? p.bestStreak! : null),
    detail: (p) => `${p.bestStreak} strong rounds back to back`,
  },
  {
    id: 'crowd',
    title: 'Crowd Favourite',
    icon: '😂',
    color: '#F472B6',
    score: (p) => ((p.vibeScore ?? 0) > 0 ? p.vibeScore! : null),
    detail: (p) => `${p.vibeScore} vibe from the room`,
  },
  {
    id: 'consistent',
    title: 'Mr/Ms Reliable',
    icon: '🎯',
    color: '#38BDF8',
    // Needs a real sample — one lucky round is not consistency — and a real
    // average, because an award called Reliable has to mean it.
    score: (p) =>
      (p.roundsPlayed ?? 0) >= 3 && averagePerformance(p) >= 0.5 ? averagePerformance(p) : null,
    detail: (p) => `${Math.round(averagePerformance(p) * 100)}% average across ${p.roundsPlayed} rounds`,
  },
  {
    id: 'highlight',
    title: 'Highlight of the Night',
    icon: '🌟',
    color: '#A78BFA',
    // A highlight has to actually be one.
    score: (p) => ((p.bestRound?.performance ?? 0) >= 0.6 ? p.bestRound!.performance : null),
    detail: (p) =>
      p.bestRound
        ? `${Math.round(p.bestRound.performance * 100)}% in ${MINIGAME_LABELS[p.bestRound.game]}`
        : '',
  },
  {
    id: 'comeback',
    title: 'Comeback Kid',
    icon: '🚀',
    color: '#34D399',
    // A fifth of the board recovered, or it was not a comeback.
    score: (p, ctx) => {
      const recovered = comebackDistance(p, ctx.leaderProgress);
      return recovered >= BOARD_LENGTH * 0.2 ? recovered : null;
    },
    detail: (p, ctx) => `pulled back ${comebackDistance(p, ctx.leaderProgress)} spaces on the leader`,
  },
  {
    id: 'wahala',
    title: 'Wahala Merchant',
    icon: '💥',
    color: '#F87171',
    // Affectionate, not a punishment: in a party game the person who bombed
    // loudest is usually the reason the evening was funny.
    score: (p) => ((p.bombs ?? 0) >= 2 ? p.bombs! : null),
    detail: (p) => `bombed ${p.bombs} rounds and survived anyway`,
  },
];

/**
 * How close to the leading candidate a player must be before the spreading rule
 * will hand them the award instead.
 *
 * Without this guard, "prefer someone who has not won yet" quietly becomes
 * "give it to whoever is left", which is how an award named Reliable ends up on
 * the least reliable player in the room. Variety is only worth having while the
 * award still tells the truth.
 */
export const AWARD_SPREAD_FLOOR = 0.6;

/**
 * Picks the closing awards, spreading them across the room where it can.
 *
 * Awards are resolved in the order above, and each one prefers a player who has
 * not won anything yet — provided they are within AWARD_SPREAD_FLOOR of the
 * outright best. Without the preference one strong player sweeps every category
 * and the ceremony says nothing the scoreboard did not; without the floor the
 * ceremony starts lying. Where no fresh candidate is close enough, the honest
 * winner keeps it and takes a second award.
 *
 * MVP is exempt from spreading entirely: it goes to the top scorer whatever
 * else they won, because an MVP handed to the runner-up for variety is a lie.
 */
export function computeAwards(players: Player[]): Award[] {
  if (players.length === 0) return [];

  const awards: Award[] = [];
  const alreadyWon = new Set<string>();
  const ctx: AwardContext = {
    leaderProgress: players.reduce((best, p) => Math.max(best, boardProgress(p.boardPosition)), 0),
  };

  for (const spec of AWARD_SPECS) {
    const candidates = players
      .map((player) => ({ player, value: spec.score(player, ctx) }))
      .filter((entry): entry is { player: Player; value: number } => entry.value !== null)
      .sort((a, b) => b.value - a.value);

    if (candidates.length === 0) continue;

    const best = candidates[0];
    const fresh = candidates.find(
      (entry) => !alreadyWon.has(entry.player.id) && entry.value >= best.value * AWARD_SPREAD_FLOOR
    );
    const winner = spec.id === 'mvp' ? best : (fresh ?? best);

    alreadyWon.add(winner.player.id);
    awards.push({
      id: spec.id,
      title: spec.title,
      icon: spec.icon,
      color: spec.color,
      playerId: winner.player.id,
      playerName: winner.player.name,
      detail: spec.detail(winner.player, ctx),
    });
  }

  return awards;
}
