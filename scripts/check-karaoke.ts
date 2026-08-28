// Offline check of the karaoke engine.
//
// The browser cannot be made to sing, so the parts that actually decide whether
// this mode works — melody parsing, transposition into a voice, and scoring —
// are exercised here instead.

import { SONGBOOK, songBeats, songSeconds, songRange } from '../src/lib/karaoke/songbook';
import {
  freshTally,
  gradePerformance,
  recordFrame,
  settleNotes,
  stageSong,
  noteAt,
} from '../src/lib/karaoke/karaokeScoring';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

console.log('=== songbook ===');
for (const song of SONGBOOK) {
  const beats = songBeats(song);
  const seconds = songSeconds(song);
  const range = songRange(song);
  const blanks = song.notes.filter((n) => !n.syllable || n.syllable === '·').length;
  const overlaps = song.notes.filter((n, i) => {
    const next = song.notes[i + 1];
    return next && n.start + n.beats > next.start + 1e-9;
  }).length;

  console.log(
    `${song.id.padEnd(16)} notes=${String(song.notes.length).padStart(3)} ` +
      `beats=${String(beats).padStart(4)} ${seconds.toFixed(1)}s ` +
      `range=${range.low}..${range.high} (${range.high - range.low}st) blanks=${blanks} overlaps=${overlaps}`
  );

  check(`${song.id} has notes`, song.notes.length >= 8);
  check(`${song.id} length is singable`, seconds >= 10 && seconds <= 70, `${seconds.toFixed(1)}s`);
  check(`${song.id} range fits a voice`, range.high - range.low <= 14, `${range.high - range.low} semitones`);
  check(`${song.id} every note has a syllable`, blanks === 0, `${blanks} blank`);
  check(`${song.id} notes do not overlap`, overlaps === 0, `${overlaps} overlapping`);
}

console.log('\n=== transposition into real voices ===');
const VOICES = [
  { name: 'low male   ', low: 85, high: 260 },
  { name: 'mid        ', low: 130, high: 400 },
  { name: 'high female', low: 190, high: 620 },
  { name: 'narrow     ', low: 160, high: 260 },
];

for (const voice of VOICES) {
  for (const song of SONGBOOK) {
    const staged = stageSong(song, { low: voice.low, high: voice.high });
    const hz = staged.timeline.map((n) => n.targetHz);
    const lowest = Math.min(...hz);
    const highest = Math.max(...hz);
    // Every note must be somewhere a human larynx goes, and the song should sit
    // roughly inside the measured range rather than an octave off it.
    check(
      `${song.id} @ ${voice.name} stays human`,
      lowest >= 70 && highest <= 900,
      `${lowest.toFixed(0)}..${highest.toFixed(0)}Hz`
    );
    check(
      `${song.id} @ ${voice.name} near the voice`,
      lowest >= voice.low * 0.7 && highest <= voice.high * 1.45,
      `${lowest.toFixed(0)}..${highest.toFixed(0)}Hz vs ${voice.low}..${voice.high}`
    );
  }
}
console.log('  (all songs staged for 4 voice types)');

console.log('\n=== scoring ===');
const song = SONGBOOK[0];
const staged = stageSong(song, { low: 130, high: 400 });
const FRAME = 1 / 60;

function run(pitchFor: (t: number, targetHz: number) => number) {
  const tally = freshTally();
  for (let t = 0; t < staged.seconds; t += FRAME) {
    const note = noteAt(staged, t);
    const hz = pitchFor(t, note ? note.targetHz : 0);
    recordFrame(tally, staged, t, hz);
    settleNotes(tally, staged, t);
  }
  settleNotes(tally, staged, staged.seconds + 1);
  return gradePerformance(tally, staged);
}

const perfect = run((_, target) => target);
const silent = run(() => 0);
const random = run(() => 120 + Math.random() * 260);
const drifting = run((_, target) => (target > 0 ? target * Math.pow(2, 70 / 1200) : 0)); // 70 cents sharp
const octaveUp = run((_, target) => target * 2);
const halfEffort = run((t, target) => (Math.floor(t / 2) % 2 === 0 ? target : 0));

for (const [label, result] of [
  ['perfect   ', perfect],
  ['70c sharp ', drifting],
  ['octave up ', octaveUp],
  ['half of it', halfEffort],
  ['random    ', random],
  ['silent    ', silent],
] as const) {
  console.log(
    `${label} accuracy=${(result.accuracy * 100).toFixed(0).padStart(3)}%  ` +
      `points=${String(result.points).padStart(4)}  grade=${result.grade.padEnd(2)}  ` +
      `notes=${result.notesHit}/${result.notesTotal}  streak=${result.bestStreak}`
  );
}

check('a perfect run scores near the maximum', perfect.points >= 950, `${perfect.points}`);
check('a perfect run grades S', perfect.grade === 'S', perfect.grade);
check('silence scores zero', silent.points === 0, `${silent.points}`);
check('silence grades F', silent.grade === 'F', silent.grade);
check('random singing scores badly', random.points < 400, `${random.points}`);
check('an octave up is forgiven', octaveUp.points >= 950, `${octaveUp.points}`);
check('70 cents sharp still counts', drifting.accuracy >= 0.9, `${drifting.accuracy.toFixed(2)}`);
check('half effort lands mid-table', halfEffort.points > 200 && halfEffort.points < 800, `${halfEffort.points}`);
check('streak resets on a missed note', halfEffort.bestStreak < halfEffort.notesTotal, `${halfEffort.bestStreak}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
