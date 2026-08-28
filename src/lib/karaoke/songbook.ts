// The melodies the Karaoke Stage can ask somebody to sing.
//
// Everything here is RELATIVE, for the same reason solfege.ts is: a note is
// stored as semitones above the song's tonic, and the tonic is transposed into
// each singer's own range before the round starts. Storing absolute pitches
// would mean a song written for a soprano is unsingable by everyone else, and
// "unsingable" and "you are bad at this" look identical from the inside.
//
// Licensing is not left to guesswork. Every melody is either `traditional` —
// long out of copyright, with the lyrics equally so — or `original`, written
// for this game. Nothing modern goes in this file.

export type SongOrigin = 'traditional' | 'original';

export type KaraokeNote = {
  /** Semitones above the song's tonic. Negative means below it. */
  semitones: number;
  /** Beats from the start of the song. */
  start: number;
  /** Length in beats. */
  beats: number;
  /** Shown on the note, so the singer knows when to change. */
  syllable: string;
};

export type KaraokeSong = {
  id: string;
  title: string;
  origin: SongOrigin;
  /** Where a traditional melody comes from, so the claim is checkable. */
  credit: string;
  bpm: number;
  difficulty: 'easy' | 'medium' | 'hard';
  /** One line of why this song is in the set. */
  blurb: string;
  notes: KaraokeNote[];
};

/**
 * Parses a melody written as `semitones:beats:syllable` tokens.
 *
 * The syllable is glued to its own note rather than living in a parallel
 * string, because a parallel string drifts: one added note silently shifts
 * every lyric after it by one, and the melody still looks correct in review.
 * `|` is a phrase break for readability and is ignored.
 *
 * Rests are written with a `-` syllable and are not scored.
 */
export function melody(spec: string): KaraokeNote[] {
  const notes: KaraokeNote[] = [];
  let cursor = 0;

  for (const token of spec.split(/\s+/)) {
    if (!token || token === '|') continue;

    const [rawSemitones, rawBeats, ...rest] = token.split(':');
    const semitones = Number(rawSemitones);
    const beats = Number(rawBeats);
    const syllable = rest.join(':') || '·';

    if (!Number.isFinite(semitones) || !Number.isFinite(beats) || beats <= 0) {
      // Static data, so this only ever fires while somebody is editing the
      // songbook — which is exactly when it is useful to hear about it.
      console.warn(`[songbook] skipping malformed note token: ${token}`);
      continue;
    }

    if (syllable !== '-') {
      notes.push({ semitones, start: cursor, beats, syllable });
    }
    cursor += beats;
  }

  return notes;
}

/** Total length of a song in beats, including any trailing rest. */
export function songBeats(song: KaraokeSong): number {
  return song.notes.reduce((end, note) => Math.max(end, note.start + note.beats), 0);
}

/** How long a song takes to sing, in seconds. */
export function songSeconds(song: KaraokeSong): number {
  return (songBeats(song) * 60) / song.bpm;
}

/** The lowest and highest note in a song, in semitones above the tonic. */
export function songRange(song: KaraokeSong): { low: number; high: number } {
  if (song.notes.length === 0) return { low: 0, high: 12 };
  let low = Infinity;
  let high = -Infinity;
  for (const note of song.notes) {
    low = Math.min(low, note.semitones);
    high = Math.max(high, note.semitones);
  }
  return { low, high };
}

