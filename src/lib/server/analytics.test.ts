import { describe, expect, it } from 'vitest';
import { buildAnalytics, buildRecentSessions, placeLabel } from './analytics';
import type { SessionRecord } from './sessionArchive';
import { ROOM_TTL_MS } from '../gameRules';

const NOW = Date.UTC(2026, 8, 25, 12);
const MIN = 60_000;

/** A session row, abandoned unless told otherwise (older than the room TTL). */
function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const createdAt = overrides.createdAt ?? NOW - ROOM_TTL_MS - 60 * MIN;
  return {
    sessionId: `s-${Math.random().toString(36).slice(2)}`,
    roomId: 'ABCD',
    status: 'started',
    createdAt,
    startedAt: createdAt + MIN,
    endedAt: null,
    mode: 'board_game',
    vibe: null,
    playerCount: 3,
    matchId: 'm1',
    outcome: null,
    ...overrides,
  };
}

describe('placeLabel', () => {
  it('names the mini-game while the room is inside it', () => {
    expect(placeLabel('qualifying_voice', 'trivia_showdown')).toBe('Trivia Showdown');
  });

  it('does not blame the last mini-game for a room that died in the shop', () => {
    // currentMiniGame is still set after the game is over. Reading it here
    // would report a shop failure as a Trivia Showdown one.
    expect(placeLabel('powerup_shop', 'trivia_showdown')).toBe('Power-up shop');
    expect(placeLabel('roast_intermission', 'trivia_showdown')).toBe('Roast lounge');
  });

  it('names the beat inside a whole-match mode', () => {
    expect(placeLabel('ai_master:voting')).toBe('AI Master: the room voting');
    expect(placeLabel('truth_or_dare:prompt')).toBe('Truth or Dare: answering');
  });

  it('never throws on something it has not heard of', () => {
    expect(placeLabel('some_future_phase')).toBe('some_future_phase');
    expect(placeLabel(null)).toBe('Unknown');
  });
});

describe('buildAnalytics — where games break', () => {
  it('counts abandoned games by where they were last seen, lobbies apart', () => {
    const rows = [
      session({ lastActiveAt: NOW - ROOM_TTL_MS, lastPhase: 'powerup_shop' }),
      session({ lastActiveAt: NOW - ROOM_TTL_MS, lastPhase: 'powerup_shop' }),
      session({ lastActiveAt: NOW - ROOM_TTL_MS, lastPhase: 'qualifying_voice', lastMiniGame: 'pitch_bird' }),
      session({ status: 'created', startedAt: null, lastActiveAt: NOW - ROOM_TTL_MS, lastPhase: 'lobby' }),
    ];
    const summary = buildAnalytics(rows, [], [], 30, NOW);

    expect(summary.whereGamesDie).toEqual([
      { place: 'Power-up shop', count: 2, share: 0.5 },
      { place: 'PitchBird', count: 1, share: 0.25 },
      { place: 'Lobby', count: 1, share: 0.25 },
    ]);
  });

  it('leaves live and finished games out of "where games die"', () => {
    const live = session({ createdAt: NOW - 10 * MIN, lastActiveAt: NOW, lastPhase: 'powerup_shop' });
    const done = session({ status: 'completed', endedAt: NOW - 5 * MIN, lastActiveAt: NOW - 5 * MIN, lastPhase: 'game_over' });
    expect(buildAnalytics([live, done], [], [], 30, NOW).whereGamesDie).toEqual([]);
  });

  it('totals timeouts from the counter, which keeps going past the kept detail', () => {
    const row = session({
      failureCount: 55,
      failures: [
        { at: NOW, kind: 'phase', phase: 'powerup_shop', miniGame: 'trivia_showdown', round: 2 },
        { at: NOW, kind: 'roll', phase: 'roadmap_turn', miniGame: null, round: 2 },
      ],
    });
    const summary = buildAnalytics([row], [], [], 30, NOW);
    expect(summary.totalRoundFailures).toBe(55);
    expect(summary.roundFailures.map((r) => r.place).sort()).toEqual([
      'Power-up shop',
      'Rolling on the board — Nobody rolled',
    ]);
  });

  it('measures an abandoned game to its last sign of life', () => {
    const start = NOW - ROOM_TTL_MS - 90 * MIN;
    const rows = [
      session({ createdAt: start, startedAt: start, lastActiveAt: start + 20 * MIN, lastPhase: 'roadmap_turn' }),
      session({ createdAt: start, startedAt: start, lastActiveAt: start + 40 * MIN, lastPhase: 'roadmap_turn' }),
    ];
    expect(buildAnalytics(rows, [], [], 30, NOW).medianAbandonedMinutes).toBe(30);
  });

  it('reads rows written before the pulse existed without inventing data', () => {
    const legacy = session(); // no lastActiveAt, no failures, no names
    const summary = buildAnalytics([legacy], [], [], 30, NOW);
    expect(summary.sessionsWithProgress).toBe(0);
    expect(summary.whereGamesDie).toEqual([]);
    expect(summary.totalRoundFailures).toBe(0);
    expect(summary.medianAbandonedMinutes).toBe(0);
  });
});

describe('buildRecentSessions', () => {
  it('names who came and says how each one ended', () => {
    const rows = buildRecentSessions(
      [
        session({ createdAt: NOW - 30 * MIN, startedAt: NOW - 29 * MIN, status: 'completed', outcome: 'winner', endedAt: NOW - 5 * MIN, playerNames: ['Ada', 'Tunde'] }),
        session({ playerNames: ['Zainab'], lastActiveAt: NOW - ROOM_TTL_MS - 30 * MIN, lastPhase: 'powerup_shop', failureCount: 3 }),
      ],
      NOW
    );

    expect(rows[0]).toMatchObject({ state: 'completed', playerNames: ['Ada', 'Tunde'], durationMs: 24 * MIN });
    expect(rows[1]).toMatchObject({ state: 'abandoned', lastPlace: 'Power-up shop', failureCount: 3 });
  });

  it('shows the newest first and stops at the limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => session({ createdAt: NOW - i * MIN }));
    const rows = buildRecentSessions(many, NOW);
    expect(rows).toHaveLength(25);
    expect(rows[0].createdAt).toBe(NOW);
  });

  it('gives no length rather than a wrong one when there is nothing to measure to', () => {
    expect(buildRecentSessions([session()], NOW)[0].durationMs).toBeNull();
  });
});
