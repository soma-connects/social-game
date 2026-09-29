import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The store imports the Firebase client for an ID token it does not need here.
vi.mock('./firebase/auth', () => ({ getIdToken: async () => null }));

import { roomStore } from './roomStore';

/**
 * The live-state push is throttled to one write per 1.5 seconds, because every
 * write rewrites the whole room document and fans out to every client. That is
 * right for spectator garnish and wrong for one thing: the attempt starting or
 * ending, which is what tells everyone else's replay recorder when to run. A
 * listener told a second late has already missed the first word.
 */
describe('pushLiveState', () => {
  const fetchMock = vi.fn();
  const push = (state: Parameters<typeof roomStore.pushLiveState>[2]) =>
    roomStore.pushLiveState('ROOM', 'sis', state);

  /** What the last request told the server. */
  const lastSent = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body).state;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));

    // One store serves the whole page, so its throttle memory has to be wiped
    // between cases or each would inherit the last one's.
    const memory = roomStore as unknown as {
      lastLivePush: number;
      lastLiveBody: string;
      lastLiveAttempting: boolean | undefined;
    };
    memory.lastLivePush = 0;
    memory.lastLiveBody = '';
    memory.lastLiveAttempting = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('still throttles ordinary progress, as before', () => {
    push({ prompt: 'a', progress: 0.1 });
    vi.advanceTimersByTime(300);
    push({ prompt: 'a', progress: 0.2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1500);
    push({ prompt: 'a', progress: 0.3 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends an attempt starting at once, however recently something else was sent', () => {
    push({ prompt: 'about to start', attempting: false });
    vi.advanceTimersByTime(200);
    push({ prompt: 'about to start', attempting: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastSent().attempting).toBe(true);
  });

  it('sends an attempt ending at once', () => {
    push({ prompt: 'go', attempting: true });
    vi.advanceTimersByTime(200);
    push({ prompt: 'go', attempting: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastSent().attempting).toBe(false);
  });

  it('does not let the exemption swallow the ordinary throttle while the attempt runs', () => {
    push({ prompt: 'go', progress: 0.1, attempting: true });
    vi.advanceTimersByTime(300);
    // attempting has not changed, so this is just progress and waits its turn.
    push({ prompt: 'go', progress: 0.2, attempting: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('carries the flag in the request, to the action the server expects', () => {
    push({ prompt: 'go', attempting: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ action: 'push_live_state', playerId: 'sis', state: { attempting: true } });
  });

  it('is not fooled by games that never report the flag', () => {
    push({ prompt: 'q1' });
    vi.advanceTimersByTime(300);
    push({ prompt: 'q2' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('starts fresh for the next turn, where the first report is "not attempting yet"', () => {
    // Last turn ended mid-attempt. The next performer's first report is idle,
    // which is a change from what the store last sent and so goes out at once,
    // clearing the flag in the room instead of leaving it to the next tick.
    push({ prompt: 'go', attempting: true });
    vi.advanceTimersByTime(100);
    push({ prompt: 'next player', attempting: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
