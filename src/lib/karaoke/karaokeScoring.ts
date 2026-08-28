// Turning a sung performance into a number.
//
// Built on the same primitives as the solfège rounds — the same cents
// tolerances, the same octave forgiveness — because they are the same problem
// measured at more points. What is new here is time: a song is scored frame by
// frame while it scrolls past, so the answer to "did they sing it" is a
// proportion rather than a yes.

import { centsError, CLOSE_CENTS, PERFECT_CENTS } from '../solfege';
import { KaraokeNote, KaraokeSong, songRange } from './songbook';

/**
 * Seconds at the start of a note that are not scored.
 *
 * Nobody arrives on a note instantly; they slide onto it. Solfège has the same
 * grace for the same reason, and it matters more here — a song asks you to do
 * it once per note rather than once per round, so an ungraced scorer punishes
 * you for the physical act of changing pitch dozens of times.
 */
export const NOTE_GRACE_SECONDS = 0.18;

/** A note shorter than this is all grace, so it gets a smaller allowance. */
const SHORT_NOTE_SECONDS = 0.45;

export type NoteVerdict = 'perfect' | 'close' | 'miss' | 'silent';

/** A song positioned in one singer's vocal range, with real times and pitches. */
export type StagedSong = {
  song: KaraokeSong;
  /** Hz of the song's tonic, chosen to sit in this singer's range. */
  tonicHz: number;
  /** Seconds per beat. */
  secondsPerBeat: number;
  /** Total length in seconds. */
  seconds: number;
  /** Notes with absolute seconds and target frequencies resolved. */
  timeline: StagedNote[];
  /** Semitone bounds for drawing, with headroom above and below. */
  low: number;
  high: number;
};

export type StagedNote = KaraokeNote & {
  index: number;
  /** Seconds from the start of the song. */
  startAt: number;
  endAt: number;
  targetHz: number;
};

/** Midpoint of a singer's calibrated range, in Hz. */
function rangeCentre(low: number, high: number): number {
  // Geometric rather than arithmetic: pitch is logarithmic, so the arithmetic
  // midpoint of 100Hz and 400Hz is 250Hz, which is a fifth too high to be the
  // middle of that range. The geometric midpoint (200Hz) actually is.
  return Math.sqrt(Math.max(40, low) * Math.max(60, high));
}

/**
 * Places a song in a singer's voice.
 *
 * The tonic is chosen so the song's own span sits centred in the range the
 * calibration measured, then nudged so nothing falls off either end. Getting
 * this wrong is the single fastest way to make a singing game feel broken:
 * a song two octaves too high scores zero no matter how well it is sung.
 */
export function stageSong(
  song: KaraokeSong,
  singerRange: { low: number; high: number }
): StagedSong {
  const { low: songLow, high: songHigh } = songRange(song);
  const centre = rangeCentre(singerRange.low, singerRange.high);

  // Put the middle of the song at the middle of the voice.
  const songCentreSemitones = (songLow + songHigh) / 2;
  let tonicHz = centre / Math.pow(2, songCentreSemitones / 12);

  // Then pull it back inside the measured range if the span does not fit
  // comfortably. A voice narrower than the song is normal, so this prefers
  // keeping the top reachable — straining upward is what makes people stop.
  const lowest = tonicHz * Math.pow(2, songLow / 12);
  const highest = tonicHz * Math.pow(2, songHigh / 12);
  if (highest > singerRange.high) tonicHz *= singerRange.high / highest;
  else if (lowest < singerRange.low) tonicHz *= singerRange.low / lowest;

  // Never leave the tonic somewhere no voice goes, whatever calibration said.
  tonicHz = Math.min(440, Math.max(90, tonicHz));

  const secondsPerBeat = 60 / song.bpm;
  const timeline: StagedNote[] = song.notes.map((note, index) => ({
    ...note,
    index,
    startAt: note.start * secondsPerBeat,
    endAt: (note.start + note.beats) * secondsPerBeat,
    targetHz: tonicHz * Math.pow(2, note.semitones / 12),
  }));

  const seconds = timeline.reduce((end, note) => Math.max(end, note.endAt), 0);

  return {
    song,
    tonicHz,
    secondsPerBeat,
    seconds,
    timeline,
    low: songLow - 3,
    high: songHigh + 3,
  };
}

/** The note that should be being sung at `seconds`, if any. */
export function noteAt(staged: StagedSong, seconds: number): StagedNote | null {
  for (const note of staged.timeline) {
    if (seconds >= note.startAt && seconds < note.endAt) return note;
  }
  return null;
}

export function verdictFor(sungHz: number, targetHz: number): NoteVerdict {
  if (sungHz <= 0) return 'silent';
  const error = Math.abs(centsError(sungHz, targetHz));
  if (error <= PERFECT_CENTS) return 'perfect';
  if (error <= CLOSE_CENTS) return 'close';
  return 'miss';
}

/**
 * Running tally for one performance.
 *
 * Accumulated in a plain object rather than React state because it is written
 * on every animation frame — putting sixty updates a second through a setState
 * is how a smooth game turns into a slideshow.
 */
export type PerformanceTally = {
  /** Scored samples per note, keyed by note index. */
  notes: Map<number, { hit: number; close: number; total: number }>;
  /** Consecutive notes cleared, and the best run so far. */
  streak: number;
  bestStreak: number;
  /** Notes fully finished, so the streak only counts settled ones. */
  settled: Set<number>;
};

export function freshTally(): PerformanceTally {
  return { notes: new Map(), streak: 0, bestStreak: 0, settled: new Set() };
}

