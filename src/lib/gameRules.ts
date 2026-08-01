import { MiniGameId, PowerupType, SocialReactionId, TileNodeType } from './types';

/**
 * Shared between the client, the board renderer and the server.
 *
 * The voice call is a full mesh — every player holds a peer connection to every
 * other — so this is 15 connections at 6 players. That is about the ceiling for
 * mobile devices; going higher needs an SFU rather than a bigger number here.
 */
export const MAX_PLAYERS = 6;
export const TOTAL_TILES = 20;
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
};

export const MINIGAME_LABELS: Record<MiniGameId, string> = {
  voice_arena: 'Voice Arena',
  pitch_bird: 'PitchBird',
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
  if (p < 0.05) return 1;
  if (p < 0.2) return 2;
  if (p < 0.4) return 3;
  if (p < 0.6) return 4;
  if (p < 0.8) return 5;
  return 6;
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

export type ShopItem = {
  id: PowerupType;
  name: string;
  icon: string;
  description: string;
  price: number;
};

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'boost', name: 'Rocket Nitro', icon: '🚀', description: 'Advance +3 spaces instantly', price: 200 },
  { id: 'rewind', name: 'Rewind Trap', icon: '⏪', description: 'Push back -2 spaces', price: 250 },
  { id: 'shield', name: 'Magic Shield', icon: '🛡️', description: 'Block the next debuff or dare', price: 300 },
  { id: 'dare_gun', name: 'Dare Gun', icon: '🎤', description: 'Force an opponent into a live dare', price: 350 },
  { id: 'freeze', name: 'Ice Freeze', icon: '❄️', description: 'Freeze an opponent for 1 round', price: 400 },
  { id: 'bomb', name: 'Point Bomb', icon: '💣', description: 'Blast 50 points off the leader', price: 500 },
];

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

/** Spreads players evenly, preserving anyone already placed. */
export function balanceTeams<T extends { id: string; teamId?: TeamId }>(players: T[]): T[] {
  return players.map((player, index) => ({
    ...player,
    teamId: (index % 2 === 0 ? 'red' : 'blue') as TeamId,
  }));
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

/** Picks the mini-game for a turn from whatever the host enabled. */
export function pickMiniGame(enabled: MiniGameId[]): MiniGameId {
  const pool = enabled.length > 0 ? enabled : (['voice_arena', 'pitch_bird'] as MiniGameId[]);
  return pool[Math.floor(Math.random() * pool.length)];
}

export const NODE_TYPES: TileNodeType[] = [
  'normal', 'buff', 'normal', 'dare', 'normal',
  'buff', 'mystery', 'debuff', 'bonus', 'normal',
  'buff', 'dare', 'mystery', 'normal', 'debuff',
  'bonus', 'trap', 'dare', 'buff', 'normal',
];

export type TileOutcome = {
  /** Board position after the tile effect is applied. */
  position: number;
  banner: string | null;
  message: string;
  triggersDare: boolean;
  isFinish: boolean;
};

/**
 * Resolves what landing on a tile does. Pure, so the server and the client
 * always agree on the result of a roll.
 */
export function resolveTile(position: number): TileOutcome {
  const clamped = Math.min(TOTAL_TILES - 1, Math.max(0, position));

  const finish = (): TileOutcome => ({
    position: TOTAL_TILES - 1,
    banner: '🏆 FINISH LINE REACHED!',
    message: 'Victory! The roadmap is complete.',
    triggersDare: false,
    isFinish: true,
  });

  if (clamped === TOTAL_TILES - 1) return finish();

  const nodeType = NODE_TYPES[clamped];

  // A boost can carry a player onto the finish tile. That still wins the game —
  // without this check the win was only noticed on the following roll.
  if (nodeType === 'buff' && Math.min(TOTAL_TILES - 1, clamped + 2) === TOTAL_TILES - 1) {
    return finish();
  }

  if (nodeType === 'buff') {
    return {
      position: Math.min(TOTAL_TILES - 1, clamped + 2),
      banner: '🚀 FAST-TRACK NITRO BOOST! +2 SPACES!',
      message: 'Nitro Boost activated! Advanced 2 extra spaces.',
      triggersDare: false,
      isFinish: false,
    };
  }

  if (nodeType === 'debuff' || nodeType === 'trap') {
    return {
      position: Math.max(0, clamped - 2),
      banner: '💥 DEBUFF TRAP! STEP BACK 2 SPACES!',
      message: 'Whaala! Pushed back 2 spaces.',
      triggersDare: false,
      isFinish: false,
    };
  }

  if (nodeType === 'dare') {
    return {
      position: clamped,
      banner: '🎭 NOLLYWOOD DARE CHALLENGE TRIGGERED!',
      message: 'Landed on a Dare tile! Triggering the peer-reviewed challenge.',
      triggersDare: true,
      isFinish: false,
    };
  }

  return {
    position: clamped,
    banner: null,
    message: `Advanced smoothly to node #${clamped + 1}.`,
    triggersDare: false,
    isFinish: false,
  };
}
