import { Redis } from '@upstash/redis';
import { EventLog, RoomState } from '../types';
import { ROOM_TTL_MS } from '../gameRules';

// Shared state for the room API and the WebRTC signalling API, held in Redis.
//
// This used to be a plain in-process Map, which only worked because Cloud Run
// was pinned to a single container (`--min-instances=1 --max-instances=1`).
// Vercel gives no such guarantee — requests can land on any of several
// ephemeral function instances — so every read/write has to go through a
// store all instances share. Redis (Upstash) fills that role; the shape of
// the data below is otherwise unchanged from the in-memory version.

/** A WebRTC signalling message, relayed verbatim between two players. */
export type SignalMessage =
  | { kind: 'offer'; from: string; to: string; sdp: unknown }
  | { kind: 'answer'; from: string; to: string; sdp: unknown }
  | { kind: 'ice'; from: string; to: string; candidate: unknown }
  | { kind: 'bye'; from: string; to: string };

/** Undelivered signals are worthless once stale — an offer that old is dead anyway. */
const SIGNAL_TTL_MS = 30 * 1000;
const MAX_MAILBOX = 60;
const ROOM_TTL_SEC = Math.ceil(ROOM_TTL_MS / 1000);
const PRESENCE_TTL_SEC = Math.ceil(ROOM_TTL_MS / 1000);

// Vercel's Upstash Marketplace integration injects `KV_REST_API_URL` /
// `KV_REST_API_TOKEN` (legacy Vercel KV naming), not the plain
// `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` that a database
// created directly on upstash.com uses. Accept either so both setups work.
const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '';
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
const redis = new Redis({ url: redisUrl, token: redisToken });

const roomKey = (roomId: string) => `room:${roomId}`;
const mailboxKey = (roomId: string, playerId: string) => `mailbox:${roomId}:${playerId}`;
const presenceKey = (roomId: string) => `presence:${roomId}`;

export async function readRoom(roomId: string): Promise<RoomState | null> {
  return (await redis.get<RoomState>(roomKey(roomId))) ?? null;
}

export async function writeRoom(room: RoomState): Promise<RoomState> {
  // TTL refreshes on every write, so an active room stays alive and an
  // abandoned one is cleaned up by Redis instead of a manual sweep.
  await redis.set(roomKey(room.roomId), room, { ex: ROOM_TTL_SEC });
  return room;
}

export function pushEvent(room: RoomState, text: string, type: EventLog['type']): void {
  const event: EventLog = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    timestamp: new Date().toISOString(),
    type,
  };
  room.events = [event, ...(room.events ?? [])].slice(0, 30);
}

// --------------------------------------------------------------- signalling

export async function enqueueSignal(roomId: string, message: SignalMessage): Promise<boolean> {
  const exists = await redis.exists(roomKey(roomId));
  if (!exists) return false;

  const key = mailboxKey(roomId, message.to);
  await redis.rpush(key, JSON.stringify({ message, at: Date.now() }));
  // Drop the oldest if a player stops collecting, so one dead tab cannot grow
  // the mailbox without bound.
  await redis.ltrim(key, -MAX_MAILBOX, -1);
  await redis.expire(key, Math.ceil(SIGNAL_TTL_MS / 1000));
  return true;
}

/** Drains and returns everything waiting for this player. */
export async function drainSignals(roomId: string, playerId: string): Promise<SignalMessage[]> {
  const key = mailboxKey(roomId, playerId);
  const [items] = await Promise.all([
    redis.lrange<{ message: SignalMessage; at: number }>(key, 0, -1),
    redis.del(key),
    redis.hset(presenceKey(roomId), { [playerId]: Date.now() }),
    redis.expire(presenceKey(roomId), PRESENCE_TTL_SEC),
  ]);

  const fresh = Date.now() - SIGNAL_TTL_MS;
  return items
    .map((item) => (typeof item === 'string' ? (JSON.parse(item) as { message: SignalMessage; at: number }) : item))
    .filter((item) => item.at >= fresh)
    .map((item) => item.message);
}

/** Players who have polled recently, i.e. who are actually on the call. */
export async function getVoicePresence(roomId: string, withinMs = 6000): Promise<string[]> {
  const entries = await redis.hgetall<Record<string, number>>(presenceKey(roomId));
  if (!entries) return [];
  const cutoff = Date.now() - withinMs;
  return Object.entries(entries)
    .filter(([, at]) => Number(at) >= cutoff)
    .map(([id]) => id);
}

export async function clearVoicePresence(roomId: string, playerId: string): Promise<void> {
  await redis.hdel(presenceKey(roomId), playerId);
}
