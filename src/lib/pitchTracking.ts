/**
 * Turns a stream of detected pitches into a steady 0..1 height.
 *
 * A raw pitch detector is jumpy in ways a voice is not: it reports octave
 * errors for a frame or two, drops out on every consonant, and wobbles with the
 * natural vibrato of a held note. Fed straight to a bird, all of that shows up
 * as flying. This smooths those away while still following a note that really
 * moves — a real slide from low to high still takes the bird with it.
 *
 * Pitch is worked in semitones rather than hertz: an octave is the same
 * distance to a singer wherever it sits, and a fixed number of hertz is a huge
 * step at 100 Hz and a small one at 400.
 */

/** Semitones above 55 Hz (A1). Only differences matter. */
export const hzToSemitones = (hz: number): number => 12 * Math.log2(hz / 55);

/** The flying range is never narrower than an octave, however still the singer was in calibration. */
export const MIN_RANGE_SEMITONES = 12;

export type PitchRange = { lowSemi: number; highSemi: number };

/** About 90 Hz to 450 Hz, which covers most speaking and singing voices. */
export const DEFAULT_RANGE: PitchRange = { lowSemi: hzToSemitones(90), highSemi: hzToSemitones(450) };

/**
 * The range to fly across, from what the player sang during calibration.
 *
 * The old range was a plain 50 Hz minimum: hum one steady note in calibration
 * and 50 Hz was the whole height of the screen, so a small wobble swung the bird
 * from the floor to the ceiling. This never gives less than an octave.
 */
export function rangeFromSamples(samplesHz: number[], fallback: PitchRange = DEFAULT_RANGE): PitchRange {
  if (samplesHz.length < 5) return fallback;
  const semis = samplesHz.map(hzToSemitones).sort((a, b) => a - b);
  let low = semis[Math.floor(semis.length * 0.1)] - 1.5;
  let high = semis[Math.floor(semis.length * 0.9)] + 1.5;
  const span = high - low;
  if (span < MIN_RANGE_SEMITONES) {
    const pad = (MIN_RANGE_SEMITONES - span) / 2;
    low -= pad;
    high += pad;
  }
  return { lowSemi: low, highSemi: high };
}

/** Frames of pitch the median looks across — about a sixth of a second. */
const MEDIAN_FRAMES = 9;
/** A jump this big in one frame is far more likely a detector octave error than the singer. */
const JUMP_SEMITONES = 7;
/** Frames in a row a jump has to persist before it is believed. */
const JUMP_CONFIRM_FRAMES = 3;
/** How long a lost pitch is held before the bird starts to fall. Bridges consonants and breaths. */
export const HOLD_MS = 220;
/** Movements smaller than this share of the range are the wobble of a held note. */
const DEADBAND = 0.03;
/** How much of the remaining distance to the target is covered per frame. */
const FOLLOW = 0.2;
/** How fast the height fades once the voice has really stopped. */
const FADE = 0.1;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export class PitchSmoother {
  private history: number[] = [];
  private pendingJump: number[] = [];
  private lift = 0;
  private lastVoicedAt = -Infinity;

  constructor(private range: PitchRange = DEFAULT_RANGE) {}

  setRange(range: PitchRange): void {
    this.range = range;
  }

  reset(): void {
    this.history = [];
    this.pendingJump = [];
    this.lift = 0;
    this.lastVoicedAt = -Infinity;
  }

  /**
   * Feeds one frame. `hz` is the detected pitch, or 0 when nothing voiced was
   * heard. Returns the height to use, 0..1.
   */
  update(hz: number, nowMs: number): number {
    if (hz <= 0) {
      if (nowMs - this.lastVoicedAt <= HOLD_MS) return this.lift;
      this.history = [];
      this.pendingJump = [];
      this.lift *= 1 - FADE;
      if (this.lift < 0.02) this.lift = 0;
      return this.lift;
    }

    const semi = hzToSemitones(hz);
    this.lastVoicedAt = nowMs;

    if (this.history.length >= 3) {
      const reference = median(this.history);
      if (Math.abs(semi - reference) >= JUMP_SEMITONES) {
        // Not believed yet: hold where we are unless it keeps happening.
        this.pendingJump.push(semi);
        if (this.pendingJump.length < JUMP_CONFIRM_FRAMES) return this.lift;
        // It kept happening, so it is the singer. Start the median again from it.
        this.history = this.pendingJump;
        this.pendingJump = [];
      } else {
        this.pendingJump = [];
        this.history.push(semi);
      }
    } else {
      this.history.push(semi);
    }
    if (this.history.length > MEDIAN_FRAMES) this.history.shift();

    const span = Math.max(this.range.highSemi - this.range.lowSemi, MIN_RANGE_SEMITONES);
    const target = Math.max(0, Math.min(1, (median(this.history) - this.range.lowSemi) / span));

    // A held note wobbles; a moved note does not. Only follow real movement.
    if (Math.abs(target - this.lift) >= DEADBAND) this.lift += (target - this.lift) * FOLLOW;
    return this.lift;
  }
}
