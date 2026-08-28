// What the Hangout Lounge puts on the table.
//
// The lounge has no scoring and no timer pressure, which means it lives or
// dies on whether there is something to talk about. A deck of prompts is the
// difference between "we are hanging out" and six people staring at a mute
// button — so the content is the feature here, not the UI around it.
//
// Every deck is written to be answerable by someone who has nothing prepared
// and does not want to be the centre of attention for long.

import { DUEL_TOPICS, NOLLYWOOD_DARES } from '../gameContent';
import type { HangoutDeckId } from './hangoutTypes';

export type HangoutDeck = {
  id: HangoutDeckId;
  label: string;
  emoji: string;
  /** One line on the card back. */
  blurb: string;
  /** Tailwind accent, so each deck reads as its own thing on the table. */
  accent: string;
  cards: string[];
};

/**
 * Openers that work on a group who barely know each other, and on one that
 * has known each other for fifteen years. Nothing that needs a confession to
 * be interesting, and nothing that only lands if you are already close.
 */
const CONFESSIONS = [
  'What is the pettiest thing you have ever done and would absolutely do again?',
  'Name a skill you are secretly quite good at and never mention.',
  'What is the most money you have wasted on something you used once?',
  'Describe the worst haircut you have ever had. Be specific.',
  'What is a food combination you love that everyone else finds disgusting?',
  'What is the longest you have gone pretending to understand something?',
  'Tell us about a text you sent to the wrong person.',
  'What is something you were completely wrong about for years?',
  'What is your most-used excuse for getting out of plans?',
  'Which household chore do you do badly on purpose so nobody asks again?',
  'What is the pettiest reason you have ever fallen out with someone?',
  'Name something you own that you would be embarrassed for us to find.',
  'What is the worst advice you have ever confidently given?',
  'Describe the last time you laughed at something completely inappropriate.',
  'What do you do that would immediately give you away as the culprit?',
  'What is a compliment you have never forgotten?',
];

const WOULD_YOU_RATHER = [
  'Would you rather always be ten minutes early or always twenty minutes late?',
  'Would you rather lose the ability to lie or the ability to keep a secret?',
  'Would you rather have unlimited data or unlimited fuel, forever?',
  'Would you rather your search history or your bank statement be read aloud?',
  'Would you rather never queue again or never be stuck in traffic again?',
  'Would you rather be famous for something embarrassing or unknown for something great?',
  'Would you rather have every song stuck in your head for a week, or silence forever?',
  'Would you rather always know when someone is lying, or always be believed?',
  'Would you rather cook every meal yourself or eat the same takeaway forever?',
  'Would you rather have a personal driver or a personal chef?',
  'Would you rather lose all your photos or all your saved messages?',
  'Would you rather live with no air conditioning or no hot water?',
  'Would you rather be the funniest person in the room or the most trusted?',
  'Would you rather win an argument you were wrong about, or lose one you were right about?',
  'Would you rather your phone rang at full volume in every quiet room, or never rang at all?',
];

/** Extra hot takes, so the lounge is not just recycling the duel tiles. */
const EXTRA_HOT_TAKES = [
  'Group voice notes should require a written summary attached',
  'Being on time is a personality trait, not a skill',
  'Most people do not actually like coffee',
  'Watching a film with subtitles on is objectively better',
  'Nobody has ever enjoyed a surprise party thrown for them',
  'The best part of any trip is the day before it',
  'Phone calls should be scheduled like meetings',
  'Every group chat has exactly one person holding it together',
  'Reading the last page first is a legitimate way to read a book',
  'Nobody actually finishes the podcasts they recommend',
  'A birthday should be a week, not a day',
  'Leftovers are better than the original meal, every time',
];

