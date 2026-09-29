import { describe, expect, it } from 'vitest';
import { MAX_FAILURES_KEPT, SESSION_PULSE_MS, noteRoundFailure, noteSessionPulse } from './sessionArchive';
import type { RoomState } from '../types';

const room = (overrides: Partial<RoomState> = {}) =>
  ({ roomId: 'ABCD', sessionId: 'ABCD-1', phase: 'powerup_shop', players: [], ...overrides }) as unknown as RoomState;

describe('noteSessionPulse', () => {
  it('fires at most once per pulse interval', () => {
    const r = room();
    noteSessionPulse(r, 1_000_000);
    expect(r.sessionPulseAt).toBe(1_000_000);

    noteSessionPulse(r, 1_000_000 + SESSION_PULSE_MS - 1);
    expect(r.sessionPulseAt).toBe(1_000_000);

    noteSessionPulse(r, 1_000_000 + SESSION_PULSE_MS);
    expect(r.sessionPulseAt).toBe(1_000_000 + SESSION_PULSE_MS);
  });

  it('does nothing for a room with no session to report to', () => {
    const r = room({ sessionId: null });
    noteSessionPulse(r, 1_000_000);
    expect(r.sessionPulseAt).toBeUndefined();
  });
});

describe('noteRoundFailure', () => {
  it('advances the cap counter on the room, so it is saved with the room write', () => {
    const r = room();
    noteRoundFailure(r, 'phase', 1);
    noteRoundFailure(r, 'roll', 2);
    expect(r.failuresRecorded).toBe(2);
  });

  it('stops keeping detail at the cap, however long a room stays stuck', () => {
    const r = room();
    for (let i = 0; i < MAX_FAILURES_KEPT + 25; i++) noteRoundFailure(r, 'phase', i);
    expect(r.failuresRecorded).toBe(MAX_FAILURES_KEPT);
  });
});
