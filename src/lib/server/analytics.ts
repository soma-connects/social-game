import { MINIGAME_LABELS } from '../gameRules';
import { placeLabel } from '../placeLabels';
import type { MiniGameId } from '../types';
import { isAbandoned, type RoundFailure, type SessionRecord } from './sessionArchive';
import type { MatchRecord } from './matchArchive';

/**
 * Turns raw archive rows into the numbers the dashboard shows.
 *
 * Kept as a pure function over arrays, separate from the route that fetches
 * them, for two reasons: it can be tested without Firestore, and the shape of
 * every figure is visible in one place rather than spread through JSX. The
 * route's only job is to fetch, authorise and hand over.
 */

export { placeLabel };

export type PlayerRecord = {
  uid: string;
  lastName?: string;
  lastSeenAt?: number;
  matchesPlayed?: number;
  matchesWon?: number;
  totalScore?: number;
};

export type FunnelStep = { label: string; value: number; hint: string };

export type MiniGameStat = {
  id: string;
  label: string;
  /** Times this game was served across all matches in range. */
  plays: number;
  /** Share of all mini-game appearances. */
  share: number;
};

export type DayPoint = { date: string; sessions: number; matches: number; players: number };

export type ModeStat = { mode: string; matches: number; share: number };

/** A place in the game, and how often something happened there. */
export type PlaceStat = { place: string; count: number; share: number };

/** One row of the recent-sessions table: who came, what happened, how long. */
export type RecentSession = {
  sessionId: string;
  roomId: string;
  mode: string;
  createdAt: number;
  /** completed, abandoned, or still going. */
  state: 'completed' | 'abandoned' | 'live';
  outcome: SessionRecord['outcome'];
  /**
   * How long it ran, start to finish — or, for one that died, start to the
   * last sign of life. Null for rows written before the pulse existed.
   */
  durationMs: number | null;
  /** Whether the room ever got past the lobby. */
  started: boolean;
  playerNames: string[];
  playerCount: number;
  /** Where it was last seen, in words. */
  lastPlace: string | null;
  failureCount: number;
};

/** What each kind of timeout means, for a person reading the chart. */
const FAILURE_KIND_LABELS: Record<RoundFailure['kind'], string> = {
  roll: 'Nobody rolled',
  phase: 'Timed out',
  ai_master: 'Timed out',
  truth_or_dare: 'Timed out',
};

/** Counts into a sorted list with shares, the shape every place chart takes. */
function tally(places: string[]): PlaceStat[] {
  const counts = new Map<string, number>();
  for (const place of places) counts.set(place, (counts.get(place) ?? 0) + 1);
  return [...counts.entries()]
    .map(([place, count]) => ({ place, count, share: ratio(count, places.length) }))
    .sort((a, b) => b.count - a.count);
}

/** A session's state as the dashboard tells it. */
function sessionState(session: SessionRecord, now: number): RecentSession['state'] {
  if (session.status === 'completed') return 'completed';
  return isAbandoned(session, now) ? 'abandoned' : 'live';
}

/** Start to end, or start to the last sign of life. */
function sessionDuration(session: SessionRecord): number | null {
  const from = session.startedAt ?? session.createdAt;
  const to = session.endedAt ?? session.lastActiveAt ?? null;
  return to != null && to >= from ? to - from : null;
}

/**
 * The recent-sessions table.
 *
 * Names are shown, deliberately. The match table stays roster-free because it
 * answers "what has been happening"; this one answers "who came", which is a
 * question about people and cannot be answered without naming them. The names
 * are the ones players typed to join, already visible to everyone in the room,
 * and the page sits behind the admin token.
 */