export const SONGBOOK: KaraokeSong[] = [
  {
    id: 'twinkle',
    title: 'Twinkle Twinkle Little Star',
    origin: 'traditional',
    credit: 'Melody "Ah! vous dirai-je, maman" (1761); lyrics Jane Taylor (1806)',
    bpm: 100,
    difficulty: 'easy',
    blurb: 'Steps and one clean leap. The song everybody already knows the shape of.',
    notes: melody(`
      0:1:Twin 0:1:kle 7:1:twin 7:1:kle 9:1:lit 9:1:tle 7:2:star |
      5:1:How 5:1:I 4:1:won 4:1:der 2:1:what 2:1:you 0:2:are |
      7:1:Up 7:1:a 5:1:bove 5:1:the 4:1:world 4:1:so 2:2:high |
      7:1:Like 7:1:a 5:1:dia 5:1:mond 4:1:in 4:1:the 2:2:sky |
      0:1:Twin 0:1:kle 7:1:twin 7:1:kle 9:1:lit 9:1:tle 7:2:star |
      5:1:How 5:1:I 4:1:won 4:1:der 2:1:what 2:1:you 0:2:are
    `),
  },

  {
    id: 'frere_jacques',
    title: 'Frère Jacques',
    origin: 'traditional',
    credit: 'Traditional French round, published 1780',
    bpm: 108,
    difficulty: 'easy',
    blurb: 'Four short phrases, each repeated. Forgiving if you lose your place.',
    notes: melody(`
      0:1:Frè 2:1:re 4:1:Jac 0:1:ques |
      0:1:Frè 2:1:re 4:1:Jac 0:1:ques |
      4:1:Dor 5:1:mez 7:2:vous |
      4:1:Dor 5:1:mez 7:2:vous |
      7:0.5:Son 9:0.5:nez 7:0.5:les 5:0.5:ma 4:1:ti 0:1:nes |
      7:0.5:Son 9:0.5:nez 7:0.5:les 5:0.5:ma 4:1:ti 0:1:nes |
      0:1:Ding -5:1:dang 0:2:dong |
      0:1:Ding -5:1:dang 0:2:dong
    `),
  },

  {
    id: 'london_bridge',
    title: 'London Bridge',
    origin: 'traditional',
    credit: 'Traditional English nursery rhyme, melody attested 1744',
    bpm: 112,
    difficulty: 'easy',
    blurb: 'Short and bouncy. The one to pick when the room has never done this before.',
    notes: melody(`
      7:1:Lon 9:1:don 7:1:brid 5:1:ge 4:1:is 5:1:fall 7:2:ing |
      2:1:down 4:1:fall 5:2:ing |
      4:1:down 5:1:fall 7:2:ing |
      7:1:Lon 9:1:don 7:1:brid 5:1:ge 4:1:is 5:1:fall 7:2:ing |
      2:1:down 7:1:my 4:1:fair 0:2:lady
    `),
  },

  {
    id: 'ode_to_joy',
    title: 'Ode to Joy',
    origin: 'traditional',
    credit: 'Beethoven, Symphony No. 9 (1824)',
    bpm: 104,
    difficulty: 'medium',
    blurb: 'Almost entirely stepwise, but the dotted ending catches people out.',
    notes: melody(`
      4:1:La 4:1:la 5:1:la 7:1:la |
      7:1:la 5:1:la 4:1:la 2:1:la |
      0:1:la 0:1:la 2:1:la 4:1:la |
      4:1.5:laa 2:0.5:la 2:2:laa |
      4:1:La 4:1:la 5:1:la 7:1:la |
      7:1:la 5:1:la 4:1:la 2:1:la |
      0:1:la 0:1:la 2:1:la 4:1:la |
      2:1.5:laa 0:0.5:la 0:2:laa
    `),
  },

  {
    id: 'saints',
    title: 'When the Saints Go Marching In',
    origin: 'traditional',
    credit: 'Traditional American spiritual',
    bpm: 116,
    difficulty: 'medium',
    blurb: 'A long final phrase with nowhere to breathe. Pace yourself.',
    notes: melody(`
      0:1:Oh 4:1:when 5:1:the 7:3:saints |
      0:1:oh 4:1:when 5:1:the 7:3:saints |
      0:1:oh 4:1:when 5:1:the 7:1:saints 4:1:go 0:1:march 4:1:ing 2:2:in |
      4:1:Oh 4:1:how 2:1:I 0:1:want 0:1:to 4:1:be 7:1:in 7:1:that |
      5:1:num 4:1:ber 5:1:when 7:1:the 4:1:saints 0:1:march 2:1:in 0:2:now
    `),
  },

  {
    id: 'station_lullaby',
    title: 'Station Lullaby',
    origin: 'original',
    credit: 'Written for Voice Party Arcade',
    bpm: 88,
    difficulty: 'easy',
    blurb: 'Slow, long notes, small steps. Built for a first-timer to actually score well on.',
    notes: melody(`
      0:2:Sleep 2:2:well 4:2:lit 2:2:tle 0:4:star |
      4:2:Drift 5:2:ing 7:2:through 5:2:the 4:4:dark |
      7:2:Home 5:2:is 4:2:where 2:2:we 0:4:are |
      0:2:Sleep 4:2:well 7:2:lit 4:2:tle 0:4:star
    `),
  },

  {
    id: 'danfo_horn',
    title: 'Danfo Horn',
    origin: 'original',
    credit: 'Written for Voice Party Arcade',
    bpm: 112,
    difficulty: 'medium',
    blurb: 'Minor pentatonic and a conductor shouting for Oshodi. Swings if you let it.',
    notes: melody(`
      0:0.5:O 3:0.5:ya 5:1:o 5:0.5:ya 3:0.5:en 0:1:ter |
      7:0.5:hold 5:0.5:your 3:1:change 0:2:oh |
      10:0.5:Os 7:0.5:ho 5:1:di 5:0.5:Os 3:0.5:ho 0:1:di |
      3:0.5:no 5:0.5:space 7:1:for 0:2:you |
      7:1:Dan 5:1:fo 3:1:horn 0:2:blow |
      3:1:one 5:1:more 7:1:time 10:2:now |
      0:0.5:O 3:0.5:ya 5:1:o 5:0.5:ya 3:0.5:en 0:1:ter |
      7:0.5:hold 5:0.5:your 3:1:change 0:3:oh
    `),
  },

  {
    id: 'whaala',
    title: 'Whaala!',
    origin: 'original',
    credit: 'Written for Voice Party Arcade',
    bpm: 104,
    difficulty: 'hard',
    blurb: 'Octave leaps, no two phrases the same. This is the one you lose on.',
    notes: melody(`
      0:0.5:Wha 12:0.5:a 7:1:la 0:1:ah |
      5:0.5:no 12:0.5:o 7:1:way 2:1:oh |
      4:0.5:how 11:0.5:did 7:1:you 0:1:sing |
      9:0.5:that 7:0.5:so 4:1:so 0:2:high |
      12:1:Wha 7:0.5:a 9:0.5:la 11:1:ah 12:1:ah |
      7:0.5:my 5:0.5:voice 4:1:done 0:2:go |
      2:0.5:up 9:0.5:and 7:1:then 0:1:down |
      12:1:whaa 5:1:aa 7:1:aa 0:3:la
    `),
  },
];

export function getSong(id: string): KaraokeSong | undefined {
  return SONGBOOK.find((song) => song.id === id);
}

/** A sensible opening setlist: easy first, so nobody's first go is the hard one. */
export function defaultSetlist(count = 3): string[] {
  const byEase = ['station_lullaby', 'twinkle', 'london_bridge', 'frere_jacques', 'saints', 'danfo_horn', 'ode_to_joy', 'whaala'];
  return byEase.slice(0, Math.max(1, Math.min(SONGBOOK.length, count)));
}
