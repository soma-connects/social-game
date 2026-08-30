import { randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { EventLog, RoomState } from '../types';
import { ROOM_TTL_MS } from '../gameRules';

// Shared state for the room API and the WebRTC signalling API.
//
// Two stores, split by what the data is rather than by convenience:
//
//   Firestore — the room document and its private secrets. Durable, and the
//     browser subscribes to the room directly, which is what makes the game
//     live without polling.
//   Redis — WebRTC signalling mailboxes and voice presence. Far too chatty for
//     a database write per message, and worthless the moment it is stale.
//
// The signalling half used to be a plain in-process Map. That only ever worked
// because Cloud Run was pinned to a single container with
// `--min-instances=1 --max-instances=1`; on Vercel a request lands on whichever
// ephemeral instance happens to be warm, so an offer written by one instance
// was invisible to the instance the answering player polled — the call would
// simply never connect, with nothing in any log to say why.

/** A WebRTC signalling message, relayed verbatim between two players. */
export type SignalMessage =
  | { kind: 'offer'; from: string; to: string; sdp: unknown }
  | { kind: 'answer'; from: string; to: string; sdp: unknown }
  | { kind: 'ice'; from: string; to: string; candidate: unknown }
  | { kind: 'bye'; from: string; to: string };

/** Undelivered signals are worthless once stale — an offer that old is dead anyway. */
const SIGNAL_TTL_MS = 30 * 1000;
const MAX_MAILBOX = 60;

const SIGNAL_TTL_SEC = Math.ceil(SIGNAL_TTL_MS / 1000);
/** Presence outlives a single poll but not the room it belongs to. */
const PRESENCE_TTL_SEC = Math.ceil(ROOM_TTL_MS / 1000);

/**
 * Vercel's Upstash Marketplace integration injects `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN` (the legacy Vercel KV names), while a database created
 * directly on upstash.com gives `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN`. Reading either means both setups work without
 * anybody having to rename an environment variable to find out why the call
 * will not connect.
 */
const redisUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '';
const redisToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

/**
 * Null when nothing is configured.
 *
 * Signalling degrades to "no voice call" rather than taking the whole room
 * down: every other part of the game works without it, and a local checkout
 * with no Redis credentials should still be playable.
 */
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

let warnedNoRedis = false;
function signalStore(): Redis | null {
  if (!redis && !warnedNoRedis) {
    warnedNoRedis = true;
    console.warn(
      'No Redis configured (KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN). ' +
        'Voice calls cannot connect: WebRTC signalling has nowhere shared to queue messages.'
    );
  }
  return redis;
}

const mailboxKey = (roomId: string, playerId: string) => `mailbox:${roomId}:${playerId}`;
const presenceKey = (roomId: string) => `presence:${roomId}`;

import { adminDb } from '../firebase/server';

/**
 * Raised when a room was written by somebody else between our read and our
 * write. The API route catches it and replays the action against fresh state.
 */
export class RoomConflictError extends Error {
  constructor(roomId: string) {
    super(`Room ${roomId} changed during the update`);
    this.name = 'RoomConflictError';
  }
}

/** Remembers the revision each request read, so writeRoom can detect a clash. */
const revisionsRead = new WeakMap<RoomState, number>();

export async function readRoom(roomId: string): Promise<RoomState | null> {
  const doc = await adminDb.collection('rooms').doc(roomId).get();
  if (!doc.exists) return null;

  const room = doc.data() as RoomState;
  // Tracked off to the side rather than on RoomState, so the revision never
  // reaches the client or shows up in a room diff.
  revisionsRead.set(room, room.rev ?? 0);

  return room;
}

/**
 * Persists a room, failing if anyone else wrote to it since it was read.
 *
 * The document is replaced wholesale, so without this check two overlapping
 * requests would each write their own copy of the room and whichever landed
 * second would erase the other's changes entirely.
 */
export async function writeRoom(room: RoomState): Promise<RoomState> {
  const ref = adminDb.collection('rooms').doc(room.roomId);
  const expectedRev = revisionsRead.get(room);

  await adminDb.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (expectedRev === undefined) {
      // No prior read means this is a brand new room, so it must not already
      // exist — otherwise creating a room on a code someone else is using would
      // wipe their game.
      if (current.exists) throw new RoomConflictError(room.roomId);
    } else {
      const currentRev = current.exists ? ((current.data() as RoomState).rev ?? 0) : undefined;
      if (currentRev !== expectedRev) throw new RoomConflictError(room.roomId);
    }
    room.rev = (expectedRev ?? 0) + 1;
    tx.set(ref, room);
  });

  revisionsRead.set(room, room.rev ?? 0);

  return room;
}

