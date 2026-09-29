import type { RoomVibeId } from './roomVibes';
import type { AiMasterCategory } from './types';

/**
 * What kinds of thing the AI Master asks, by the kind of room it is hosting.
 *
 * It used to draw from five fixed categories - truth, dare, bluff, trivia,
 * story - whatever the room, so a group of friends who had picked "Bros
 * Hangout" got the same story prompts as two people getting to know each other.
 * Each vibe now has its own menu: bro-code dilemmas for the bros, questions that
 * get two people talking about each other for the getting-to-know room, anime
 * tier lists for the fandom, a roast battle for the room that asked for one.
 *
 * `brief` is what the model is told to write. `fallbacks` are what is used when
 * the model is unreachable, so an offline round still fits the room; `{name}` is
 * the player on the spot and `{other}` is someone else in the room.
 */

export type ChallengeStyle = {
  id: string;
  /** The chip shown on the round. */
  label: string;
  brief: string;
  /** Which of the older categories this most resembles, for the round's record. */
  category: AiMasterCategory;
  fallbacks: string[];
};

const CLASSIC: ChallengeStyle[] = [
  {
    id: 'hot_take',
    label: '🔥 HOT TAKE',
    category: 'dare',
    brief:
      'a spicy, slightly unreasonable hot take about everyday life, food, dating or Nigerian culture that they must defend out loud for twenty seconds',
    fallbacks: [
      '{name}, defend this: jollof is overrated. Twenty seconds, and the room is watching.',
      '{name}, hot take: the group chat admin is the most powerful person in any friendship. Agree or disagree, and prove it.',
    ],
  },
  {
    id: 'would_you_rather',
    label: '🤔 WOULD YOU RATHER',
    category: 'truth',
    brief: 'an outrageous, funny would-you-rather with two bad but different options; they must pick one and justify it',
    fallbacks: [
      '{name}: would you rather lose your phone for a month or never eat rice again? Pick one and justify it.',
      '{name}: would you rather always be ten minutes late or ten minutes early to everything? Defend your choice.',
    ],
  },
  {
    id: 'confession',
    label: '🫢 CONFESS',
    category: 'truth',
    brief: 'a mildly embarrassing "have you ever" question they must answer honestly, with one real detail',
    fallbacks: [
      '{name}, have you ever pretended not to see a call from someone in this room? Tell the story.',
      '{name}, what is the most embarrassing thing in your phone gallery? Describe it without showing it.',
    ],
  },
  {
    id: 'impression',
    label: '🎭 IMPRESSION',
    category: 'dare',
    brief:
      'a specific character or voice they must perform out loud, such as an aunty at a wedding, a football commentator, a news anchor or an airline announcement',
    fallbacks: [
      '{name}, be a danfo conductor announcing the next stop, fully in character.',
      '{name}, give us a football commentator narrating you looking for your keys.',
    ],
  },
  {
    id: 'about_someone',
    label: '👀 ABOUT SOMEONE',
    category: 'truth',
    brief:
      'a question about ANOTHER named player in the room, such as their most annoying habit or what they would do in a situation, that the player must answer while that person listens',
    fallbacks: [
      "{name}, what is {other}'s most annoying habit? Be honest, they are listening.",
      '{name}, describe {other} in exactly three words.',
    ],
  },
  {
    id: 'speed_list',
    label: '⚡ SPEED ROUND',
    category: 'dare',
    brief: 'a funny category where they must name five things in ten seconds',
    fallbacks: [
      '{name}, name five things in a Nigerian kitchen that are not food. Ten seconds.',
      '{name}, five excuses for being late. Go.',
    ],
  },
  {
    id: 'story_start',
    label: '📖 STORY',
    category: 'story',
    brief: 'a wild first line of a story they must continue for about twenty seconds, ending on a cliffhanger',
    fallbacks: [
      "{name}, continue this: 'The day the generator came back on, everybody in the building froze because...'",
      "{name}, continue this: 'Nobody at the wedding knew the DJ was actually...'",
    ],
  },
];

