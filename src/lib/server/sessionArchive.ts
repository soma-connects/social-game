import { adminDb } from '../firebase/server';
import { ROOM_TTL_MS } from '../gameRules';
import type { RoomState } from '../types';

/**
 * The usage funnel: every room that was opened, not only the matches that ended.
 *
 * `matches` records a row when a match finishes. That is the right shape for
 * "who won and what did they play", and precisely the wrong shape for "how do
 * people actually use this", because every number it can produce is conditioned
 * on success. Rooms that were created and never filled, lobbies that emptied
 * before anyone pressed start, matches abandoned halfway — the whole left-hand
 * side of the funnel, and the only part that says what to fix — left no trace
 * at all.
 *
 * So one row per room-opening, written at creation and updated at the two
 * moments that matter:
 *
 *   created  →  started  →  completed
 *
 * Three writes per session at most. Deliberately not a general event stream:
 * that would be a write per action on the hot path, to answer questions nobody
 * has asked yet.
 *
 * Abandonment is inferred at read time rather than written. Nothing calls back
 * to say "this lobby died" — that is what abandonment *is* — so a session still
 * sitting in `created` or `started` once the room itself has been swept is
 * abandoned by definition. Inferring it needs no cron and no extra writes.
 */

export type SessionStatus = 'created' | 'started' | 'completed';

export type SessionRecord = {
  sessionId: string;
  roomId: string;
  status: SessionStatus;
  createdAt: number;
  /** Null until somebody actually pressed start. */
  startedAt: number | null;
  endedAt: number | null;
  mode: RoomState['roomType'] | null;
  vibe: string | null;
  /** Headcount when the match started, or when the lobby was last written. */
  playerCount: number;
  /** Matches the row in `matches`, when the session got that far. */
  matchId: string | null;
  outcome: 'winner' | 'ended_early' | null;
};

/**
 * Stable id for one opening of a room.
 *
 * Room codes are reused — the same six characters come back the next time
 * somebody generates that code — so the code alone would collapse every
 * session that ever ran under it into one row.
 */
export function newSessionId(roomId: string, createdAt: number): string {
  return `${roomId}-${createdAt.toString(36)}`;
}

/**
 * Runs a session write without ever letting it break the caller.
 *
 * Same discipline as archiveMatch: a funnel row is worth having, and not at the
 * cost of the response that creates somebody's room. If Firestore is having a
 * bad minute the players should never find out.
 */
async function safely(label: string, write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error(`sessionArchive: ${label} failed`, error);
  }
}

/** Opens the funnel row. Called when a room is created. */
export async function recordSessionCreated(room: RoomState, createdAt: number): Promise<void> {
  const record: SessionRecord = {
    sessionId: newSessionId(room.roomId, createdAt),
    roomId: room.roomId,
    status: 'created',
    createdAt,
    startedAt: null,
    endedAt: null,
    mode: room.roomType ?? null,
    vibe: room.roomVibe ?? null,
    playerCount: room.players.length,
    matchId: null,
    outcome: null,
  };

  await safely('create', () =>
    adminDb.collection('sessions').doc(record.sessionId).set(record)
  );
}

/**
 * Marks the session as having reached an actual match.
 *
 * `sessionId` is carried on the room rather than recomputed, because the
 * creation timestamp it is derived from is not otherwise kept once the lobby
 * has moved on.
 */
export async function recordSessionStarted(room: RoomState): Promise<void> {
  if (!room.sessionId) return;

  await safely('start', () =>
    adminDb.collection('sessions').doc(room.sessionId!).set(
      {
        status: 'started' satisfies SessionStatus,
        startedAt: room.matchStartedAt ?? Date.now(),
        mode: room.roomType ?? null,
        vibe: room.roomVibe ?? null,
        playerCount: room.players.length,
        matchId: room.matchId ?? null,
      },
      { merge: true }
    )
  );
}

/** Closes the funnel row when a match ends properly. */
export async function recordSessionCompleted(
  room: RoomState,
  outcome: 'winner' | 'ended_early'
): Promise<void> {
  if (!room.sessionId) return;

  await safely('complete', () =>
    adminDb.collection('sessions').doc(room.sessionId!).set(
      {
        status: 'completed' satisfies SessionStatus,
        endedAt: Date.now(),
        outcome,
        playerCount: room.players.length,
        matchId: room.matchId ?? null,
      },
      { merge: true }
    )
  );
}

/**
 * Whether a session should be read as abandoned.
 *
 * A row that never reached `completed` is only abandoned once the room behind
 * it can no longer be resumed — before that it may simply be a game in
 * progress, and counting a live lobby as a bounce would overstate the problem
 * every time somebody looks at the dashboard mid-evening.
 */
export function isAbandoned(session: SessionRecord, now: number = Date.now()): boolean {
  if (session.status === 'completed') return false;
  return now - session.createdAt > ROOM_TTL_MS;
}
