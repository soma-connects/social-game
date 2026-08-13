import { randomBytes } from 'node:crypto';
import { EventLog, RoomState } from '../types';
import { ROOM_TTL_MS } from '../gameRules';

// Shared in-process state for the room API and the WebRTC signalling API.
//
// IMPORTANT for the Cloud Run deployment: this only holds together while every
// request lands on the same container. The service must run with
// `--min-instances=1 --max-instances=1`, or players get split across instances
// and see different rooms. Moving to Firestore or Redis is the fix if the game
// ever needs more than one instance.

/** A WebRTC signalling message, relayed verbatim between two players. */
export type SignalMessage =
  | { kind: 'offer'; from: string; to: string; sdp: unknown }
  | { kind: 'answer'; from: string; to: string; sdp: unknown }
  | { kind: 'ice'; from: string; to: string; candidate: unknown }
  | { kind: 'bye'; from: string; to: string };

/** Undelivered signals are worthless once stale — an offer that old is dead anyway. */
const SIGNAL_TTL_MS = 30 * 1000;
const MAX_MAILBOX = 60;

type StoredRoom = {
  room: RoomState;
  touchedAt: number;
  /** playerId -> messages waiting to be collected by that player. */
  mailboxes: Map<string, { message: SignalMessage; at: number }[]>;
  /** playerId -> last time they polled, used to show who is actually on the call. */
  voicePresence: Map<string, number>;
};

// Anchored to globalThis rather than a plain module-level const, for two reasons
// that both bite in practice:
//
//   1. Next.js bundles each route segment separately, so /api/room/[roomId] and
//      /api/room/[roomId]/signal each get their OWN instance of this module. A
//      module-level Map means the signalling route cannot see any room.
//   2. In dev, editing a file reloads the module and would wipe every open room.
//
// globalThis is per-process, so both routes share one store and it survives
// hot reloads.
const globalStore = globalThis as unknown as { __voicePartyRooms?: Map<string, StoredRoom> };
const rooms: Map<string, StoredRoom> = (globalStore.__voicePartyRooms ??= new Map());

function sweep(): void {
  const cutoff = Date.now() - ROOM_TTL_MS;
  rooms.forEach((entry, id) => {
    if (entry.touchedAt < cutoff) rooms.delete(id);
  });
}

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

function cacheLocally(room: RoomState): void {
  const existing = rooms.get(room.roomId);
  rooms.set(room.roomId, {
    room,
    touchedAt: Date.now(),
    mailboxes: existing?.mailboxes ?? new Map(),
    voicePresence: existing?.voicePresence ?? new Map(),
  });
}

export async function readRoom(roomId: string): Promise<RoomState | null> {
  sweep();
  const doc = await adminDb.collection('rooms').doc(roomId).get();
  if (!doc.exists) return null;

  const room = doc.data() as RoomState;
  // Tracked off to the side rather than on RoomState, so the revision never
  // reaches the client or shows up in a room diff.
  revisionsRead.set(room, room.rev ?? 0);

  // The mailboxes stay in memory — WebRTC signalling is far too chatty for a
  // database round trip — so the signalling route needs the room cached here.
  cacheLocally(room);

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
  cacheLocally(room);

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

export async function readSecrets(roomId: string): Promise<RoomSecrets> {
  const cached = secretsCache.get(roomId);
  if (cached) return cached;

  const doc = await privateRef(roomId).get();
  const secrets = doc.exists ? ({ ...EMPTY_SECRETS, ...(doc.data() as RoomSecrets) }) : { ...EMPTY_SECRETS };
  secretsCache.set(roomId, secrets);
  return secrets;
}

export async function writeSecrets(roomId: string, secrets: RoomSecrets): Promise<void> {
  secretsCache.set(roomId, secrets);
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

export function enqueueSignal(roomId: string, message: SignalMessage): boolean {
  const entry = rooms.get(roomId);
  if (!entry) return false;

  const box = entry.mailboxes.get(message.to) ?? [];
  box.push({ message, at: Date.now() });
  // Drop the oldest if a player stops collecting, so one dead tab cannot grow
  // the mailbox without bound.
  entry.mailboxes.set(message.to, box.slice(-MAX_MAILBOX));
  entry.touchedAt = Date.now();
  return true;
}

/** Drains and returns everything waiting for this player. */
export function drainSignals(roomId: string, playerId: string): SignalMessage[] {
  const entry = rooms.get(roomId);
  if (!entry) return [];

  entry.touchedAt = Date.now();
  entry.voicePresence.set(playerId, Date.now());

  const box = entry.mailboxes.get(playerId) ?? [];
  entry.mailboxes.set(playerId, []);

  const fresh = Date.now() - SIGNAL_TTL_MS;
  return box.filter((item) => item.at >= fresh).map((item) => item.message);
}

/** Players who have polled recently, i.e. who are actually on the call. */
export function getVoicePresence(roomId: string, withinMs = 6000): string[] {
  const entry = rooms.get(roomId);
  if (!entry) return [];
  const cutoff = Date.now() - withinMs;
  return [...entry.voicePresence.entries()].filter(([, at]) => at >= cutoff).map(([id]) => id);
}

export function clearVoicePresence(roomId: string, playerId: string): void {
  rooms.get(roomId)?.voicePresence.delete(playerId);
}