const GETTING_TO_KNOW: ChallengeStyle[] = [
  {
    id: 'guess_about_them',
    label: '💬 GUESS ABOUT THEM',
    category: 'truth',
    brief:
      'a question asking the player to guess something about ANOTHER named player in the room (a habit, a dream, a fear, a talent), which that person can then confirm or correct out loud',
    fallbacks: [
      '{name}, guess what {other} does first thing when they wake up. {other}, no cheating.',
      '{name}, what do you think {other} is secretly really good at?',
    ],
  },
  {
    id: 'this_or_that',
    label: '⚖️ THIS OR THAT',
    category: 'truth',
    brief: 'a fun this-or-that about tastes and habits (morning or night, call or text, beach or city) they answer with a reason',
    fallbacks: [
      '{name}: morning person or night person? Give us proof, not just a vibe.',
      '{name}: call or text, and what does that say about you?',
    ],
  },
  {
    id: 'first_times',
    label: '🕰 FIRST TIMES',
    category: 'truth',
    brief: 'a question about a first (first job, first crush, first phone, first thing they ever bought) that invites a short story',
    fallbacks: [
      '{name}, tell us about your first crush. Names optional, details not.',
      '{name}, what was the first thing you ever bought with your own money?',
    ],
  },
  {
    id: 'green_flags',
    label: '💚 GREEN FLAGS',
    category: 'truth',
    brief: 'what they treat as a green flag or a red flag in friendships or dating, with one real example',
    fallbacks: [
      '{name}, what is your biggest green flag in a friend? Give an example.',
      '{name}, what is a tiny red flag you never let slide?',
    ],
  },
  {
    id: 'dream',
    label: '🌍 DREAM',
    category: 'truth',
    brief: 'a big-picture question: a dream trip, a day with no responsibilities, what they would do with a million naira',
    fallbacks: [
      '{name}, you have one free week and a full budget. Where do you go, and who do you take?',
      '{name}, what would a perfect ordinary Tuesday look like for you?',
    ],
  },
  {
    id: 'compliment',
    label: '🎁 COMPLIMENT',
    category: 'truth',
    brief: 'give ANOTHER named player a specific, sincere compliment about something they have actually noticed',
    fallbacks: [
      '{name}, tell {other} one thing you genuinely like about them that you have never said.',
      '{name}, what is the first thing you noticed about {other}?',
    ],
  },
];

const BROS: ChallengeStyle[] = [
  {
    id: 'bro_code',
    label: '🤝 BRO CODE',
    category: 'truth',
    brief:
      'a bro-code dilemma (a friend\'s ex, borrowing money, a friend\'s sibling, who pays) that they must give a ruling on and defend',
    fallbacks: [
      "{name}, bro code court: your boy's ex texts you 'hey'. Do you tell him? Give the ruling.",
      '{name}: a friend wore the same outfit as you to the party. Who has to change? Rule on it.',
    ],
  },
  {
    id: 'rank_it',
    label: '📊 RANK IT',
    category: 'dare',
    brief: 'rank three things in a debatable category, with a reason for each place',
    fallbacks: [
      '{name}, rank jollof, fried rice and pounded yam. No ties.',
      '{name}, rank the three worst things about traffic. Reasons required.',
    ],
  },
  {
    id: 'settle_it',
    label: '⚔️ SETTLE IT',
    category: 'dare',
    brief: 'settle a classic pointless debate (football GOAT, the best network, who cooks better) in thirty seconds',
    fallbacks: [
      '{name}, settle it: who is the greatest footballer of all time? Thirty seconds, no fence-sitting.',
      '{name}, settle it: is a hot dog a sandwich?',
    ],
  },
  {
    id: 'trash_talk',
    label: '😤 TRASH TALK',
    category: 'dare',
    brief: 'friendly trash talk aimed at ANOTHER named player about something they are known for being bad at',
    fallbacks: [
      "{name}, trash-talk {other}'s dance moves. Keep it friendly. Ish.",
      '{name}, tell us why {other} would lose an argument with a wall.',
    ],
  },
  {
    id: 'hypothetical',
    label: '💡 WHAT WOULD YOU DO',
    category: 'truth',
    brief: 'an absurd hypothetical (you find five million naira in a taxi, your ex is your new boss) they must answer as if it were real',
    fallbacks: [
      '{name}, you find five million naira in a taxi. Walk us through your next ten minutes.',
      '{name}, your worst enemy is stuck outside in the rain. Do you open the door?',
    ],
  },
  {
    id: 'confession',
    label: '🍻 CONFESS',
    category: 'truth',
    brief: 'a confession about something dumb they did to impress someone, with the details',
    fallbacks: [
      '{name}, what is the dumbest thing you have done to impress somebody?',
      '{name}, what lie have you told so many times it became true?',
    ],
  },
];

