import { useEffect, useSyncExternalStore } from 'react';
import { AttemptOpenInput, attemptIsOpen, attemptWindow } from '@/lib/attemptWindow';

/**
 * For the game the performer is playing: says when their attempt is under way.
 *
 * Opened by the effect and closed by its cleanup, so it cannot be left open. The
 * cleanup runs when `attempting` goes false and when the game unmounts -- a
 * performer who leaves mid-attempt, or a phase that moves on under them, closes
 * the window without the game having to remember to.
 */
export function useAttemptWindow(playerId: string, attempting: boolean): void {
  useEffect(() => {
    if (!attempting) return;
    attemptWindow.open(playerId);
    return () => attemptWindow.close(playerId);
  }, [playerId, attempting]);
}

/**
 * For the page: is the person on stage mid-attempt, as far as this client can tell?
 *
 * Subscribes to the local window so the performer's own recorder reacts to the
 * tap immediately, and reads everybody else's answer off the room.
 */
export function useAttemptOpen(input: Omit<AttemptOpenInput, 'localOpen'>): boolean {
  const { performerId } = input;
  const localOpen = useSyncExternalStore(
    attemptWindow.subscribe,
    () => (performerId ? attemptWindow.isOpen(performerId) : false),
    () => false
  );
  return attemptIsOpen({ ...input, localOpen });
}