export const HANGOUT_DECKS: Record<HangoutDeckId, HangoutDeck> = {
  hot_take: {
    id: 'hot_take',
    label: 'Hot Take',
    emoji: '🌶️',
    blurb: 'Defend it. Badly, if necessary.',
    accent: 'text-orange-300 border-orange-400/40 bg-orange-500/10',
    cards: [...DUEL_TOPICS, ...EXTRA_HOT_TAKES],
  },
  confession: {
    id: 'confession',
    label: 'Confession',
    emoji: '🫣',
    blurb: 'Answer honestly or lie convincingly.',
    accent: 'text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-500/10',
    cards: CONFESSIONS,
  },
  would_you_rather: {
    id: 'would_you_rather',
    label: 'Would You Rather',
    emoji: '⚖️',
    blurb: 'Pick one. Then justify it to the room.',
    accent: 'text-cyan-300 border-cyan-400/40 bg-cyan-500/10',
    cards: WOULD_YOU_RATHER,
  },
  dare: {
    id: 'dare',
    label: 'Dare',
    emoji: '🎭',
    blurb: 'Do it on the mic. The room decides if it counted.',
    accent: 'text-amber-300 border-amber-400/40 bg-amber-500/10',
    cards: NOLLYWOOD_DARES,
  },
  host: {
    id: 'host',
    label: 'Ask the Host',
    emoji: '🤖',
    blurb: 'The AI host writes one, fresh, about this room.',
    accent: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10',
    // Filled by /api/ai-master at draw time. These are what the deck falls
    // back to when the model is unreachable — a dead button is worse than a
    // slightly less specific prompt.
    cards: [
      'Everyone name one thing the person on your left would definitely say next.',
      'Somebody explain the last argument you had, from the other side.',
      'Whoever spoke least so far: you are up, tell us something.',
      'Everyone rank the room by who would survive longest without their phone.',
      'Somebody describe the group chat you are all in, to a stranger.',
    ],
  },
};

export const DECK_ORDER: HangoutDeckId[] = [
  'hot_take',
  'would_you_rather',
  'confession',
  'dare',
  'host',
];

/**
 * Draws a card, avoiding the one already on the table.
 *
 * Uniform random on a fifteen-card deck repeats far more often than a room
 * reads as random — two of the same prompt in three draws feels like the
 * button is broken.
 */
export function drawCard(deck: HangoutDeckId, avoid?: string): string {
  const cards = HANGOUT_DECKS[deck].cards;
  if (cards.length === 0) return 'Somebody say something interesting.';
  if (cards.length === 1) return cards[0];

  const pool = avoid ? cards.filter((card) => card !== avoid) : cards;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** The soundboard. Every pad fires on every device in the room at once. */
export const SOUNDBOARD_PADS = [
  { id: 'horn', label: 'Danfo Horn', emoji: '📯' },
  { id: 'brass', label: 'Nollywood', emoji: '🎭' },
  { id: 'gen', label: 'Generator', emoji: '🔌' },
  { id: 'bell', label: 'Vendor Bell', emoji: '🔔' },
  { id: 'choi', label: 'Choi!', emoji: '✨' },
  { id: 'whaala', label: 'Whaala!', emoji: '🚨' },
  { id: 'zap', label: 'Zap', emoji: '⚡' },
  { id: 'boom', label: 'Boom', emoji: '💥' },
] as const;

export type SoundPadId = (typeof SOUNDBOARD_PADS)[number]['id'];

/** Vibe milestones, purely so the meter filling means something. */
export const VIBE_TIERS = [
  { at: 0, label: 'Settling in', emoji: '🪑' },
  { at: 15, label: 'Warmed up', emoji: '🙂' },
  { at: 40, label: 'Proper vibes', emoji: '🎉' },
  { at: 80, label: 'Neighbours knocking', emoji: '🔥' },
  { at: 140, label: 'Legendary night', emoji: '👑' },
];

export function vibeTier(vibe: number) {
  let current = VIBE_TIERS[0];
  for (const tier of VIBE_TIERS) if (vibe >= tier.at) current = tier;
  return current;
}

export function nextVibeTier(vibe: number) {
  return VIBE_TIERS.find((tier) => tier.at > vibe) ?? null;
}