const ANIME: ChallengeStyle[] = [
  {
    id: 'who_wins',
    label: '⚔️ WHO WINS?',
    category: 'dare',
    brief: 'a matchup between two well-known anime characters; they pick a winner and justify it',
    fallbacks: [
      '{name}, Goku against Saitama: who wins, and why? Defend it.',
      '{name}, Luffy against Naruto in a straight race. Who wins and why?',
    ],
  },
  {
    id: 'tier_list',
    label: '📈 TIER LIST',
    category: 'dare',
    brief: 'rank a set of anime things (openings, arcs, protagonists, sidekicks) into S, A and B tiers, with reasons',
    fallbacks: [
      '{name}, put three anime openings in S, A and B tiers and defend each.',
      '{name}, rank your top three anime sidekicks. The room will judge you.',
    ],
  },
  {
    id: 'anime_trivia',
    label: '🧠 ANIME TRIVIA',
    category: 'trivia',
    brief: 'a single anime trivia question with a definite, short answer',
    fallbacks: [
      '{name}, in Naruto, what is the name of the village Naruto comes from?',
      '{name}, what is the name of the notebook in Death Note?',
    ],
  },
  {
    id: 'catchphrase',
    label: '🗣 CATCHPHRASE',
    category: 'dare',
    brief: "perform a famous character's catchphrase with full energy, then say why it hits",
    fallbacks: [
      "{name}, do your best famous anime catchphrase with full energy, then tell us why it hits.",
      '{name}, do an anime villain monologue about losing your slippers.',
    ],
  },
  {
    id: 'isekai_pitch',
    label: '🌀 ISEKAI PITCH',
    category: 'story',
    brief: "pitch a ridiculous isekai premise in fifteen seconds, starting 'I was reborn as...'",
    fallbacks: [
      "{name}, pitch us an isekai in fifteen seconds. It starts: 'I was reborn as...'",
      '{name}, pitch an isekai where the hero is reborn as a vending machine.',
    ],
  },
  {
    id: 'otaku_hot_take',
    label: '🔥 OTAKU HOT TAKE',
    category: 'dare',
    brief: 'an unpopular anime opinion they must defend to a room of fans',
    fallbacks: [
      '{name}, give us your most unpopular anime opinion, and defend it to this room.',
      '{name}, which hyped anime is overrated? You have twenty seconds and no backup.',
    ],
  },
];