// ─── private room state ─────────────────────────────────────────────────────
//
// Everything clients must not see. It lives in a subcollection rather than in
// the room document because clients subscribe to that document directly — a
// field is not hidden just because the UI does not render it, and the trivia
// answer sitting in a devtools panel is the whole cheat.
//
// firestore.rules denies browsers any access to rooms/{id}/private.

/** Path of the single private document belonging to a room. */
function privateRef(roomId: string) {
  return adminDb.collection('rooms').doc(roomId).collection('private').doc('state');
}

export type RoomSecrets = {
  /** playerId -> the bearer token that proves a request really is that player. */
  tokens: Record<string, string>;
  /** The trivia answer, kept back so the room cannot read it off the wire. */
  triviaAnswer?: string;
  triviaFunFact?: string;
  /** Which Truth or Bluff claim was the lie, until the reveal. */
  lieIndex?: number | null;
  /**
   * Mines waiting on the board, hidden until somebody stands on one.
   *
   * Kept here rather than on the room document precisely because the room is
   * public: a mine everyone can see on the board is just a tile to walk around.
   */
  mines?: { nodeId: number; ownerId: string; ownerName: string }[];
};

const EMPTY_SECRETS: RoomSecrets = { tokens: {} };

/**
 * Cached per room, because almost every request needs the token map and it
 * changes only when somebody joins. A miss falls through to Firestore, so a
 * cold container or a second instance still authenticates correctly.
 */
const secretsCache: Map<string, RoomSecrets> = ((
  globalThis as unknown as { __voicePartySecrets?: Map<string, RoomSecrets> }
).__voicePartySecrets ??= new Map());

/**
 * How long a cached secrets map is trusted.
 *
 * Short, because the cache is per-instance and the data behind it changes
 * whenever somebody joins. On a single pinned container an unbounded cache was
 * correct; across several serverless instances it means one instance can hold
 * a token map that predates a player entirely.
 */
const SECRETS_CACHE_MS = 30_000;
const secretsCachedAt: Map<string, number> = ((
  globalThis as unknown as { __voicePartySecretsAt?: Map<string, number> }
).__voicePartySecretsAt ??= new Map());

/**
 * The room's private state.
 *
 * Pass `fresh` to bypass the cache. Callers that are about to reject somebody
 * for having an unknown token must do that: a token missing from a stale cache
 * and a forged token are indistinguishable from here, and the client treats
 * the rejection as "you are not in this room" and clears the session — so
 * being one instance behind would log a legitimate player out.
 */
export async function readSecrets(
  roomId: string,
  options: { fresh?: boolean } = {}
): Promise<RoomSecrets> {
  const cachedAt = secretsCachedAt.get(roomId) ?? 0;
  const cached = secretsCache.get(roomId);
  if (!options.fresh && cached && Date.now() - cachedAt < SECRETS_CACHE_MS) return cached;

  const doc = await privateRef(roomId).get();
  const secrets = doc.exists ? ({ ...EMPTY_SECRETS, ...(doc.data() as RoomSecrets) }) : { ...EMPTY_SECRETS };
  secretsCache.set(roomId, secrets);
  secretsCachedAt.set(roomId, Date.now());
  return secrets;
}

