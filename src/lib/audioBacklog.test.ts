import { describe, expect, it } from 'vitest';
import { AudioBacklog } from './audioBacklog';

describe('audio held while a connection is set up', () => {
  it('replays everything in the order it was said', () => {
    const backlog = new AudioBacklog<number>(10);
    [1, 2, 3].forEach((n) => backlog.hold(n));
    expect(backlog.drain()).toEqual([1, 2, 3]);
  });

  it('is empty once replayed, so nothing is sent twice', () => {
    const backlog = new AudioBacklog<number>(10);
    backlog.hold(1);
    backlog.drain();
    expect(backlog.size).toBe(0);
    expect(backlog.drain()).toEqual([]);
  });

  it('keeps only the most recent audio if the connection never comes', () => {
    const backlog = new AudioBacklog<number>(3);
    for (let n = 1; n <= 7; n++) backlog.hold(n);
    expect(backlog.drain()).toEqual([5, 6, 7]);
  });

  it('starts filling again after a replay, for a reconnect', () => {
    const backlog = new AudioBacklog<string>(5);
    backlog.hold('a');
    backlog.drain();
    backlog.hold('b');
    expect(backlog.drain()).toEqual(['b']);
  });
});