export function buildRecentSessions(
  sessions: SessionRecord[],
  now: number = Date.now(),
  limit = 25
): RecentSession[] {
  return [...sessions]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((s) => ({
      sessionId: s.sessionId,
      roomId: s.roomId,
      mode: s.mode ?? 'unknown',
      createdAt: s.createdAt,
      state: sessionState(s, now),
      outcome: s.outcome,
      durationMs: sessionDuration(s),
      started: s.status !== 'created',
      playerNames: s.playerNames ?? [],
      playerCount: s.playerCount,
      lastPlace: s.lastPhase || s.lastMiniGame ? placeLabel(s.lastPhase, s.lastMiniGame) : null,
      failureCount: s.failureCount ?? 0,
    }));
}

export type AnalyticsSummary = {
  rangeDays: number;
  generatedAt: number;

  sessionsCreated: number;
  matchesStarted: number;
  matchesCompleted: number;
  sessionsAbandoned: number;
  /** Sessions too recent to call abandoned yet, and not finished. */
  sessionsInFlight: number;

  /** matchesStarted / sessionsCreated. */
  startRate: number;
  /** matchesCompleted / matchesStarted. */
  completionRate: number;

  funnel: FunnelStep[];
  byDay: DayPoint[];
  miniGames: MiniGameStat[];
  modes: ModeStat[];

  medianMatchMinutes: number;
  medianRounds: number;
  medianPlayers: number;

  uniquePlayers: number;
  returningPlayers: number;
  returnRate: number;

  totalMatchSlots: number;
  /** Matches whose gamesPlayed array was empty — nothing to attribute. */
  matchesMissingGames: number;

  /**
   * Where abandoned games were last seen.
   *
   * A game that dies does not say so, so this is the last place its room was
   * heard from — accurate to within a minute's pulse.
   */
  whereGamesDie: PlaceStat[];
  /** Rounds the game had to move on from, by where they happened. */
  roundFailures: PlaceStat[];
  totalRoundFailures: number;
  /** How long abandoned games ran before the room went quiet. */
  medianAbandonedMinutes: number;
  /**
   * Sessions carrying the progress fields.
   *
   * Rows written before the pulse existed have no last place and no length, so
   * the two charts above are drawn from this many sessions, not all of them —
   * and the dashboard should say so rather than let a small sample pass for
   * the whole picture.
   */
  sessionsWithProgress: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** UTC day key, so a chart bucket means the same thing wherever it is read. */
function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function buildAnalytics(
  sessions: SessionRecord[],
  matches: MatchRecord[],
  players: PlayerRecord[],
  rangeDays: number,
  now: number = Date.now()
): AnalyticsSummary {
  const sessionsCreated = sessions.length;
  const matchesStarted = sessions.filter((s) => s.status !== 'created').length;
  const matchesCompleted = sessions.filter((s) => s.status === 'completed').length;
  const sessionsAbandoned = sessions.filter((s) => isAbandoned(s, now)).length;
  // Not abandoned and not finished: still resumable, so counting them either way
  // would misreport an evening that is still going on.
  const sessionsInFlight = sessionsCreated - matchesCompleted - sessionsAbandoned;

  // Day buckets. Seeded across the whole range so a quiet day plots as zero
  // rather than vanishing and making the line lie about its own shape.
  const days = new Map<string, DayPoint>();
  for (let i = rangeDays - 1; i >= 0; i--) {
    const key = dayKey(now - i * 86_400_000);
    days.set(key, { date: key, sessions: 0, matches: 0, players: 0 });
  }
  for (const session of sessions) {
    const point = days.get(dayKey(session.createdAt));
    if (point) point.sessions += 1;
  }
  for (const match of matches) {
    const point = days.get(dayKey(match.endedAt));
    if (point) {
      point.matches += 1;
      point.players += match.playerCount;
    }
  }

  // Mini-game popularity, counted over every appearance rather than per match,
  // so a game served three times in one match counts three times.
  const gameCounts = new Map<string, number>();
  let totalAppearances = 0;
  let matchesMissingGames = 0;
  for (const match of matches) {
    if (!match.gamesPlayed || match.gamesPlayed.length === 0) {
      matchesMissingGames += 1;
      continue;
    }
    for (const game of match.gamesPlayed) {
      gameCounts.set(game, (gameCounts.get(game) ?? 0) + 1);
      totalAppearances += 1;
    }
  }
  const miniGames: MiniGameStat[] = [...gameCounts.entries()]
    .map(([id, plays]) => ({
      id,
      label: MINIGAME_LABELS[id as MiniGameId] ?? id,
      plays,
      share: ratio(plays, totalAppearances),
    }))
    .sort((a, b) => b.plays - a.plays);

  const modeCounts = new Map<string, number>();
  for (const match of matches) {
    const mode = match.mode ?? 'unknown';
    modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
  }
  const modes: ModeStat[] = [...modeCounts.entries()]
    .map(([mode, count]) => ({ mode, matches: count, share: ratio(count, matches.length) }))
    .sort((a, b) => b.matches - a.matches);

  // Player identity is optional — anonymous auth can be off, or simply
  // unavailable — so these are counted over the uids that exist rather than
  // over headcount, and the dashboard says so.
  const uniquePlayers = players.length;
  const returningPlayers = players.filter((p) => (p.matchesPlayed ?? 0) > 1).length;

  // Where abandoned games died. A lobby nobody started is its own answer —
  // that is a different problem from a match that fell apart halfway.
  const withProgress = sessions.filter((s) => s.lastActiveAt != null);
  const died = withProgress.filter((s) => isAbandoned(s, now));
  const whereGamesDie = tally(
    died.map((s) => (s.status === 'created' ? 'Lobby' : placeLabel(s.lastPhase, s.lastMiniGame)))
  );

  const failures = sessions.flatMap((s) => s.failures ?? []);
  const roundFailures = tally(
    failures.map((f) => {
      const place = placeLabel(f.phase, f.miniGame);
      // "Timed out" is implied for everything but the dice, which is the one
      // failure with a different cause worth naming.
      return f.kind === 'roll' ? `${place} — ${FAILURE_KIND_LABELS.roll}` : place;
    })
  );
  // The count keeps going past the kept detail, so it is the true total.
  const totalRoundFailures = sessions.reduce((sum, s) => sum + (s.failureCount ?? 0), 0);

  const abandonedLengths = died
    .filter((s) => s.status !== 'created')
    .map(sessionDuration)
    .filter((d): d is number => d != null);

  const funnel: FunnelStep[] = [
    { label: 'Rooms opened', value: sessionsCreated, hint: 'Someone created a room' },
    { label: 'Matches started', value: matchesStarted, hint: 'Someone pressed start' },
    { label: 'Matches finished', value: matchesCompleted, hint: 'Played through to the end' },
  ];

  return {
    rangeDays,
    generatedAt: now,
    sessionsCreated,
    matchesStarted,
    matchesCompleted,
    sessionsAbandoned,
    sessionsInFlight,
    startRate: ratio(matchesStarted, sessionsCreated),
    completionRate: ratio(matchesCompleted, matchesStarted),
    funnel,
    byDay: [...days.values()],
    miniGames,
    modes,
    medianMatchMinutes: Math.round((median(matches.map((m) => m.durationMs)) / 60_000) * 10) / 10,
    medianRounds: median(matches.map((m) => m.roundsPlayed ?? 0)),
    medianPlayers: median(matches.map((m) => m.playerCount ?? 0)),
    uniquePlayers,
    returningPlayers,
    returnRate: ratio(returningPlayers, uniquePlayers),
    totalMatchSlots: matches.reduce((sum, m) => sum + (m.playerCount ?? 0), 0),
    matchesMissingGames,
    whereGamesDie,
    roundFailures,
    totalRoundFailures,
    medianAbandonedMinutes: Math.round((median(abandonedLengths) / 60_000) * 10) / 10,
    sessionsWithProgress: withProgress.length,
  };
}
