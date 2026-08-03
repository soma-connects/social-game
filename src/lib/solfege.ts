// Music theory and scoring for the karaoke section.
//
// This is the engine a full karaoke mode needs, reduced to its simplest form: a
// song is a pitch contour over time, and a solfège round is that contour with a
// single point. Scoring, tolerance and octave handling all live here so loading
// real melodies later means feeding this different targets, not rewriting it.
//
// Everything is RELATIVE. The player is played a tonic and asked for an interval
// above it, because asking someone to produce a named absolute pitch is asking
// for perfect pitch — which almost nobody has, and which would make every round
// fail for reasons the player cannot see.

export type SolfegeDegree = {
  /** Solfège syllable, which is what the player is asked to sing. */
  name: string;
  /** Semitones above the tonic in a major scale. */
  semitones: number;
  /** Rough difficulty — thirds and fifths are far easier to pitch than sevenths. */
  tier: 'easy' | 'medium' | 'hard';
};

export const SOLFEGE: SolfegeDegree[] = [
  { name: 'Do', semitones: 0, tier: 'easy' },
  { name: 'Re', semitones: 2, tier: 'medium' },
  { name: 'Mi', semitones: 4, tier: 'easy' },
  { name: 'Fa', semitones: 5, tier: 'medium' },
  { name: 'So', semitones: 7, tier: 'easy' },
  { name: 'La', semitones: 9, tier: 'medium' },
  { name: 'Ti', semitones: 11, tier: 'hard' },
  { name: 'Do↑', semitones: 12, tier: 'medium' },
];

/** Cents inside which a note counts as hit. A semitone is 100 cents. */
export const PERFECT_CENTS = 50;
export const CLOSE_CENTS = 110;

/** Seconds the player has to find and hold the note. */
export const HOLD_SECONDS = 4;

/**
 * Grace at the start of the hold window that is not scored.
 *
 * Nobody lands on a note instantly — they slide onto it. Scoring the scramble
 * punished people for the half second it takes to find the pitch, which made
 * the round feel stressful rather than fun.
 */
export const GRACE_SECONDS = 1;
/** Rounds per turn. */
export const ROUNDS_PER_TURN = 5;
/** Maximum points a single round can pay. */
export const POINTS_PER_ROUND = 100;

export function targetFrequency(tonic: number, semitones: number): number {
  return tonic * Math.pow(2, semitones / 12);
}

/**
 * Signed cents between what was sung and the target, folded into a single
 * octave.
 *
 * Octave errors are forgiven deliberately. Singing the right note an octave
 * low is musically correct — men and women asked for the same note will
 * naturally land an octave apart — and the autocorrelation detector itself
 * occasionally reports the wrong octave. Penalising that would punish players
 * for being right.
 */
export function centsError(sung: number, target: number): number {
  if (sung <= 0 || target <= 0) return Number.POSITIVE_INFINITY;

  let ratio = sung / target;
  while (ratio >= Math.SQRT2) ratio /= 2;
  while (ratio < Math.SQRT1_2) ratio *= 2;

  return 1200 * Math.log2(ratio);
}

/**
 * Which way the player needs to move, in plain language.
 *
 * The syllable name alone ("sing So") tells a non-musician nothing about
 * whether that is above or below where their voice currently sits. This is the
 * primary instruction on screen; the tuning meter is only a refinement of it.
 */
export type Direction = 'higher' | 'lower' | 'hold' | 'silent';

export function directionFor(cents: number): Direction {
  if (!Number.isFinite(cents)) return 'silent';
  if (cents < -PERFECT_CENTS) return 'higher';
  if (cents > PERFECT_CENTS) return 'lower';
  return 'hold';
}

export type HitQuality = 'perfect' | 'close' | 'miss';

export function classify(cents: number): HitQuality {
  const off = Math.abs(cents);
  if (off <= PERFECT_CENTS) return 'perfect';
  if (off <= CLOSE_CENTS) return 'close';
  return 'miss';
}

/**
 * Picks a tonic and a target degree that both sit inside the player's measured
 * range.
 *
 * A fixed tonic would be unusable: a bass and a soprano asked for the same
 * absolute note are being set different tasks, and one of them is being asked
 * for something they physically cannot produce.
 */
export function pickRound(
  range: { low: number; high: number },
  exclude?: string
): { tonic: number; degree: SolfegeDegree } {
  // Sit the tonic a little above the floor of their range so there is room to
  // sing above it, and headroom below for anyone who undershoots.
  const tonic = Math.max(80, range.low * Math.pow(2, 2 / 12));

  // Only offer intervals that still fit under their ceiling.
  const reachable = SOLFEGE.filter(
    (d) => targetFrequency(tonic, d.semitones) <= range.high * 1.05 && d.name !== exclude
  );
  const pool = reachable.length > 0 ? reachable : [SOLFEGE[0], SOLFEGE[2]];

  return { tonic, degree: pool[Math.floor(Math.random() * pool.length)] };
}

/**
 * Scores a round from the frames sampled while the player held the note.
 *
 * Sustain rather than instant-hit: what is measured is the share of the window
 * spent on pitch, which is both more forgiving and more entertaining — a voice
 * drifting off a held note is the joke.
 */
export function scoreRound(samples: number[]): {
  points: number;
  accuracy: number;
  bestCents: number;
  quality: HitQuality;
} {
  const voiced = samples.filter((c) => Number.isFinite(c));
  if (voiced.length === 0) {
    return { points: 0, accuracy: 0, bestCents: Number.POSITIVE_INFINITY, quality: 'miss' };
  }

  const perfect = voiced.filter((c) => Math.abs(c) <= PERFECT_CENTS).length;
  const close = voiced.filter((c) => Math.abs(c) > PERFECT_CENTS && Math.abs(c) <= CLOSE_CENTS).length;

  // Close counts for half — being nearly right should not score nothing.
  const accuracy = Math.min(1, (perfect + close * 0.5) / Math.max(voiced.length, 1));
  const bestCents = voiced.reduce((best, c) => (Math.abs(c) < Math.abs(best) ? c : best), voiced[0]);

  return {
    points: Math.round(POINTS_PER_ROUND * accuracy),
    accuracy,
    bestCents,
    quality: classify(bestCents),
  };
}

/** Pidgin-flavoured verdicts, matching the tone of the rest of the game. */
export function verdictFor(quality: HitQuality, cents: number): string {
  if (quality === 'perfect') return 'Dead on! Your ear correct!';
  if (quality === 'close') return cents > 0 ? 'Small sharp — but e near!' : 'Small flat — but e near!';
  if (!Number.isFinite(cents)) return 'Nothing heard o! Open mouth!';
  return cents > 0 ? 'Way too high! Come down!' : 'Way too low! Climb up!';
}
