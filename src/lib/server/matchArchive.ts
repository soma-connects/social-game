import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase/server';
import type { RoomState } from '../types';

/**
 * Permanent record of finished matches.
 *
 * Rooms are deliberately disposable — they are swept six hours after the last
 * heartbeat, and the event log inside them only keeps the most recent 30 lines.
 * That is the right shape for live play and the wrong shape for every question
 * worth asking later: how many matches ran, which mini-games actually get
 * played, whether anyone comes back. None of that can be recovered after the
 * fact, so it has to be written while the match is ending.
 *
 * Two collections, both outside the sweep:
 *
 *   matches/{matchId}  one document per completed match
 *   players/{uid}      lifetime totals per durable identity
 *
 * Deliberately *not* a full event stream. Streaming all ~100 events a match
 * produces would cost ~100 writes per match to answer questions nobody has
 * asked yet. One summary write answers the questions that exist today, and the
 * event stream can be added later without invalidating anything written now.
 */

export type MatchRecord = {
  matchId: string;
  roomId: string;
  mode: RoomState['roomType'];
  vibe?: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  /** How the match ended — someone won, or the host called it. */
  outcome: 'winner' | 'ended_early';
  playerCount: number;
  players: Array<{
    /** Durable identity. Null for players who joined before auth, or with it disabled. */
    uid: string | null;
    /** Per-room id — dies with the room, kept only for debugging. */
    playerId: string;
    name: string;
    score: number;
    team: string | null;
    boardPosition: number;
    won: boolean;
  }>;
  /**
   * Mini-games actually played, in order, for the whole match.
   *
   * Read from playedMiniGames rather than recentMiniGames: the latter is the
   * repeat rule's sliding window, so it held only the last six picks and was
   * never written at all in Team Battle.
   */
  gamesPlayed: string[];
  winnerUid: string | null;
  winnerName: string | null;
  winningTeam: string | null;
  roundsPlayed: number;
};

function buildRecord(room: RoomState, outcome: MatchRecord['outcome']): MatchRecord | null {
  const matchId = room.matchId;
  // A room that never left the lobby has no match to record.
  if (!matchId || !room.matchStartedAt) return null;

  const endedAt = Date.now();
  const winnerId = room.winner?.id ?? null;

  return {
    matchId,
    roomId: room.roomId,
    mode: room.roomType ?? 'board_game',
    vibe: room.roomVibe,
    startedAt: room.matchStartedAt,
    endedAt,
    durationMs: endedAt - room.matchStartedAt,
    outcome,
    playerCount: room.players.length,
    players: room.players.map((p) => ({
      uid: p.uid ?? null,
      playerId: p.id,
      name: p.name,
      score: p.score ?? 0,
      team: p.teamId ?? null,
      boardPosition: p.boardPosition ?? 0,
      won:
        room.winningTeam != null
          ? p.teamId === room.winningTeam
          : p.id === winnerId,
    })),
    gamesPlayed: room.playedMiniGames ?? [],
    winnerUid: room.players.find((p) => p.id === winnerId)?.uid ?? null,
    winnerName: room.winner?.name ?? null,
    winningTeam: room.winningTeam ?? null,
    roundsPlayed: room.roundNumber ?? 0,
  };
}

/**
 * Writes the match summary and folds it into each player's lifetime totals.
 *
 * Never throws. A finished match is worth recording, but not at the cost of
 * breaking the response that ends the game for everyone in the room — if
 * Firestore is having a bad minute the players should never find out.
 *
 * Idempotency matters here, because a match legitimately ends twice: somebody
 * crosses the finish line, and then the host taps "end match" on the game-over
 * screen. Writing the summary twice is harmless (same id, same content) but
 * incrementing lifetime totals twice is not.
 *
 * So the summary is written with create(), which fails if the document already
 * exists, and the lifetime increments only run when that create succeeded. The
 * in-memory `matchArchived` flag is just a fast path — it lives on a room
 * object that may be re-read from Firestore before the next call, so it cannot
 * be the thing correctness rests on.
 */
export async function archiveMatch(
  room: RoomState,
  outcome: MatchRecord['outcome']
): Promise<void> {
  if (room.matchArchived) return;

  const record = buildRecord(room, outcome);
  if (!record) return;

  try {
    try {
      await adminDb.collection('matches').doc(record.matchId).create(record);
    } catch (error: any) {
      // ALREADY_EXISTS: another request archived this match first. Not an
      // error, and specifically not a reason to increment anybody's totals.
      if (error?.code === 6) {
        room.matchArchived = true;
        return;
      }
      throw error;
    }

    room.matchArchived = true;

    // Lifetime totals, one document per durable identity. Players without a uid
    // still appear in the match record; they just cannot be aggregated over
    // time, which is precisely what identity buys.
    const batch = adminDb.batch();
    const seen = new Set<string>();
    let any = false;

    for (const player of record.players) {
      if (!player.uid || seen.has(player.uid)) continue;
      seen.add(player.uid);
      any = true;

      batch.set(
        adminDb.collection('players').doc(player.uid),
        {
          uid: player.uid,
          lastName: player.name,
          lastSeenAt: record.endedAt,
          // No firstSeenAt here — a merged write cannot tell create from update
          // without an extra read per player, and "when did this person start
          // playing" is already answerable from their earliest row in matches.
          // Not worth a read per player per match to denormalise.
          matchesPlayed: FieldValue.increment(1),
          matchesWon: FieldValue.increment(player.won ? 1 : 0),
          totalScore: FieldValue.increment(player.score),
        },
        { merge: true }
      );
    }

    if (any) await batch.commit();
  } catch (error) {
    // Logged, not thrown. Losing a summary row costs a statistic; throwing here
    // would cost the room its game-over screen.
    console.error(`archiveMatch: failed to record match ${record.matchId}`, error);
  }
}
