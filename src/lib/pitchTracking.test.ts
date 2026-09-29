import { describe, expect, it } from 'vitest';
import { DEFAULT_RANGE, HOLD_MS, MIN_RANGE_SEMITONES, PitchSmoother, hzToSemitones, rangeFromSamples } from './pitchTracking';

const FRAME_MS = 1000 / 60;

/** A repeatable stand-in for the noise in a real voice. */
function noise(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

/** Runs frames of `pitchAt(frame)` through a fresh smoother; returns the lift of each. */
function run(frames: number, pitchAt: (frame: number) => number, range = { lowSemi: hzToSemitones(100), highSemi: hzToSemitones(400) }) {
  const smoother = new PitchSmoother(range);
  return Array.from({ length: frames }, (_, i) => smoother.update(pitchAt(i), i * FRAME_MS));
}

const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

describe('holding a steady note', () => {
  it('barely moves the bird, however much the detector wobbles', () => {
    const r = noise(7);
    // Three percent either side is about half a semitone: normal for a real detector.
    const lift = run(300, () => 200 * (1 + r() * 0.06));
    expect(spread(lift.slice(60))).toBeLessThan(0.06);
  });

  it('ignores the vibrato of a held note completely', () => {
    const lift = run(300, (i) => 200 * Math.pow(2, Math.sin(i / 5) * 0.2 / 12));
    expect(spread(lift.slice(60))).toBeLessThan(0.02);
  });
});

describe('detector glitches', () => {
  it('does not follow a single frame of octave error', () => {
    const lift = run(300, (i) => (i % 25 === 12 ? 400 : i % 25 === 20 ? 100 : 200));
    const settled = lift.slice(60);
    expect(spread(settled)).toBeLessThan(0.03);
  });

  it('holds through the pitch dropping out on a consonant', () => {
    // Five frames is about 80 ms: well inside the hold.
    const lift = run(200, (i) => (i >= 100 && i < 105 ? 0 : 200));
    expect(spread(lift.slice(80, 140))).toBeLessThan(0.001);
  });
});

describe('following a real change', () => {
  it('takes the bird up when the singer really moves up', () => {
    const lift = run(200, (i) => (i < 60 ? 150 : 300));
    const before = lift[59];
    const after = lift[59 + 45];
    // Most of the way there within about three quarters of a second.
    expect(after - before).toBeGreaterThan(0.6 * (0.56 - before));
    expect(after).toBeGreaterThan(before);
  });

  it('is higher for a higher note and lower for a lower one', () => {
    const at = (hz: number) => run(200, () => hz)[199];
    expect(at(140)).toBeLessThan(at(200));
    expect(at(200)).toBeLessThan(at(300));
  });

  it('believes a jump that persists', () => {
    const lift = run(200, (i) => (i < 60 ? 130 : 390));
    expect(lift[199]).toBeGreaterThan(0.8);
  });
});

describe('the voice stopping', () => {
  it('lets the bird fall once the hold has passed, and not before', () => {
    const smoother = new PitchSmoother({ lowSemi: hzToSemitones(100), highSemi: hzToSemitones(400) });
    let t = 0;
    let lift = 0;
    for (let i = 0; i < 80; i++) lift = smoother.update(300, (t += FRAME_MS));
    const singing = lift;
    expect(singing).toBeGreaterThan(0.3);

    for (let i = 0; i < Math.floor(HOLD_MS / FRAME_MS) - 1; i++) lift = smoother.update(0, (t += FRAME_MS));
    expect(lift).toBe(singing);

    for (let i = 0; i < 240; i++) lift = smoother.update(0, (t += FRAME_MS));
    expect(lift).toBe(0);
  });
});

describe('the range to fly across', () => {
  it('is never less than an octave, even after humming one steady note', () => {
    const range = rangeFromSamples(Array.from({ length: 100 }, () => 200));
    expect(range.highSemi - range.lowSemi).toBeGreaterThanOrEqual(MIN_RANGE_SEMITONES);
    // And it is centred on the note that was hummed.
    expect((range.highSemi + range.lowSemi) / 2).toBeCloseTo(hzToSemitones(200), 1);
  });

  it('keeps a wide singer’s own range', () => {
    const samples = Array.from({ length: 100 }, (_, i) => 100 * Math.pow(4, i / 99));
    const range = rangeFromSamples(samples);
    expect(range.highSemi - range.lowSemi).toBeGreaterThan(20);
  });

  it('falls back when too little was heard', () => {
    expect(rangeFromSamples([200, 210])).toEqual(DEFAULT_RANGE);
  });

  it('turns a wobble after a hummed calibration into a small move, not the whole screen', () => {
    const range = rangeFromSamples(Array.from({ length: 100 }, () => 200));
    const r = noise(3);
    const lift = run(300, () => 200 * (1 + r() * 0.12), range);
    // A twelve percent swing is about two semitones out of an octave-plus range.
    expect(spread(lift.slice(60))).toBeLessThan(0.2);
  });
});