const ROAST: ChallengeStyle[] = [
  {
    id: 'roast_battle',
    label: '🔥 ROAST BATTLE',
    category: 'dare',
    brief:
      'roast ANOTHER named player in two sentences: specific, savage and funny, about their choices and habits and never about who they are',
    fallbacks: [
      '{name}, roast {other} in two sentences. Specific, savage, and about their choices.',
      '{name}, tell us what {other} would put on their gravestone.',
    ],
  },
  {
    id: 'defend',
    label: '🛡 DEFEND THE INDEFENSIBLE',
    category: 'dare',
    brief: "defend something obviously terrible with a completely straight face (replying 'k', double-texting, eating jollof with a spoon)",
    fallbacks: [
      "{name}, defend replying 'k' to a long message, with a straight face.",
      '{name}, defend leaving people on read. You may not smile.',
    ],
  },
  {
    id: 'self_roast',
    label: '🪞 ROAST YOURSELF',
    category: 'dare',
    brief: 'roast themselves in two sentences, and the worse it is the better',
    fallbacks: [
      '{name}, roast yourself in two sentences. Make us wince.',
      '{name}, write your own worst review, out loud.',
    ],
  },
  {
    id: 'worst_take',
    label: '💩 WORST TAKE',
    category: 'dare',
    brief: 'the worst opinion they can think of on a normal topic, delivered with total commitment',
    fallbacks: [
      '{name}, give us the worst opinion you can think of about pizza, and commit.',
      '{name}, argue that Mondays are the best day of the week. No laughing.',
    ],
  },
  {
    id: 'backhanded',
    label: '🎭 BACKHANDED COMPLIMENT',
    category: 'dare',
    brief: 'a backhanded compliment for ANOTHER named player: it sounds like praise and lands like a slap',
    fallbacks: [
      "{name}, give {other} a backhanded compliment. It should sound nice for exactly one second.",
      '{name}, tell {other} something they are surprisingly okay at.',
    ],
  },
  {
    id: 'cv_of_shame',
    label: '📣 CV OF SHAME',
    category: 'story',
    brief: 'read out their own fake CV made up only of embarrassing achievements',
    fallbacks: [
      '{name}, read us your CV of shame: three embarrassing achievements, with dates.',
      '{name}, what is on your resume under Special Skills that you should not admit to?',
    ],
  },
];

const FLIRTY: ChallengeStyle[] = [
  {
    id: 'first_impression',
    label: '👀 FIRST IMPRESSION',
    category: 'truth',
    brief: 'what their honest first impression of ANOTHER named player was, and whether it turned out to be right (playful, never cruel)',
    fallbacks: [
      '{name}, what was your first impression of {other}, and were you right?',
      '{name}, what did you think {other} was like before you met them?',
    ],
  },
  {
    id: 'guilty_pleasure',
    label: '🙈 GUILTY PLEASURE',
    category: 'truth',
    brief: 'a guilty pleasure they are slightly embarrassed to admit, told with a straight face',
    fallbacks: [
      '{name}, what is your guiltiest pleasure? No lies, the room can tell.',
      '{name}, what song do you secretly know every word to?',
    ],
  },
  {
    id: 'rate_the_vibe',
    label: '🔥 RATE THE VIBE',
    category: 'dare',
    brief: 'rate and explain a light, cheeky question about romance or attraction (a first date idea, a pickup line, a dealbreaker)',
    fallbacks: [
      '{name}, give us your worst-ever pickup line and rate it out of ten.',
      '{name}, what is your ideal first date, and what is the dealbreaker?',
    ],
  },
];

export const CHALLENGE_STYLES: Record<RoomVibeId, ChallengeStyle[]> = {
  classic_party: CLASSIC,
  getting_to_know: GETTING_TO_KNOW,
  bros_hangout: BROS,
  anime_squad: ANIME,
  roast_room: ROAST,
  flirty_wild: FLIRTY,
};

/**
 * Picks the style for a round: from this vibe's menu, and never the one just used.
 * `random` is a parameter so the choice can be tested.
 */
export function pickChallengeStyle(
  vibe: RoomVibeId,
  previousId?: string | null,
  random: () => number = Math.random
): ChallengeStyle {
  const menu = CHALLENGE_STYLES[vibe] ?? CHALLENGE_STYLES.classic_party;
  const fresh = menu.filter((style) => style.id !== previousId);
  const pool = fresh.length > 0 ? fresh : menu;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** Fills a style's fallback with the player on the spot and somebody else. */
export function fallbackFor(style: ChallengeStyle, name: string, others: string[], random: () => number = Math.random): string {
  const line = style.fallbacks[Math.min(style.fallbacks.length - 1, Math.floor(random() * style.fallbacks.length))];
  const other = others.length > 0 ? others[Math.min(others.length - 1, Math.floor(random() * others.length))] : 'somebody here';
  return line.replace(/\{name\}/g, name).replace(/\{other\}/g, other);
}

/**
 * A repeatable stream of random numbers from a seed.
 *
 * A request the room API has to replay must make the same choices the second
 * time, or the AI answer remembered for it (see hostMemo) is for a different
 * question and the replay pays for another call. Seeded by room and round, the
 * target and the style come out the same however many times the round is tried.
 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
