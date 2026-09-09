import { MINIGAME_LABELS } from '../gameRules';
import type { MiniGameId } from '../types';
import { isAbandoned, type SessionRecord } from './sessionArchive';
import type { MatchRecord } from './matchArchive';

/**
 * Turns raw archive rows into the numbers the dashboard shows.
 *
 * Kept as a pure function over arrays, separate from the route that fetches
 * them, for two reasons: it can be tested without Firestore, and the shape of
 * every figure is visible in one place rather than spread through JSX. The
 * route's only job is to fetch, authorise and hand over.
 */

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
  };
}
