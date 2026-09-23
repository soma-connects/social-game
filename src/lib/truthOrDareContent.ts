import type { TruthOrDareCategoryId, TruthOrDareSelectionMode, TruthOrDareSettings } from './types';

export type TruthOrDareCategoryInfo = {
  id: TruthOrDareCategoryId;
  label: string;
  emoji: string;
  blurb: string;
  /** Gated behind the host's spicy toggle — never shown unless it's switched on. */
  spicy?: boolean;
};

/**
 * Every category a host can pick at setup.
 *
 * `spicy` is the only one gated behind a separate toggle rather than just being
 * a category like the rest — a host who unchecks it by mistake should not
 * accidentally turn the whole room explicit, so it needs the deliberate second
 * switch on top of being selected.
 */
export const TRUTH_OR_DARE_CATEGORIES: TruthOrDareCategoryInfo[] = [
  {
    id: 'confessions',
    label: 'Confessions',
    emoji: '🙊',
    blurb: 'Secrets, embarrassing moments, things nobody here has heard yet.',
  },
  {
    id: 'silly',
    label: 'Silly & Physical',
    emoji: '🤪',
    blurb: 'Classic party dares — sing, dance, impressions, tongue twisters.',
  },
  {
    id: 'deep',
    label: 'Real Talk',
    emoji: '💭',
    blurb: 'Genuine, thoughtful questions about who you actually are.',
  },
  {
    id: 'hot_takes',
    label: 'Hot Takes',
    emoji: '🔥',
    blurb: 'Unpopular opinions and petty debates, played for laughs.',
  },
  {
    id: 'knowledge',
    label: 'Tech & Trivia',
    emoji: '🧠',
    blurb: 'Nerdy, general-knowledge truths and challenges.',
  },
  {
    id: 'money_career',
    label: 'Money & Job',
    emoji: '💼',
    blurb: 'Salaries, ambitions, and workplace confessions.',
  },
  {
    id: 'spicy',
    label: 'Spicy',
    emoji: '🌶️',
    blurb: 'Bold, flirty, teasing — for consenting adults. Never explicit.',
    spicy: true,
  },
];

export type TruthOrDarePrompt = {
  id: string;
  type: 'truth' | 'dare';
  category: TruthOrDareCategoryId;
  text: string;
};

/**
 * The curated deck. Player-submitted prompts (anonymised, pooled per room) are
 * a planned follow-up — this is the library a room can play from immediately,
 * with nothing to set up beyond picking categories.
 */
