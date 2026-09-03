import type { GamePhase, RoomState } from '../types';
import { ALL_MINI_GAMES, miniGamePhase } from '../gameRules';

/**
 * When the room is waiting on somebody, and when it should stop waiting.
 *
 * `rollDeadline` in the room route rescues the board from a player who stops
 * rolling. The three phases *leading up to* the dice had no such escape hatch,
 * even though each one ends on a tap that may never come:
 *
 *   · a mini-game is only banked when the performer presses "proceed"
 *   · the roast only ends when the performer's own client says so
 *   · the shop only closes once every player has pressed done
 *
 * Presence pruning does not help. It catches the tab that closed; what wedges a
 * room is the player still heartbeating happily with their phone face down on
 * the table. Nobody else can act for them, so the rest of the room sits on a
 * dead screen with no way forward but to abandon it.
 *
 * Kept apart from the route so the decisions stay pure — no Firestore, no
 * request — and can be reasoned about and exercised on their own. The route
 * owns what *happens* when a wait expires; this owns whether it has.
 */

/**
 * Phases that are waiting on one specific performer, so losing them means the
 * round has to be skipped rather than waited out.
 *
 * Derived from the mini-game list instead of hand-listed: every game added since
 * this check was written — trivia, asteroid defense, the vote-based rounds —
 * was missing from it, and the room hung when its performer dropped.
 */
export const PERFORMER_PHASES = new Set<GamePhase>([
  ...ALL_MINI_GAMES.map(miniGamePhase),
  'roast_intermission',
]);

/**
 * How long a performer may show no sign of life before the round moves on.
 *
 * Measured from their last activity rather than from the start of their turn:
 * PitchBird and Asteroid Defense have no fixed length, so a good run is
 * unbounded, and a flat turn limit would forfeit the best game of the night
 * halfway through it.
 */
export const MINIGAME_DEADLINE_MS = 180_000;
/** ROAST_SECONDS is 25 on the client; this is that plus room to react. */
export const ROAST_DEADLINE_MS = 60_000;
/** Everyone shops at once, so this is a whole-room wait rather than one player's. */
export const SHOP_DEADLINE_MS = 120_000;

/** How long a phase may wait on somebody, or undefined if it never stalls. */
export function phaseWaitMs(phase: GamePhase): number | undefined {
  // Checked before PERFORMER_PHASES, which also contains it: the roast is a
  // fixed 25s on the client, not an open-ended attempt.
  if (phase === 'roast_intermission') return ROAST_DEADLINE_MS;
  if (phase === 'powerup_shop') return SHOP_DEADLINE_MS;
  if (PERFORMER_PHASES.has(phase)) return MINIGAME_DEADLINE_MS;
  return undefined;
}

/**
 * Identifies one specific wait, so a new turn never inherits the last one's clock.
 *
 * Without this the deadline would carry over between two turns that happen to
 * sit in the same phase — the repeat rule makes back-to-back picks unlikely, not
 * impossible — and the second player would arrive to a clock that had already
 * run out and be forfeited on sight.
 */
export function waitKey(room: RoomState): string {
  return `${room.phase}:${room.activePlayerIndex}:${room.roundNumber ?? 0}`;
}

export function clearPhaseDeadline(room: RoomState): void {
  room.phaseDeadline = null;
  room.phaseDeadlineKey = null;
}

/**
 * Pushes a deadline out while the performer is visibly still playing.
 *
 * A performer mid-attempt reports spectator state every second and a half, and
 * `at` is stamped server-side, so it is evidence they are still there rather
 * than a claim the client makes. The clock therefore runs from their last frame
 * rather than from the start of their turn.
 */
export function extendForActivity(room: RoomState, deadline: number, limit: number): number {
  const live = room.liveState;
  if (!live?.at || live.playerId !== room.players[room.activePlayerIndex]?.id) return deadline;
  return Math.max(deadline, live.at + limit);
}

/**
 * Arms the clock for whatever the room is waiting on now.
 *
 * Deliberately lazy rather than armed at each phase transition. Hand-listing
 * transitions is what left PERFORMER_PHASES stale for four mini-games, and the
 * failure mode is the same both times — a room that hangs on the one case
 * nobody remembered to wire up. Deriving it from the phase cannot go out of date.
 */
export function syncPhaseDeadline(room: RoomState, now: number): void {
  const limit = phaseWaitMs(room.phase);
  if (limit === undefined) {
    clearPhaseDeadline(room);
    return;
  }

  const key = waitKey(room);
  if (room.phaseDeadlineKey !== key || !room.phaseDeadline) {
    room.phaseDeadline = now + limit;
    room.phaseDeadlineKey = key;
  }
  room.phaseDeadline = extendForActivity(room, room.phaseDeadline, limit);
}

/**
 * True once the current wait has run out.
 *
 * Applies the same activity extension as syncPhaseDeadline rather than reading
 * the stored value raw: this is checked on beats that may not have written since
 * the performer's last frame, and taking the stored deadline at face value there
 * would forfeit a player who is still visibly playing.
 */
export function phaseHasStalled(room: RoomState, now: number): boolean {
  const limit = phaseWaitMs(room.phase);
  if (limit === undefined) return false;
  if (room.phaseDeadlineKey !== waitKey(room)) return false;
  if (!room.phaseDeadline) return false;
  return now >= extendForActivity(room, room.phaseDeadline, limit);
}
