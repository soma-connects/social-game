'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BarList, ChartCard, EmptyPlot, Funnel, LineChart, StatTile } from './Charts';
import { FUNNEL_RAMP, INK, SERIES, STATUS, percent } from './vizTokens';
import type { AnalyticsSummary, RecentSession } from '@/lib/server/analytics';
import ReportsQueue from './ReportsQueue';

type RecentMatch = {
  matchId: string;
  roomId: string;
  mode: string;
  endedAt: number;
  durationMs: number;
  playerCount: number;
  roundsPlayed: number;
  outcome: string;
  winnerName: string | null;
  gamesPlayed: string[];
};

type Payload = {
  summary: AnalyticsSummary;
  recentMatches: RecentMatch[];
  /** Absent from a server older than this page, which must not crash on it. */
  recentSessions?: RecentSession[];
  truncated: { sessions: boolean; matches: boolean; players: boolean };
};

const RANGES = [7, 30, 90] as const;

const MODE_LABELS: Record<string, string> = {
  board_game: 'Roadmap board',
  team_battle: 'Team battle',
  chess: 'Chess',
  ludo: 'Ludo',
  ai_master: 'AI Master',
  truth_or_dare: 'Truth or Dare',
  unknown: 'Unrecorded',
};

/** Minutes, or seconds for anything shorter — a 40-second lobby is not "1 min". */
function formatLength(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  return `${Math.round(ms / 60_000)} min`;
}

const SESSION_STATE_LABELS: Record<RecentSession['state'], string> = {
  completed: 'Finished',
  abandoned: 'Abandoned',
  live: 'Still open',
};

/** Colours a rate by how healthy it is, not by which series it belongs to. */
function rateTone(rate: number, warn: number, bad: number): string {
  if (rate < bad) return STATUS.critical;
  if (rate < warn) return STATUS.warning;
  return STATUS.good;
}

type Tab = 'analytics' | 'reports';

