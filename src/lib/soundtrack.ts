/**
 * Which music plays on which screen.
 *
 * One table rather than a filename hard-coded into each component. Swapping a
 * track is a one-line edit here, and it is impossible for two screens to end up
 * sharing a track by accident — which is how Ludo silently inherited the lobby's
 * ambient bed and made starting a match sound like nothing had happened.
 *
 * Every file is 96 kbps: these are background beds playing under a voice call at
 * a quarter volume, and the originals were 256 kbps, which is three times the
 * download for something nobody is listening to closely.
 */

export type SoundtrackScreen =
  | 'lobby'
  | 'board'
  | 'mini_game'
  | 'asteroid_defense'
  | 'ludo'
  | 'chess'
  | 'team_battle'
  | 'karaoke'
  | 'hangout';

export interface Soundtrack {
  src: string;
  /**
   * Playback volume, 0..1.
   *
   * Set per track rather than globally because these came from different
   * sources and are mastered at different levels. Anything under a live voice
   * call has to sit well below it — the game is people talking, and the music
   * is furniture.
   */
  volume: number;
  /** Why this track sits here, so a future swap keeps the intent. */
  mood: string;
}

const AUDIO = '/audios';

export const SOUNDTRACKS: Record<SoundtrackScreen, Soundtrack> = {
  lobby: {
    src: `${AUDIO}/lexin_music-space-ambient-sci-fi-121842.mp3`,
    volume: 0.18,
    mood: 'Ambient and unhurried — people are arriving, picking avatars and talking.',
  },

  board: {
    src: `${AUDIO}/maksymmalko-game-minecraft-gaming-background-music-402451.mp3`,
    volume: 0.2,
    mood: 'Light adventure loop for the roadmap board between turns.',
  },

  mini_game: {
    src: `${AUDIO}/maksymmalko-game-gaming-background-music-385611.mp3`,
    volume: 0.14,
    mood: 'Generic bed for the voice mini-games. Quietest of the set — the mic is open and somebody is performing over it.',
  },

  asteroid_defense: {
    src: `${AUDIO}/psychronic-let-the-games-begin-21858.mp3`,
    volume: 0.22,
    mood: 'Driving and urgent, to match rocks falling towards you.',
  },

  ludo: {
    src: `${AUDIO}/drmseq-space-station-247790.mp3`,
    volume: 0.2,
    mood: 'Station hum. Ludo is slower and turn-based, so nothing frantic.',
  },

  chess: {
    src: `${AUDIO}/hitslab-video-game-gaming-minecraft-music-557448.mp3`,
    volume: 0.15,
    mood: 'Calm and sparse. Chess is thinking time and a busy loop becomes irritating fast.',
  },

  team_battle: {
    src: `${AUDIO}/alex-morgan-gaming-rock-545508.mp3`,
    volume: 0.22,
    mood: 'Rock, for the crew-versus-crew series. The most competitive screen gets the most aggressive track.',
  },

  karaoke: {
    src: `${AUDIO}/maksymmalko-game-gaming-minecraft-background-music-379533.mp3`,
    volume: 0.16,
    mood: 'Between songs only — the stage kills the bed entirely while somebody is singing, because a speaker playing into an open mic is scored as if the singer produced it.',
  },

  hangout: {
    src: `${AUDIO}/lexin_music-space-ambient-sci-fi-121842.mp3`,
    volume: 0.12,
    mood: 'The quietest track in the set. The lounge is people talking; the music is the room tone behind them and nothing more.',
  },
};

/**
 * Unused spare, kept deliberately.
 *
 * Swap it into any screen above if a track wears out — the whole point of the
 * table is that it costs one line.
 */
export const SPARE_TRACKS: string[] = [];
