import { readSecrets } from './roomServer';

export type RoomPlayer = { roomId: string; playerId: string };

/**
 * Proves a request comes from a player seated in a real room.
 *
 * Every route that spends provider money — speech tokens, the host's voice,
 * the host's lines, TURN credentials — sits behind this. Without it those
 * routes answered anyone on the internet, no room required. The token is the
 * same bearer token the room API issues at create/join and checks on every
 * game action, so this adds no new credential.
 */
export async function requireRoomPlayer(roomId: unknown, token: unknown): Promise<RoomPlayer | null> {
  if (typeof roomId !== 'string' || typeof token !== 'string' || !roomId || !token) return null;
  const id = roomId.trim().toUpperCase();
  const secrets = await readSecrets(id);
  const playerId = Object.keys(secrets.tokens).find((pid) => secrets.tokens[pid] === token);
  return playerId ? { roomId: id, playerId } : null;
}
