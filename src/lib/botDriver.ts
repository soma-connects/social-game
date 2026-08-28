import { Player } from './types';

/**
 * Picks the one browser responsible for playing the computer's moves.
 *
 * Chess runs its engine in the browser, so somebody's tab has to do the work.
 * Letting every client do it means the same bot move is submitted once per
 * person watching, which is how a spectator ended up moving pieces.
 *
 * The host is the natural choice, but a host who closes their tab must not
 * take the computer with them — so this falls through to whoever is still
 * connected, in a fixed order every client agrees on.
 */
export function pickBotDriverId(players: Player[], hostId: string): string | undefined {
  const connected = players.filter((p) => p.connected !== false);
  const pool = connected.length > 0 ? connected : players;
  if (pool.some((p) => p.id === hostId)) return hostId;
  // Sorted by id rather than by seat order, because seat order changes when
  // somebody leaves and two clients mid-update would disagree about who drives.
  return [...pool].sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
}
