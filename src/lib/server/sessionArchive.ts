import { FieldValue } from 'firebase-admin/firestore';
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

  // ─── progress, kept current by a throttled pulse ─────────────────────────
  //
  // Optional because rows written before these existed do not have them, and
  // the dashboard has to read those rows too.

  /** Everyone in the room at the last pulse — the answer to "who came". */
  playerNames?: string[];
  /**
   * The last moment anyone in the room was heard from.
   *
   * The only way an abandoned session gets a length at all: nothing reports
   * the moment a room dies, so the last sign of life is the best end time
   * there is. Accurate to within one pulse.
   */
  lastActiveAt?: number | null;
  /** Where the room was at the last pulse — for a dead room, where it died. */
  lastPhase?: string | null;
  lastMiniGame?: string | null;
  roundNumber?: number;
  /** Rounds that had to be force-advanced because nobody finished them. */
  failureCount?: number;
  /** The first MAX_FAILURES_KEPT of those, with where each happened. */
  failures?: RoundFailure[];
};

/**
 * A round the game had to move on from because nobody finished it.
 *
 * These are exactly the stalls the heartbeat clears: a roll nobody rolled, a
 * mini-game nobody answered, a shop nobody closed. Each one is a moment the
 * room stopped playing, which makes them the best available answer to "where
 * does this game lose people".
 */
export type RoundFailure = {
  at: number;
  /** Which clock ran out. */
  kind: 'roll' | 'phase' | 'ai_master' | 'truth_or_dare';
  phase: string;
  miniGame: string | null;
  round: number;
};

/** Detail kept per session. The count keeps going; the list stops growing. */
export const MAX_FAILURES_KEPT = 40;

/**
 * How often a live room refreshes its session row.
 *
 * A minute is precise enough to say how long an abandoned game lasted and
 * where it was, and cheap: a two-hour evening is a hundred-odd small writes,
 * against a room document that is rewritten every few seconds anyway.
 */
export const SESSION_PULSE_MS = 60_000;

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
        ...progressOf(room, Date.now()),
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
        ...progressOf(room, Date.now()),
      },
      { merge: true }
    )
  );
}

/** The fields a pulse refreshes, read straight off the room. */
function progressOf(room: RoomState, now: number) {
  return {
    playerNames: room.players.map((p) => p.name),
    lastActiveAt: now,
    lastPhase: room.phase ?? null,
    lastMiniGame: room.currentMiniGame ?? null,
    roundNumber: room.roundNumber ?? 0,
  };
}

// ─── notes from inside a room action ─────────────────────────────────────────
//
// Room actions run inside a retry loop: a write that loses a race is thrown
// away and the whole action replayed against the fresh room. A session write
// made from inside the action would therefore land once per attempt, and a
// timed-out round would be logged two or three times on a busy room.
//
// So an action only *notes* what it saw, against the room object it is working
// on. A replay starts from a new room object, which carries no notes, so the
// losing attempt's notes are simply dropped. The route flushes them once the
// room write has actually succeeded — the same moment it archives a match.

type SessionNotes = { pulse: boolean; failureCount: number; failures: RoundFailure[] };
const notes = new WeakMap<RoomState, SessionNotes>();

function notesFor(room: RoomState): SessionNotes {
  let entry = notes.get(room);
  if (!entry) {
    entry = { pulse: false, failureCount: 0, failures: [] };
    notes.set(room, entry);
  }
  return entry;
}

/**
 * Asks for the session row to be refreshed, at most once per SESSION_PULSE_MS.
 *
 * The throttle lives on the room itself, so it is a pure function of room
 * state and survives the retry loop like everything else there.
 */
export function noteSessionPulse(room: RoomState, now: number): void {
  if (!room.sessionId) return;
  if (now - (room.sessionPulseAt ?? 0) < SESSION_PULSE_MS) return;
  room.sessionPulseAt = now;
  notesFor(room).pulse = true;
}

/** Records a round that had to be moved on from. Call before it is moved on. */
export function noteRoundFailure(
  room: RoomState,
  kind: RoundFailure['kind'],
  now: number
): void {
  if (!room.sessionId) return;
  const entry = notesFor(room);
  entry.failureCount += 1;

  // Capped with a counter on the room, advanced here so it is saved with the
  // room write: counting at flush time would be too late to persist, and
  // reading the row back to check its length would cost a read per failure.
  // A room stuck for hours keeps counting but stops adding detail.
  if ((room.failuresRecorded ?? 0) < MAX_FAILURES_KEPT) {
    room.failuresRecorded = (room.failuresRecorded ?? 0) + 1;
    entry.failures.push({
      at: now,
      kind,
      // The AI Master and Truth or Dare each run a whole match inside one room
      // phase, so the room phase alone says nothing about which beat stalled.
      phase:
        kind === 'ai_master'
          ? `ai_master:${room.aiMasterState?.phase ?? 'unknown'}`
          : kind === 'truth_or_dare'
            ? `truth_or_dare:${room.truthOrDareState?.phase ?? 'unknown'}`
            : room.phase,
      miniGame: room.currentMiniGame ?? null,
      round: room.roundNumber ?? 0,
    });
  }
  // A failure is also news about where the room is, so it refreshes the row
  // whatever the throttle says.
  entry.pulse = true;
}

/**
 * Writes whatever this action noted. Call only after the room write succeeded.
 *
 * Never throws, like everything else in this file.
 */
export async function flushSessionNotes(room: RoomState): Promise<void> {
  const entry = notes.get(room);
  if (!entry || !room.sessionId || (!entry.pulse && entry.failureCount === 0)) return;
  notes.delete(room);

  const update: Record<string, unknown> = progressOf(room, Date.now());
  if (entry.failureCount > 0) update.failureCount = FieldValue.increment(entry.failureCount);
  if (entry.failures.length > 0) update.failures = FieldValue.arrayUnion(...entry.failures);

  await safely('progress', () =>
    adminDb.collection('sessions').doc(room.sessionId!).set(update, { merge: true })
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
