import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/server';
import { isAdminRequest } from '@/lib/server/adminAuth';
import { buildAnalytics, type PlayerRecord } from '@/lib/server/analytics';
import type { SessionRecord } from '@/lib/server/sessionArchive';
import type { MatchRecord } from '@/lib/server/matchArchive';

export const dynamic = 'force-dynamic';

/** Ranges the UI offers. Anything else is rejected rather than clamped. */
const ALLOWED_RANGES = [7, 30, 90] as const;

/**
 * Ceiling on documents read per collection.
 *
 * Every figure here is an aggregate over rows this route reads itself, so an
 * unbounded query is a bill that grows with success. At the volumes this game
 * runs at the cap will not bite; if it ever does, the honest fix is a rollup
 * written when a match ends, not a bigger number — and `truncated` in the
 * response is what will say so out loud rather than quietly under-reporting.
 */
const MAX_DOCS = 5000;

export async function GET(request: Request) {
  // The whole point of this route is that it reads data no browser may touch,
  // so authorisation comes before anything else happens.
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const requested = Number(new URL(request.url).searchParams.get('days') ?? 30);
  const rangeDays = (ALLOWED_RANGES as readonly number[]).includes(requested) ? requested : 30;

  const now = Date.now();
  const cutoff = now - rangeDays * 86_400_000;

  try {
    // Range filters on a single field each, so Firestore's automatic
    // single-field indexes cover these — no composite index to deploy.
    const [sessionSnap, matchSnap, playerSnap] = await Promise.all([
      adminDb
        .collection('sessions')
        .where('createdAt', '>=', cutoff)
        .orderBy('createdAt', 'desc')
        .limit(MAX_DOCS)
        .get(),
      adminDb
        .collection('matches')
        .where('endedAt', '>=', cutoff)
        .orderBy('endedAt', 'desc')
        .limit(MAX_DOCS)
        .get(),
      adminDb
        .collection('players')
        .where('lastSeenAt', '>=', cutoff)
        .orderBy('lastSeenAt', 'desc')
        .limit(MAX_DOCS)
        .get(),
    ]);

    const sessions = sessionSnap.docs.map((d) => d.data() as SessionRecord);
    const matches = matchSnap.docs.map((d) => d.data() as MatchRecord);
    const players = playerSnap.docs.map((d) => d.data() as PlayerRecord);

    const summary = buildAnalytics(sessions, matches, players, rangeDays, now);

    // Recent matches for the table. Deliberately narrowed: the archive row
    // names every player who was in the match, and the dashboard has no reason
    // to put a full roster on screen to answer "what has been happening".
    const recentMatches = matches.slice(0, 25).map((m) => ({
      matchId: m.matchId,
      roomId: m.roomId,
      mode: m.mode ?? 'unknown',
      endedAt: m.endedAt,
      durationMs: m.durationMs,
      playerCount: m.playerCount,
      roundsPlayed: m.roundsPlayed ?? 0,
      outcome: m.outcome,
      winnerName: m.winnerName,
      gamesPlayed: m.gamesPlayed ?? [],
    }));

    return NextResponse.json({
      summary,
      recentMatches,
      truncated: {
        sessions: sessions.length >= MAX_DOCS,
        matches: matches.length >= MAX_DOCS,
        players: players.length >= MAX_DOCS,
      },
    });
  } catch (error) {
    console.error('admin analytics failed', error);
    return NextResponse.json(
      { error: 'Could not read the archive. Check the server logs and Firestore credentials.' },
      { status: 500 }
    );
  }
}