export const TRUTH_OR_DARE_PROMPTS: TruthOrDarePrompt[] = [
  // ── confessions ────────────────────────────────────────────────────────
  { id: 't_confessions_1', type: 'truth', category: 'confessions', text: "What's the most embarrassing thing you've done to impress someone?" },
  { id: 't_confessions_2', type: 'truth', category: 'confessions', text: "What's a lie you told that somehow never got caught?" },
  { id: 't_confessions_3', type: 'truth', category: 'confessions', text: "What's the last thing you Googled that you'd be embarrassed to show the room?" },
  { id: 't_confessions_4', type: 'truth', category: 'confessions', text: "What's a rumor about you that is actually true?" },
  { id: 't_confessions_5', type: 'truth', category: 'confessions', text: "What's the pettiest reason you've ever stopped talking to someone?" },
  { id: 't_confessions_6', type: 'truth', category: 'confessions', text: "What's something you pretended to understand but had no clue about?" },
  { id: 'd_confessions_1', type: 'dare', category: 'confessions', text: 'Show the room your most-used emoji from your last 10 messages.' },
  { id: 'd_confessions_2', type: 'dare', category: 'confessions', text: "Read out loud the last text you sent, exactly as it's typed." },
  { id: 'd_confessions_3', type: 'dare', category: 'confessions', text: 'Let the player to your left set your status for the next 2 minutes.' },
  { id: 'd_confessions_4', type: 'dare', category: 'confessions', text: "Do your best impression of how you act when you're trying to flirt." },
  { id: 'd_confessions_5', type: 'dare', category: 'confessions', text: "Show the room your 5th most recent photo (skip it if it's truly private)." },
  { id: 'd_confessions_6', type: 'dare', category: 'confessions', text: 'Confess the most Nigerian thing about you, in your best "oyinbo" accent.' },

  // ── silly & physical ───────────────────────────────────────────────────
  { id: 't_silly_1', type: 'truth', category: 'silly', text: "What's the weirdest thing you've done when you thought no one was watching?" },
  { id: 't_silly_2', type: 'truth', category: 'silly', text: "What's a food combo you love that everyone judges you for?" },
  { id: 't_silly_3', type: 'truth', category: 'silly', text: "What's the most ridiculous excuse you've ever given for being late?" },
  { id: 't_silly_4', type: 'truth', category: 'silly', text: 'If you had to dance in front of a stadium right now, what song plays?' },
  { id: 't_silly_5', type: 'truth', category: 'silly', text: "What's a nickname you secretly like being called?" },
  { id: 't_silly_6', type: 'truth', category: 'silly', text: "What's the strangest thing currently in your pockets or bag?" },
  { id: 'd_silly_1', type: 'dare', category: 'silly', text: 'Do your best Nollywood crying scene for 15 seconds.' },
  { id: 'd_silly_2', type: 'dare', category: 'silly', text: 'Talk in an accent the room picks for the next two rounds.' },
  { id: 'd_silly_3', type: 'dare', category: 'silly', text: 'Let the group pick your dance move — perform it for 10 seconds.' },
  { id: 'd_silly_4', type: 'dare', category: 'silly', text: 'Say the alphabet backwards as fast as you can.' },
  { id: 'd_silly_5', type: 'dare', category: 'silly', text: 'Do an impression of another player until someone guesses who.' },
  { id: 'd_silly_6', type: 'dare', category: 'silly', text: 'Sing the chorus of the last song you listened to, opera style.' },

  // ── real talk ───────────────────────────────────────────────────────────
  { id: 't_deep_1', type: 'truth', category: 'deep', text: "What's something you're proud of that you rarely tell people?" },
  { id: 't_deep_2', type: 'truth', category: 'deep', text: "What's a fear you've never said out loud in this group?" },
  { id: 't_deep_3', type: 'truth', category: 'deep', text: 'Who in your life has shaped you the most, and how?' },
  { id: 't_deep_4', type: 'truth', category: 'deep', text: "What's something you'd change about how you handle conflict?" },
  { id: 't_deep_5', type: 'truth', category: 'deep', text: 'What was a moment you felt truly seen by someone?' },
  { id: 't_deep_6', type: 'truth', category: 'deep', text: 'What is one thing you wish people understood about you?' },
  { id: 'd_deep_1', type: 'dare', category: 'deep', text: 'Give the person to your right one genuine compliment, no jokes allowed.' },
  { id: 'd_deep_2', type: 'dare', category: 'deep', text: "Share one goal you're actually working toward right now." },
  { id: 'd_deep_3', type: 'dare', category: 'deep', text: 'Tell the group about a mistake you learned the most from.' },
  { id: 'd_deep_4', type: 'dare', category: 'deep', text: 'Look someone in the eye and say one thing you appreciate about them.' },
  { id: 'd_deep_5', type: 'dare', category: 'deep', text: 'Share the last time you cried and why, if you feel like it.' },
  { id: 'd_deep_6', type: 'dare', category: 'deep', text: 'Tell the room what "success" actually means to you.' },

  // ── hot takes ───────────────────────────────────────────────────────────
  { id: 't_hot_takes_1', type: 'truth', category: 'hot_takes', text: "What's your most unpopular food opinion?" },
  { id: 't_hot_takes_2', type: 'truth', category: 'hot_takes', text: 'Who in this room would you trust to plan a trip, no debate?' },
  { id: 't_hot_takes_3', type: 'truth', category: 'hot_takes', text: "What's a trend everyone loves that you secretly can't stand?" },
  { id: 't_hot_takes_4', type: 'truth', category: 'hot_takes', text: 'What is one thing about your city that outsiders always get wrong?' },
  { id: 't_hot_takes_5', type: 'truth', category: 'hot_takes', text: 'Pick one: money or time — which do you actually protect more?' },
  { id: 't_hot_takes_6', type: 'truth', category: 'hot_takes', text: "What's a \"hill you'll die on\" opinion, even if it's petty?" },
  { id: 'd_hot_takes_1', type: 'dare', category: 'hot_takes', text: 'Defend an opinion the group assigns you for 30 seconds like it\'s fact.' },
  { id: 'd_hot_takes_2', type: 'dare', category: 'hot_takes', text: 'Roast the room for 20 seconds — nobody is safe, keep it playful.' },
  { id: 'd_hot_takes_3', type: 'dare', category: 'hot_takes', text: 'Debate the player across from you: jollof rice, Nigerian vs Ghanaian.' },
  { id: 'd_hot_takes_4', type: 'dare', category: 'hot_takes', text: 'Give a fake TED talk on the pettiest hot take you have.' },
  { id: 'd_hot_takes_5', type: 'dare', category: 'hot_takes', text: 'Argue that your worst habit is actually a personality strength.' },
  { id: 'd_hot_takes_6', type: 'dare', category: 'hot_takes', text: 'Let the group assign you a debate topic and argue the side you disagree with.' },

  // ── tech & trivia ───────────────────────────────────────────────────────
  { id: 't_knowledge_1', type: 'truth', category: 'knowledge', text: "What's a skill you claim to have but have never actually tested?" },
  { id: 't_knowledge_2', type: 'truth', category: 'knowledge', text: 'What app do you spend the most time on and are least proud of?' },
  { id: 't_knowledge_3', type: 'truth', category: 'knowledge', text: "What's the last new thing you taught yourself?" },
  { id: 't_knowledge_4', type: 'truth', category: 'knowledge', text: "If your phone died right now, what's the first app you'd panic about?" },
  { id: 't_knowledge_5', type: 'truth', category: 'knowledge', text: "What's a fact you know that always surprises people?" },
  { id: 't_knowledge_6', type: 'truth', category: 'knowledge', text: 'What is one thing about AI or tech that genuinely worries you?' },
  { id: 'd_knowledge_1', type: 'dare', category: 'knowledge', text: "Explain your job to the room like you're talking to a 5-year-old." },
  { id: 'd_knowledge_2', type: 'dare', category: 'knowledge', text: 'Name 5 countries in 10 seconds — miss one, take a forfeit.' },
  { id: 'd_knowledge_3', type: 'dare', category: 'knowledge', text: 'Try to guess what everyone in the room does for a living, one by one.' },
  { id: 'd_knowledge_4', type: 'dare', category: 'knowledge', text: 'Do a 20-second impression of a tech support call gone wrong.' },
  { id: 'd_knowledge_5', type: 'dare', category: 'knowledge', text: 'Recite your password *rules* (not the password!) as a dramatic monologue.' },
  { id: 'd_knowledge_6', type: 'dare', category: 'knowledge', text: 'Explain the plot of the last movie you watched using only gestures.' },

  // ── money & job ─────────────────────────────────────────────────────────
  { id: 't_money_career_1', type: 'truth', category: 'money_career', text: "What's the worst financial decision you've made and can now laugh about?" },
  { id: 't_money_career_2', type: 'truth', category: 'money_career', text: 'Would you take a pay cut for a job you actually loved? Be honest.' },
  { id: 't_money_career_3', type: 'truth', category: 'money_career', text: "What's a job you'd never admit to wanting?" },
  { id: 't_money_career_4', type: 'truth', category: 'money_career', text: "What's the most impulsive thing you've bought this year?" },
  { id: 't_money_career_5', type: 'truth', category: 'money_career', text: "If money wasn't a factor, what would you actually be doing right now?" },
  { id: 't_money_career_6', type: 'truth', category: 'money_career', text: "What's your honest relationship with saving money — good, bad, or non-existent?" },
  { id: 'd_money_career_1', type: 'dare', category: 'money_career', text: "Pitch your dream business to the room in 30 seconds like it's Shark Tank." },
  { id: 'd_money_career_2', type: 'dare', category: 'money_career', text: 'Negotiate a fake raise from your "boss" (pick a player) — the room judges your case.' },
  { id: 'd_money_career_3', type: 'dare', category: 'money_career', text: 'Read your last three transactions out loud (skip anything truly private).' },
  { id: 'd_money_career_4', type: 'dare', category: 'money_career', text: 'Do your best impression of your strictest boss or teacher.' },
  { id: 'd_money_career_5', type: 'dare', category: 'money_career', text: 'Sell an ordinary object in the room like it is a luxury product.' },
  { id: 'd_money_career_6', type: 'dare', category: 'money_career', text: 'Confess the most impulsive thing on your wishlist right now.' },

  // ── spicy (gated, never explicit) ─────────────────────────────────────
  { id: 't_spicy_1', type: 'truth', category: 'spicy', text: 'Who in this room would you trust with a secret first?' },
  { id: 't_spicy_2', type: 'truth', category: 'spicy', text: "What's your idea of the most romantic gesture, honestly?" },
  { id: 't_spicy_3', type: 'truth', category: 'spicy', text: "What's a compliment you've received that you still think about?" },
  { id: 't_spicy_4', type: 'truth', category: 'spicy', text: "Who's someone — celebrity or otherwise — you'd admit to having a crush on?" },
  { id: 't_spicy_5', type: 'truth', category: 'spicy', text: "What's your biggest green flag in a partner?" },
  { id: 't_spicy_6', type: 'truth', category: 'spicy', text: "What's the boldest move you've made to get someone's attention?" },
  { id: 'd_spicy_1', type: 'dare', category: 'spicy', text: 'Give your best flirty one-liner to a player of your choice.' },
  { id: 'd_spicy_2', type: 'dare', category: 'spicy', text: 'Let the room describe your "type" and read it back, straight-faced.' },
  { id: 'd_spicy_3', type: 'dare', category: 'spicy', text: 'Do your most dramatic slow-motion "entrance" like you just walked into a movie scene.' },
  { id: 'd_spicy_4', type: 'dare', category: 'spicy', text: 'Hold eye contact with the player across from you for 15 seconds, no laughing.' },
  { id: 'd_spicy_5', type: 'dare', category: 'spicy', text: 'Deliver a cheesy pick-up line in your most serious voice.' },
  { id: 'd_spicy_6', type: 'dare', category: 'spicy', text: 'Whisper one compliment to the player next to you — they can share it or not.' },
];

