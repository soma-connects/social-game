import type { LiveMiniGameState, MiniGameId } from './types';

/**
 * When a performer's attempt is actually under way.
 *
 * A phase is not an attempt. The room moves into a performer's phase the moment
 * it is their turn, but nothing has been attempted until they act: Voice Arena
 * waits for a tap on START, PitchBird calibrates the microphone first, Solfege
 * plays the reference note. With the first-time briefing on screen that gap can
 * run to a minute.
 *
 * The replay recorder used to run for the whole phase. So the clip began long
 * before the attempt did, and because it is capped at fifteen seconds it could
 * also stop before the attempt began -- a replay of somebody reading the rules.
 *
 * Two kinds of client need to know when the window is open, by different routes:
 *
 *  - The performer's own device knows the instant it happens; it is their own
 *    component state. That route is `attemptWindow` below, and it matters
 *    because their first word follows the tap by a fraction of a second.
 *  - Everybody else hears about it in the live state the performer already
 *    shares for spectators, as `attempting`.
 *
 * `attemptIsOpen` is the one place that chooses between them.
 */

const listeners = new Set<() => void>();
let openFor: string | null = null;

function notify(): void {
  listeners.forEach((listener) => listener());
}

/**
 * The performer's own client: an attempt by this player is under way.
 *
 * It is keyed by player rather than being a bare flag, so a cleanup that runs
 * late cannot close the window somebody else's attempt has since opened.
 */
export const attemptWindow = {
  open(playerId: string): void {
    if (openFor === playerId) return;
    openFor = playerId;
    notify();
  },

  /** Ignored unless this player's attempt is the one that is open. */
  close(playerId: string): void {
    if (openFor !== playerId) return;
    openFor = null;
    notify();
  },

  isOpen(playerId: string): boolean {
    return openFor === playerId;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export type AttemptOpenInput = {
  /** Whether this client's player is the one on stage. */
  isPerformer: boolean;
  performerId: string | null | undefined;
  game: MiniGameId | null | undefined;
  /** What attemptWindow says on this device. Only the performer's device ever opens it. */
  localOpen: boolean;
  /** The shared live state from the room. */
  liveState: LiveMiniGameState | null | undefined;
};

/**
 * Whether the person on stage is mid-attempt, as far as this client can tell.
 *
 * The performer trusts their own device and ignores the room: it is the source
 * of the room's copy, and it is a round trip ahead of it.
 *
 * Everybody else trusts the room, but only for this performer and this game. The
 * server clears the live state whenever the next performer is chosen, so a
 * leftover `attempting` cannot survive into somebody else's turn; the checks here
 * are for the moment between two writes, and for a flag nobody ever cleared.
 */
export function attemptIsOpen({ isPerformer, performerId, game, localOpen, liveState }: AttemptOpenInput): boolean {
  if (!performerId) return false;
  if (isPerformer) return localOpen;

  return (
    !!liveState &&
    liveState.attempting === true &&
    liveState.playerId === performerId &&
    game != null &&
    liveState.game === game
  );
}
