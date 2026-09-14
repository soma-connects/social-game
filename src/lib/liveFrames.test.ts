import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The transport is a real WebRTC mesh, so it is stubbed here: what these tests
// care about is the frame layer's own behaviour — that it drops frames instead
// of flooding the channel, and that one peer on a different build cannot break
// everyone else's view by sending something unexpected.
const sent: string[] = [];
let handler: ((payload: string) => void) | null = null;

vi.mock('./voiceChat', () => ({
  voiceChat: {
    broadcastFrame: (payload: string) => sent.push(payload),
    onFrame: (fn: (payload: string) => void) => {
      handler = fn;
      return () => {
        handler = null;
      };
    },
  },
}));

const { publishFrame, subscribeFrames } = await import('./liveFrames');

// The throttle reads Date.now(), and the module remembers when it last sent —
// so each test drives the clock forward past the window rather than starting
// from whatever the previous test left behind.
let clock = 1_000_000;

beforeEach(() => {
  sent.length = 0;
  handler = null;
  vi.useFakeTimers();
  clock += 10_000;
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('publishing frames', () => {
  it('sends the first frame', () => {
    publishFrame('p1', 'pitch_bird', { y: 0.5 });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toMatchObject({ playerId: 'p1', game: 'pitch_bird' });
  });

  it('drops frames that arrive too fast rather than queueing them', () => {
    // A game loop calls this every animation frame — 60 times a second. Sending
    // all of them would swamp the channel, and a frame of a moving bird is
    // worthless by the time a backlog reaches the far end.
    publishFrame('p1', 'pitch_bird', { y: 0.1 });
    for (let i = 0; i < 60; i++) publishFrame('p1', 'pitch_bird', { y: i / 60 });
    expect(sent).toHaveLength(1);
  });

  it('sends again once the interval has passed', () => {
    publishFrame('p1', 'pitch_bird', { y: 0.1 });
    vi.setSystemTime(clock + 60);
    publishFrame('p1', 'pitch_bird', { y: 0.9 });
    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[1]).data.y).toBe(0.9);
  });
});

describe('receiving frames', () => {
  it('delivers a well-formed frame', () => {
    const seen: unknown[] = [];
    subscribeFrames((frame) => seen.push(frame));
    handler?.(JSON.stringify({ playerId: 'p2', game: 'pitch_bird', data: { y: 0.4 }, at: 1 }));
    expect(seen).toHaveLength(1);
  });

  it('ignores anything malformed instead of throwing into the render', () => {
    const seen: unknown[] = [];
    subscribeFrames((frame) => seen.push(frame));
    handler?.('not json at all');
    handler?.('null');
    handler?.(JSON.stringify({ nonsense: true }));
    handler?.(JSON.stringify({ playerId: 'p2' })); // no data
    expect(seen).toHaveLength(0);
  });

  it('stops delivering after unsubscribe', () => {
    const seen: unknown[] = [];
    const stop = subscribeFrames((frame) => seen.push(frame));
    stop();
    expect(handler).toBeNull();
  });
});