export default function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('analytics');
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/analytics?days=${range}`, { cache: 'no-store' });
      if (response.status === 401) {
        onSignOut();
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Request failed');
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, [onSignOut]);

  useEffect(() => {
    if (tab !== 'analytics') return;
    void load(days);
  }, [days, load, tab]);

  const summary = data?.summary;
  // No identities at all while matches did finish means sign-in is off, not
  // that nobody came back — the three identity tiles read this together.
  const identityOff = !!summary && summary.uniquePlayers === 0 && summary.matchesCompleted > 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: INK.primary }}>
            {tab === 'reports' ? 'Moderation' : 'Game analytics'}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: INK.muted }}>
            {tab === 'reports'
              ? 'Player reports and what was decided about them'
              : summary
                ? `Last ${summary.rangeDays} days · updated ${new Date(summary.generatedAt).toLocaleTimeString()}`
                : 'Loading…'}
          </p>
        </div>

        {/* Wraps: seven controls do not fit across a phone, and without it
            Sign out sat entirely off-screen. */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl overflow-hidden border"
            style={{ borderColor: INK.axis }}
          >
            {(['analytics', 'reports'] as Tab[]).map((name) => (
              <button
                key={name}
                onClick={() => setTab(name)}
                className="px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
                style={{
                  backgroundColor: tab === name ? SERIES[0] : 'transparent',
                  color: tab === name ? '#ffffff' : INK.secondary,
                }}
              >
                {name}
              </button>
            ))}
          </div>

          {/* The date range only means something on the analytics tab; the
              moderation queue is a backlog, not a time series, and hiding an
              old unresolved report behind a 7-day filter is how one gets
              forgotten. */}
          {tab === 'analytics' && (
            <>
              <div
                className="inline-flex rounded-xl overflow-hidden border"
                style={{ borderColor: INK.axis }}
              >
                {RANGES.map((range) => (
                  <button
                    key={range}
                    onClick={() => setDays(range)}
                    className="px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: days === range ? SERIES[0] : 'transparent',
                      color: days === range ? '#ffffff' : INK.secondary,
                    }}
                  >
                    {range}d
                  </button>
                ))}
              </div>

              <button
                onClick={() => load(days)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border"
                style={{ borderColor: INK.axis, color: INK.secondary }}
              >
                Refresh
              </button>
            </>
          )}
          <button
            onClick={onSignOut}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl border"
            style={{ borderColor: INK.axis, color: INK.secondary }}
          >
            Sign out
          </button>
        </div>
      </header>

      {tab === 'reports' && <ReportsQueue onSignOut={onSignOut} />}

      {tab === 'analytics' && error && (
        <div
          className="rounded-2xl p-4 border text-sm"
          style={{ backgroundColor: INK.surface, borderColor: STATUS.critical, color: INK.secondary }}
          role="alert"
        >
          {error}
        </div>
      )}

      {tab === 'analytics' && loading && !data && (
        <p className="text-sm py-16 text-center" style={{ color: INK.muted }}>
          Loading analytics…
        </p>
      )}

      {tab === 'analytics' && summary && data && (
        <>
          {summary.sessionsCreated === 0 && (
            <div
              className="rounded-2xl p-4 border text-sm"
              style={{ backgroundColor: INK.surface, borderColor: INK.border, color: INK.secondary }}
            >
              No rooms were opened in this window. Funnel tracking starts recording from the first
              room created after this build is deployed — earlier matches predate it and will only
              appear in the mini-game and match figures.
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label="Rooms opened"
              value={String(summary.sessionsCreated)}
              hint={`${summary.matchesStarted} reached a match`}
            />
            <StatTile
              label="Start rate"
              value={percent(summary.startRate)}
              hint="Opened a room, then pressed start"
              tone={rateTone(summary.startRate, 0.6, 0.35)}
            />
            <StatTile
              label="Completion rate"
              value={percent(summary.completionRate)}
              hint="Started a match, then finished it"
              tone={rateTone(summary.completionRate, 0.6, 0.35)}
            />
            <StatTile
              label="Median match"
              value={`${summary.medianMatchMinutes} min`}
              hint={`${summary.medianRounds} rounds · ${summary.medianPlayers} players`}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <ChartCard
              title="Where people drop off"
              subtitle="Every room opened, not only the matches that finished"
            >
              <Funnel steps={summary.funnel} ramp={FUNNEL_RAMP} />
              <p className="text-xs mt-4 pt-3 border-t" style={{ color: INK.muted, borderColor: INK.grid }}>
                {summary.sessionsAbandoned} abandoned · {summary.sessionsInFlight} still open or in
                progress. A room counts as abandoned only once it can no longer be resumed, so a
                game running right now is never counted as a bounce.
              </p>
            </ChartCard>

            <ChartCard title="Activity" subtitle="Rooms opened and matches finished, per day">
              {summary.byDay.length > 0 ? (
                <LineChart
                  labels={summary.byDay.map((d) => d.date)}
                  series={[
                    {
                      key: 'sessions',
                      label: 'Rooms opened',
                      color: SERIES[0],
                      points: summary.byDay.map((d) => d.sessions),
                    },
                    {
                      key: 'matches',
                      label: 'Matches finished',
                      color: SERIES[1],
                      points: summary.byDay.map((d) => d.matches),
                    },
                  ]}
                />
              ) : (
                <EmptyPlot message="No activity in this window yet." />
              )}
            </ChartCard>
          </div>

          {/* Where games break.
              The funnel above says how many games are lost; this says where,
              and how long they had run. Both charts are single-series counts,
              so they carry no legend and no status colour — a place where
              games stop is a thing to look at, not an alarm. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label="Abandoned games"
              value={String(summary.sessionsAbandoned)}
              hint="Opened and never finished"
            />
            <StatTile
              label="Median abandoned game"
              value={`${summary.medianAbandonedMinutes} min`}
              hint="How long it ran before the room went quiet"
            />
            <StatTile
              label="Rounds timed out"
              value={String(summary.totalRoundFailures)}
              hint="The game had to move on without anyone"
            />
            <StatTile
              label="Sessions tracked"
              value={String(summary.sessionsWithProgress)}
              hint={`of ${summary.sessionsCreated} opened carry where-and-how-long data`}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <ChartCard
              title="Where games die"
              subtitle="Last place an abandoned game was seen"
            >
              {summary.whereGamesDie.length > 0 ? (
                <BarList
                  rows={summary.whereGamesDie.map((row) => ({
                    key: row.place,
                    label: row.place,
                    value: row.count,
                    note: percent(row.share),
                  }))}
                />
              ) : (
                <EmptyPlot message="No abandoned games with tracking data in this window." />
              )}
            </ChartCard>

            <ChartCard
              title="Where rounds time out"
              subtitle="Rounds the game moved on from because nobody finished them"
            >
              {summary.roundFailures.length > 0 ? (
                <BarList
                  rows={summary.roundFailures.map((row) => ({
                    key: row.place,
                    label: row.place,
                    value: row.count,
                    note: percent(row.share),
                  }))}
                />
              ) : (
                <EmptyPlot message="No rounds timed out in this window." />
              )}
            </ChartCard>
          </div>

          {summary.sessionsWithProgress < summary.sessionsCreated && (
            <p className="text-xs -mt-2" style={{ color: INK.muted }}>
              Drawn from the {summary.sessionsWithProgress} session
              {summary.sessionsWithProgress === 1 ? '' : 's'} recorded since where-and-how-long
              tracking shipped. Rooms opened before that have no last place or length to report.
            </p>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            <ChartCard
              title="Which mini-games get played"
              subtitle="Counted per appearance, across every match in range"
            >
              {summary.miniGames.length > 0 ? (
                <>
                  <BarList
                    rows={summary.miniGames.map((game) => ({
                      key: game.id,
                      label: game.label,
                      value: game.plays,
                      note: percent(game.share),
                    }))}
                  />
                  {summary.matchesMissingGames > 0 && (
                    <p className="text-xs mt-4 pt-3 border-t" style={{ color: INK.muted, borderColor: INK.grid }}>
                      {summary.matchesMissingGames === 1
                        ? '1 match recorded no mini-games and is excluded here'
                        : `${summary.matchesMissingGames} matches recorded no mini-games and are excluded here`}{' '}
                      — chess and ludo do not serve them, and matches archived before the full game
                      log shipped only kept their last few rounds.
                    </p>
                  )}
                </>
              ) : (
                <EmptyPlot message="No mini-games recorded in this window." />
              )}
            </ChartCard>

            <ChartCard title="Modes played" subtitle="Finished matches by room type">
              {summary.modes.length > 0 ? (
                <BarList
                  color={SERIES[2]}
                  rows={summary.modes.map((mode) => ({
                    key: mode.mode,
                    label: MODE_LABELS[mode.mode] ?? mode.mode,
                    value: mode.matches,
                    note: percent(mode.share),
                  }))}
                />
              ) : (
                <EmptyPlot message="No finished matches in this window." />
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Identity comes from Firebase Anonymous sign-in. With it off, every
                player is unknown and these read 0 — which is missing data, not
                a return rate of nothing, so it must not be painted as an alarm. */}
            <StatTile
              label="Known players"
              value={identityOff ? '—' : String(summary.uniquePlayers)}
              hint={
                identityOff
                  ? 'None recorded — is Anonymous sign-in enabled in Firebase?'
                  : 'Signed-in identities seen in range'
              }
            />
            <StatTile
              label="Came back"
              value={identityOff ? '—' : String(summary.returningPlayers)}
              hint="Played more than one match"
            />
            <StatTile
              label="Return rate"
              value={identityOff ? '—' : percent(summary.returnRate)}
              hint={identityOff ? 'Needs player identities' : 'Of known players'}
              tone={identityOff ? undefined : rateTone(summary.returnRate, 0.3, 0.15)}
            />
            <StatTile
              label="Seats filled"
              value={String(summary.totalMatchSlots)}
              hint="Players across all finished matches"
            />
          </div>

          <ChartCard
            title="Recent sessions"
            subtitle="Every room opened, finished or not — who came, how long, where it got to"
          >
            {(data.recentSessions ?? []).length > 0 ? (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ color: INK.muted }}>
                      {['Opened', 'Room', 'Mode', 'Who came', 'Length', 'Got to', 'Timeouts', 'Result'].map(
                        (head) => (
                          <th
                            key={head}
                            className="text-left font-semibold py-2 pr-4 border-b whitespace-nowrap"
                            style={{ borderColor: INK.grid }}
                          >
                            {head}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recentSessions ?? []).map((session) => (
                      <tr key={session.sessionId} style={{ color: INK.secondary }}>
                        <td className="py-2 pr-4 border-b whitespace-nowrap" style={{ borderColor: INK.grid }}>
                          {new Date(session.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 border-b font-mono" style={{ borderColor: INK.grid }}>
                          {session.roomId}
                        </td>
                        <td className="py-2 pr-4 border-b whitespace-nowrap" style={{ borderColor: INK.grid }}>
                          {session.started ? MODE_LABELS[session.mode] ?? session.mode : 'Lobby only'}
                        </td>
                        <td
                          className="py-2 pr-4 border-b min-w-[10rem]"
                          style={{ borderColor: INK.grid, color: INK.primary }}
                        >
                          {session.playerNames.length > 0 ? (
                            session.playerNames.join(', ')
                          ) : (
                            <span style={{ color: INK.muted }}>{session.playerCount} (names not recorded)</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 border-b tabular-nums whitespace-nowrap" style={{ borderColor: INK.grid }}>
                          {formatLength(session.durationMs)}
                        </td>
                        <td className="py-2 pr-4 border-b whitespace-nowrap" style={{ borderColor: INK.grid }}>
                          {/* For a game that ran to its end, "got to the end" is
                              what Result already says. The column earns its
                              space on the ones that stopped short. */}
                          {session.state === 'completed' && session.outcome !== 'ended_early'
                            ? '—'
                            : session.lastPlace ?? '—'}
                        </td>
                        <td className="py-2 pr-4 border-b tabular-nums" style={{ borderColor: INK.grid }}>
                          {session.failureCount}
                        </td>
                        <td
                          className="py-2 pr-4 border-b whitespace-nowrap"
                          style={{
                            borderColor: INK.grid,
                            color: session.state === 'completed' ? INK.primary : INK.muted,
                          }}
                        >
                          {session.state === 'completed' && session.outcome === 'ended_early'
                            ? 'Ended early'
                            : SESSION_STATE_LABELS[session.state]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyPlot message="No rooms opened in this window." />
            )}
          </ChartCard>

          <ChartCard
            title="Recent matches"
            subtitle="The 25 most recent, newest first"
            actions={
              (data.truncated.matches || data.truncated.sessions) && (
                <span className="text-[11px]" style={{ color: STATUS.warning }}>
                  Read cap reached — figures may under-report
                </span>
              )
            }
          >
            {data.recentMatches.length > 0 ? (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ color: INK.muted }}>
                      {['Ended', 'Room', 'Mode', 'Players', 'Rounds', 'Length', 'Winner'].map((head) => (
                        <th
                          key={head}
                          className="text-left font-semibold py-2 pr-4 border-b whitespace-nowrap"
                          style={{ borderColor: INK.grid }}
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentMatches.map((match) => (
                      <tr key={match.matchId} style={{ color: INK.secondary }}>
                        <td className="py-2 pr-4 border-b whitespace-nowrap" style={{ borderColor: INK.grid }}>
                          {new Date(match.endedAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 border-b font-mono" style={{ borderColor: INK.grid }}>
                          {match.roomId}
                        </td>
                        <td className="py-2 pr-4 border-b whitespace-nowrap" style={{ borderColor: INK.grid }}>
                          {MODE_LABELS[match.mode] ?? match.mode}
                        </td>
                        <td className="py-2 pr-4 border-b tabular-nums" style={{ borderColor: INK.grid }}>
                          {match.playerCount}
                        </td>
                        <td className="py-2 pr-4 border-b tabular-nums" style={{ borderColor: INK.grid }}>
                          {match.roundsPlayed}
                        </td>
                        <td className="py-2 pr-4 border-b tabular-nums whitespace-nowrap" style={{ borderColor: INK.grid }}>
                          {Math.round(match.durationMs / 60_000)} min
                        </td>
                        <td className="py-2 pr-4 border-b" style={{ borderColor: INK.grid, color: INK.primary }}>
                          {match.outcome === 'ended_early' ? (
                            <span style={{ color: INK.muted }}>Ended early</span>
                          ) : (
                            match.winnerName ?? '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyPlot message="No matches finished in this window." />
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}
