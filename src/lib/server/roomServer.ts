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

export function readRoom(roomId: string): RoomState | null {
  sweep();
  return rooms.get(roomId)?.room ?? null;
}

export function writeRoom(room: RoomState): RoomState {
  const existing = rooms.get(room.roomId);
  rooms.set(room.roomId, {
    room,
    touchedAt: Date.now(),
    mailboxes: existing?.mailboxes ?? new Map(),
    voicePresence: existing?.voicePresence ?? new Map(),
  });
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