export async function writeSecrets(roomId: string, secrets: RoomSecrets): Promise<void> {
  secretsCache.set(roomId, secrets);
  secretsCachedAt.set(roomId, Date.now());
  await privateRef(roomId).set(secrets);
}

/** Unguessable, unlike the old timestamp-based player ids. */
export function newToken(): string {
  return randomBytes(24).toString('base64url');
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

/**
 * Queues a signalling message for one player.
 *
 * Returns false when there is nowhere to put it, so the caller can report a
 * failed send rather than silently dropping an offer the other side is waiting
 * for.
 */
export async function enqueueSignal(roomId: string, message: SignalMessage): Promise<boolean> {
  const store = signalStore();
  if (!store) return false;

  const key = mailboxKey(roomId, message.to);
  const pipeline = store.pipeline();
  pipeline.rpush(key, JSON.stringify({ message, at: Date.now() }));
  // Drop the oldest if a player stops collecting, so one dead tab cannot grow
  // the mailbox without bound.
  pipeline.ltrim(key, -MAX_MAILBOX, -1);
  // The whole mailbox expires on its own. An offer nobody collected is dead
  // anyway, and this is what stops abandoned rooms leaking keys forever.
  pipeline.expire(key, SIGNAL_TTL_SEC);

  try {
    await pipeline.exec();
    return true;
  } catch (error) {
    console.error('enqueueSignal failed', error);
    return false;
  }
}

/** Drains and returns everything waiting for this player. */
export async function drainSignals(roomId: string, playerId: string): Promise<SignalMessage[]> {
  const store = signalStore();
  if (!store) return [];

  const key = mailboxKey(roomId, playerId);

  try {
    // Read and clear in one pipeline. Done as two round trips, a message
    // arriving in between would be deleted without ever being delivered.
    const pipeline = store.pipeline();
    pipeline.lrange(key, 0, -1);
    pipeline.del(key);
    // Polling is what "being on the call" means, so it doubles as the presence
    // heartbeat rather than needing its own request.
    pipeline.hset(presenceKey(roomId), { [playerId]: Date.now() });
    pipeline.expire(presenceKey(roomId), PRESENCE_TTL_SEC);

    const [items] = (await pipeline.exec()) as [unknown[], unknown, unknown, unknown];

    const fresh = Date.now() - SIGNAL_TTL_MS;
    return (items ?? [])
      .map((item) => {
        // Upstash parses JSON on the way back when it can, so an entry arrives
        // either already decoded or still as a string depending on the client
        // version. Handling both keeps this working across an upgrade.
        try {
          return typeof item === 'string'
            ? (JSON.parse(item) as { message: SignalMessage; at: number })
            : (item as { message: SignalMessage; at: number });
        } catch {
          return null;
        }
      })
      .filter((item): item is { message: SignalMessage; at: number } => !!item && item.at >= fresh)
      .map((item) => item.message);
  } catch (error) {
    console.error('drainSignals failed', error);
    return [];
  }
}

/** Players who have polled recently, i.e. who are actually on the call. */
export async function getVoicePresence(roomId: string, withinMs = 6000): Promise<string[]> {
  const store = signalStore();
  if (!store) return [];

  try {
    const entries = await store.hgetall<Record<string, number | string>>(presenceKey(roomId));
    if (!entries) return [];
    const cutoff = Date.now() - withinMs;
    return Object.entries(entries)
      .filter(([, at]) => Number(at) >= cutoff)
      .map(([id]) => id);
  } catch (error) {
    console.error('getVoicePresence failed', error);
    return [];
  }
}

export async function clearVoicePresence(roomId: string, playerId: string): Promise<void> {
  const store = signalStore();
  if (!store) return;
  try {
    await store.hdel(presenceKey(roomId), playerId);
  } catch (error) {
    console.error('clearVoicePresence failed', error);
  }
}