/**
 * Records one frame of singing.
 *
 * `sungHz` of 0 means silence, which is recorded rather than ignored — a note
 * nobody sang at all has to score zero, and skipping silent frames would make
 * saying nothing indistinguishable from singing perfectly.
 */
export function recordFrame(
  tally: PerformanceTally,
  staged: StagedSong,
  seconds: number,
  sungHz: number
): NoteVerdict | null {
  const note = noteAt(staged, seconds);
  if (!note) return null;

  const noteSeconds = note.endAt - note.startAt;
  const grace = noteSeconds < SHORT_NOTE_SECONDS ? noteSeconds * 0.35 : NOTE_GRACE_SECONDS;
  if (seconds < note.startAt + grace) return null;

  const verdict = verdictFor(sungHz, note.targetHz);
  const entry = tally.notes.get(note.index) ?? { hit: 0, close: 0, total: 0 };
  entry.total += 1;
  if (verdict === 'perfect') entry.hit += 1;
  else if (verdict === 'close') entry.close += 1;
  tally.notes.set(note.index, entry);

  return verdict;
}

/** How well one note was sung, 0..1. A close note is worth half a perfect one. */
export function noteAccuracy(tally: PerformanceTally, index: number): number {
  const entry = tally.notes.get(index);
  if (!entry || entry.total === 0) return 0;
  return (entry.hit + entry.close * 0.5) / entry.total;
}

/**
 * Closes off notes the playhead has passed, so the streak is settled rather
 * than flickering while a note is still in progress.
 */
export function settleNotes(tally: PerformanceTally, staged: StagedSong, seconds: number): void {
  for (const note of staged.timeline) {
    if (note.endAt > seconds || tally.settled.has(note.index)) continue;
    tally.settled.add(note.index);

    if (noteAccuracy(tally, note.index) >= 0.5) {
      tally.streak += 1;
      tally.bestStreak = Math.max(tally.bestStreak, tally.streak);
    } else {
      tally.streak = 0;
    }
  }
}

export type PerformanceResult = {
  /** Mean note accuracy across the whole song, 0..1. */
  accuracy: number;
  /** Notes cleared at 50% or better. */
  notesHit: number;
  notesTotal: number;
  bestStreak: number;
  /** Points awarded, 0..MAX_SONG_POINTS. */
  points: number;
  grade: string;
  /** One line for the results screen. */
  verdict: string;
};

/** Ceiling for a single song, before any crowd bonus. */
export const MAX_SONG_POINTS = 1000;

/**
 * Grades a finished performance.
 *
 * Every note counts the same regardless of length. Weighting by duration
 * sounds fairer and is not: it makes the two-beat notes at the end of each
 * phrase worth double, so holding one long vowel outscores singing the tune.
 */
export function gradePerformance(tally: PerformanceTally, staged: StagedSong): PerformanceResult {
  const total = staged.timeline.length;
  if (total === 0) {
    return { accuracy: 0, notesHit: 0, notesTotal: 0, bestStreak: 0, points: 0, grade: '—', verdict: 'Nothing to sing.' };
  }

  let sum = 0;
  let hits = 0;
  for (const note of staged.timeline) {
    const accuracy = noteAccuracy(tally, note.index);
    sum += accuracy;
    if (accuracy >= 0.5) hits += 1;
  }

  const accuracy = sum / total;

  // A curve with a floor under it.
  //
  // Two things have to be true at once. Raw frame accuracy tops out well short
  // of 100% even for a trained voice — vibrato alone drifts past the perfect
  // window — so scoring it linearly means nobody ever sees a big number and the
  // game reads as rigged. But a wandering voice also lands inside the tolerance
  // by pure chance a fifth of the time, and paying that a quarter of the
  // maximum makes singing nothing in particular look like a real attempt.
  //
  // Subtracting the chance floor before curving fixes both: a genuine effort is
  // rewarded generously, and noise scores like noise.
  const CHANCE_FLOOR = 0.12;
  const above = Math.max(0, (accuracy - CHANCE_FLOOR) / (1 - CHANCE_FLOOR));
  const curved = Math.min(1, Math.pow(above, 0.8) * 1.06);
  const streakBonus = Math.min(0.08, (tally.bestStreak / total) * 0.08);
  const points = Math.round(Math.min(1, curved + streakBonus) * MAX_SONG_POINTS);

  const { grade, verdict } = describe(accuracy, tally.bestStreak, total);
  return { accuracy, notesHit: hits, notesTotal: total, bestStreak: tally.bestStreak, points, grade, verdict };
}

function describe(accuracy: number, bestStreak: number, total: number): { grade: string; verdict: string } {
  if (accuracy >= 0.85) return { grade: 'S', verdict: 'Studio take. The room has questions about your day job.' };
  if (accuracy >= 0.7) return { grade: 'A', verdict: 'Genuinely good. You held the tune and everybody heard it.' };
  if (accuracy >= 0.55) return { grade: 'B', verdict: 'Solid. A couple of corners cut, nothing anybody minded.' };
  if (accuracy >= 0.4) {
    return bestStreak >= total / 3
      ? { grade: 'C', verdict: 'Strong start, then it got away from you.' }
      : { grade: 'C', verdict: 'The tune was in there somewhere. Mostly.' };
  }
  if (accuracy >= 0.2) return { grade: 'D', verdict: 'Confident. Not correct, but confident.' };
  return { grade: 'F', verdict: 'That was a different song entirely, and honestly it was better.' };
}
