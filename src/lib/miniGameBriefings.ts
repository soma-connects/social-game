import { MiniGameId } from './types';

/**
 * What each mini-game actually asks of a player.
 *
 * Play-testing turned up one problem above all the others: people could not
 * tell what they were supposed to do. The games announce themselves with a name
 * and an icon and then start, which is fine for whoever built them and useless
 * to a first-time player holding a phone.
 *
 * Kept deliberately short. This is read once, under time pressure, by someone
 * who wants to start playing — a wall of text is the same as no text. One line
 * for the goal, at most three for the doing, one for how it scores.
 */
export interface MiniGameBriefing {
  /** One sentence: what winning looks like. */
  goal: string;
  /** The actual actions, in order. Three at most. */
  steps: string[];
  /** How points are earned, so the incentive is visible. */
  scoring: string;
  /** Whether the player needs to speak. Drives the mic warning. */
  usesMic: boolean;
  /** Optional single tip that materially changes how well you do. */
  tip?: string;
}

export const MINIGAME_BRIEFINGS: Record<MiniGameId, MiniGameBriefing> = {
  voice_arena: {
    goal: 'Say the word on screen before the timer runs out.',
    steps: [
      'A word appears with its pronunciation underneath.',
      'Say it clearly into your mic.',
      'Get it right before the clock hits zero.',
    ],
    scoring: 'Faster and clearer scores higher. The room can react to your attempt for bonus points.',
    usesMic: true,
    tip: 'Speak up and finish the whole word — trailing off is what usually fails.',
  },

  pitch_bird: {
    goal: 'Fly the bird through the gaps by changing the pitch of your voice.',
    steps: [
      'Hum or sing — higher pitch flies the bird up.',
      'Lower pitch drops it back down.',
      'Silence makes it fall, so keep making sound.',
    ],
    scoring: 'One point per gate you pass. Crashing ends the run.',
    usesMic: true,
    tip: 'A steady hum beats singing words. It is about pitch, not volume.',
  },

  solfege: {
    goal: 'Sing back the note you are asked for.',
    steps: [
      'Listen to the reference note ("Do") first.',
      'You are given a note to sing — Re, Mi, Fa and so on.',
      'Sing it and hold it steady for a few seconds.',
    ],
    scoring: 'Closer to the true pitch scores more, across five rounds.',
    usesMic: true,
    tip: 'Hold one steady note. Sliding around loses more than starting slightly off.',
  },

  spelling_bee: {
    goal: 'Spell the word you hear, out loud, letter by letter.',
    steps: [
      'The word is read to you.',
      'Say each letter separately — "C, A, T".',
      'Finish before the timer expires.',
    ],
    scoring: 'Correct spellings score; speed adds to it.',
    usesMic: true,
    tip: 'Leave a small gap between letters so they are not heard as one word.',
  },

  truth_or_bluff: {
    goal: 'Tell the room two things about yourself. One is a lie. Do not get caught.',
    steps: [
      'Say your two claims out loud.',
      'Mark which one was the lie.',
      'Everyone else votes on which they think it was.',
    ],
    scoring: 'You score for fooling people. They score for catching you.',
    usesMic: true,
    tip: 'Make the true one sound unlikely. That is the whole trick.',
  },

  story_builder: {
    goal: 'Build one story together, a sentence each.',
    steps: [
      'Read what has been written so far.',
      'Add exactly one sentence when it is your turn.',
      'Vote for whoever made the best contribution.',
    ],
    scoring: 'Everyone banks points; the funniest line wins the vote.',
    usesMic: true,
    tip: 'Hand the next person something difficult to follow. That is where the laughs are.',
  },

  debate: {
    goal: 'Argue your side of a deliberately silly topic and win the room over.',
    steps: [
      'You are given a topic and a side — you do not get to choose.',
      'Make your case when it is your turn.',
      'Everyone not debating votes for a winner.',
    ],
    scoring: 'The room decides. Conviction beats being right.',
    usesMic: true,
    tip: 'Commit completely. Half-arguing a stupid position loses every time.',
  },

  guess_the_voice: {
    goal: 'Work out who is behind the disguised voice.',
    steps: [
      'One player secretly records a line.',
      'It plays back pitched down and distorted.',
      'Everyone guesses who it was.',
    ],
    scoring: 'Guessers score for being right; the speaker scores for staying hidden.',
    usesMic: true,
    tip: 'Listen for rhythm and phrasing. The distortion hides pitch, not habits.',
  },

  trivia_showdown: {
    goal: 'Answer the question out loud before the timer ends.',
    steps: [
      'The question is read out.',
      'Say your answer — the whole sentence is fine.',
      'You do not need to phrase it exactly.',
    ],
    scoring: 'A correct answer scores full marks. There is no penalty for guessing.',
    usesMic: true,
    tip: 'Say the answer plainly. Long preambles can run the clock out.',
  },

  asteroid_defense: {
    goal: 'Shoot down falling asteroids by saying the word written on them.',
    steps: [
      'Each asteroid carries a word.',
      'Say a word out loud to destroy that asteroid.',
      'Anything reaching the bottom costs you a life.',
    ],
    scoring: 'Points per rock, with a combo bonus for chaining them quickly.',
    usesMic: true,
    tip: 'Take the lowest one first. Height, not size, is what kills you.',
  },
};