export const DEFAULT_TRUTH_OR_DARE_SETTINGS: TruthOrDareSettings = {
  categories: ['confessions', 'silly', 'deep', 'hot_takes', 'knowledge', 'money_career'],
  spicyEnabled: false,
  selectionModes: ['wheel', 'card'],
};

/**
 * Draws a random unused prompt for this turn.
 *
 * Recycles the whole pool once it runs dry rather than stalling the round —
 * a match easily outlasts a curated deck, and "no prompts left" is a worse
 * party experience than an occasional repeat.
 */
export function pickTruthOrDarePrompt(
  type: 'truth' | 'dare',
  categories: TruthOrDareCategoryId[],
  spicyEnabled: boolean,
  usedIds: string[]
): TruthOrDarePrompt | null {
  const allowedCategories = categories.filter((c) => spicyEnabled || c !== 'spicy');
  const matching = TRUTH_OR_DARE_PROMPTS.filter(
    (p) => p.type === type && allowedCategories.includes(p.category)
  );
  if (matching.length === 0) return null;

  const fresh = matching.filter((p) => !usedIds.includes(p.id));
  const pool = fresh.length > 0 ? fresh : matching;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Whether a category only shows up once the host has switched spice on. */
export function isSpicyCategory(category: TruthOrDareCategoryId): boolean {
  return TRUTH_OR_DARE_CATEGORIES.find((c) => c.id === category)?.spicy ?? false;
}

export const TRUTH_OR_DARE_SELECTION_LABELS: Record<TruthOrDareSelectionMode, { label: string; emoji: string; blurb: string }> = {
  wheel: { label: 'Spin the Wheel', emoji: '🎡', blurb: 'Like spinning a bottle — lands on a random player to challenge.' },
  card: { label: 'Card Flip', emoji: '🃏', blurb: 'Turn order — each player flips their own card when it comes to them.' },
};
