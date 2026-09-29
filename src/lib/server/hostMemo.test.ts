import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAll, once } from './hostMemo';

beforeEach(() => {
  forgetAll();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('remembering a model call', () => {
  it('asks once however many times the same question arrives', async () => {
    let asked = 0;
    const ask = async () => {
      asked++;
      return 'a line';
    };

    // The first attempt, then two replays after write conflicts.
    expect(await once('room|round1|challenge', ask)).toBe('a line');
    expect(await once('room|round1|challenge', ask)).toBe('a line');
    expect(await once('room|round1|challenge', ask)).toBe('a line');

    expect(asked).toBe(1);
  });

  it('shares one call between requests that arrive while it is in flight', async () => {
    let asked = 0;
    let finish: (v: string) => void = () => {};
    const slow = () =>
      new Promise<string>((resolve) => {
        asked++;
        finish = resolve;
      });

    const a = once('k', slow);
    const b = once('k', slow);
    finish('done');

    expect(await a).toBe('done');
    expect(await b).toBe('done');
    expect(asked).toBe(1);
  });

  it('asks again when the question is genuinely different', async () => {
    let asked = 0;
    const ask = async () => ++asked;

    expect(await once('room|round1|Ada', ask)).toBe(1);
    // A different target, a different round: not the same question.
    expect(await once('room|round1|Ben', ask)).toBe(2);
    expect(await once('room|round2|Ada', ask)).toBe(3);
  });

  it('remembers an empty answer, so a replay does not wait out the same failure', async () => {
    let asked = 0;
    const failing = async () => {
      asked++;
      return null;
    };
    expect(await once('k', failing)).toBeNull();
    expect(await once('k', failing)).toBeNull();
    expect(asked).toBe(1);
  });

  it('does not remember a call that threw', async () => {
    let asked = 0;
    const flaky = async () => {
      asked++;
      if (asked === 1) throw new Error('boom');
      return 'ok';
    };

    await expect(once('k', flaky)).rejects.toThrow('boom');
    await vi.advanceTimersByTimeAsync(0);
    expect(await once('k', flaky)).toBe('ok');
    expect(asked).toBe(2);
  });

  it('forgets after a minute, so a later round is never answered from an old one', async () => {
    let asked = 0;
    const ask = async () => ++asked;

    await once('k', ask);
    vi.advanceTimersByTime(61_000);
    expect(await once('k', ask)).toBe(2);
  });

  it('holds a bounded number of answers', async () => {
    for (let i = 0; i < 400; i++) await once(`k${i}`, async () => i);
    let asked = 0;
    // The oldest are gone...
    await once('k0', async () => ++asked);
    expect(asked).toBe(1);
    // ...and the newest are still remembered.
    await once('k399', async () => ++asked);
    expect(asked).toBe(1);
  });
});
