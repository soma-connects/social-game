import { AvatarStyle, ChallengeWord, PresetTrap } from './types';

export const AVATARS: AvatarStyle[] = [
  {
    id: 'paul',
    name: 'Paul',
    emoji: '👑',
    headwear: 'Black Beanie & Gold Chain',
    outfit: 'Classic White Tee',
    color: '#FFD000',
    badge: 'Leader',
    role: '👑 LEADER',
    faceUrl: '/avatars/paul_face.jpg',
    cardUrl: '/avatars/paul.jpg',
    expression: 'normal',
    unlockLevel: 1,
  },
  {
    id: 'chibuike',
    name: 'Chibuike',
    emoji: '🛡️',
    headwear: 'Short Fade Haircut',
    outfit: 'Red & Yellow Athletic Tracksuit',
    color: '#10B981',
    badge: 'Defender',
    role: '🛡️ DEFENDER',
    faceUrl: '/avatars/chibuike_face.jpg',
    cardUrl: '/avatars/chibuike.jpg',
    expression: 'normal',
    unlockLevel: 1,
  },
  {
    id: 'victor',
    name: 'Victor',
    emoji: '🚀',
    headwear: 'Black Beanie & Blue Mask',
    outfit: 'Orange Streetwear & Bracelet',
    color: '#A855F7',
    badge: 'Speedster',
    role: '🚀 SPEEDSTER',
    faceUrl: '/avatars/victor_face.jpg',
    cardUrl: '/avatars/victor.jpg',
    expression: 'normal',
    unlockLevel: 2,
    unlockCost: 150,
  },
  {
    id: 'samuel',
    name: 'Samuel',
    emoji: '🎯',
    headwear: 'Low Cut Afro',
    outfit: 'Black Kanji Graphic Tee',
    color: '#38BDF8',
    badge: 'Strategist',
    role: '🎯 STRATEGIST',
    faceUrl: '/avatars/samuel_face.jpg',
    cardUrl: '/avatars/samuel.jpg',
    expression: 'normal',
    unlockLevel: 2,
    unlockCost: 150,
  },
  {
    id: 'michael',
    name: 'Michael',
    emoji: '⭐',
    headwear: 'Round Frame Glasses',
    outfit: 'Tailored Black Suit & Tie',
    color: '#EF4444',
    badge: 'Support',
    role: '⭐ SUPPORT',
    faceUrl: '/avatars/michael_face.jpg',
    cardUrl: '/avatars/michael.jpg',
    expression: 'normal',
    unlockLevel: 3,
    unlockCost: 250,
  },
  {
    // id stays 'friend1' so rooms created before the rename still resolve.
    id: 'friend1',
    name: 'Tunde',
    emoji: '🏃',
    headwear: 'Clean Low Cut Hair',
    outfit: 'Red & White Football Kit',
    color: '#EC4899',
    badge: 'Playmaker',
    role: '🏃 PLAYMAKER',
    faceUrl: '/avatars/friend1_face.jpg',
    cardUrl: '/avatars/friend1.jpg',
    expression: 'normal',
    unlockLevel: 3,
    unlockCost: 250,
  },
  {
    id: 'chibuzor',
    name: 'Chibuzor',
    emoji: '🎯',
    headwear: 'Trimmed Beard & Fade',
    outfit: 'White Fitted Tee & Chain',
    color: '#F59E0B',
    badge: 'Strategist',
    role: '🎯 STRATEGIST',
    faceUrl: '/avatars/chibuzor_face.jpg',
    cardUrl: '/avatars/chibuzor.jpg',
    expression: 'normal',
    unlockLevel: 4,
    unlockCost: 400,
  },
  {
    id: 'friend2',
    name: 'Emeka',
    emoji: '🛡️',
    headwear: 'Natural Afro',
    outfit: 'Red Checkered Button Shirt',
    color: '#F97316',
    badge: 'Playmaker',
    role: '🛡️ PLAYMAKER',
    faceUrl: '/avatars/friend2_face.jpg',
    cardUrl: '/avatars/friend2.jpg',
    expression: 'normal',
    unlockLevel: 4,
    unlockCost: 400,
  },
];

export const PRESET_TRAPS: PresetTrap[] = [
  { id: 't1', label: 'Amaka Disappoint', word: 'Amaka disappoint me for party', category: 'Slang' },
  { id: 't2', label: 'Jollof War', word: 'Nigerian Jollof sweet pass Ghana Jollof', category: 'Slang' },
  { id: 't3', label: 'Ekaette Tongue Twister', word: 'Ekaette chop kpomo inside pepper soup', category: 'Tongue Twister' },
  { id: 't4', label: 'Quick Math Trap', word: '47 plus 68 equals 115', category: 'Math Trap' },
  { id: 't5', label: 'Nepa Bring Light', word: 'Nepa bring light make we watch football', category: 'Slang' },
  { id: 't6', label: 'Danfo Driver', word: 'Owa o, danfo driver enter bus stop', category: 'Slang' },
];

/**
 * Only the decks the recogniser can actually score.
 *
 * Chrome has no speech models for ha-NG / ig-NG / yo-NG, so everything here is
 * transcribed as Nigerian English and fuzzy-matched. Igbo and Pidgin survive
 * that treatment well enough to be fair; Hausa and Yoruba did not, so they are
 * parked rather than shipped as rounds nobody can win. Their tone marks and
 * vowel set come back as noise through an English model.
 */
/**
 * What the Voice Arena actually asks people to say.
 *
 * Only the languages the speech engine can genuinely hear belong here. The
 * Nigerian languages were dropped deliberately — no browser recogniser
 * supports ha-NG, ig-NG or yo-NG, so a round in them could only ever be graded
 * by luck — and the four kept are the ones LOCALE_MAP can hand a real locale.
 *
 * For Japanese and Korean the prompt is in the native script, because that is
 * what the recogniser returns and therefore what the answer is matched
 * against; the romanisation goes in `phonetic`, where the arena shows it to
 * whoever is reading the screen.
 *
 * Spanish and French are written with their accents. The matcher folds those
 * away, so "rápido" and "rapido" both count — nobody should lose a party game
 * to a diacritic.
 */
export const LANGUAGE_DECKS: Record<string, ChallengeWord[]> = {
  // Tongue twisters throughout: the challenge in your own language has to be
  // the saying of it, not the knowing of it.
  english: [
    { id: 'e1', word: 'She sells seashells by the seashore', phonetic: 'shee SELLZ SEE-shellz by the SEE-shor', translation: 'Say it fast without stumbling!', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 'e2', word: 'How much wood would a woodchuck chuck', phonetic: 'how much WUUD would a WUUD-chuck chuck', translation: 'Say it fast without stumbling!', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 'e3', word: 'Peter Piper picked a peck of pickled peppers', phonetic: 'PEE-ter PY-per pikt a pek of PIK-uld PEP-erz', translation: 'Say it fast without stumbling!', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 'e4', word: 'I saw a kitten eating chicken in the kitchen', phonetic: 'eye saw a KIT-un EE-ting CHIK-un in the KITCH-un', translation: 'Say it fast without stumbling!', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 'e5', word: 'Fresh fried fish', phonetic: 'fresh fryd fish', translation: 'Short, but try saying it three times', language: 'english', type: 'language', difficulty: 'easy' },
    { id: 'e6', word: 'Red lorry yellow lorry', phonetic: 'red LOR-ee YEL-oh LOR-ee', translation: 'The classic that breaks everybody', language: 'english', type: 'language', difficulty: 'medium' },
    { id: 'e7', word: 'Unique New York', phonetic: 'yoo-NEEK noo YORK', translation: 'Three words. How hard can it be?', language: 'english', type: 'language', difficulty: 'medium' },
    { id: 'e8', word: 'Six slick slim sycamore saplings', phonetic: 'siks slik slim SIK-a-mor SAP-lingz', translation: 'Good luck with this one', language: 'english', type: 'language', difficulty: 'hard' },
  ],

  spanish: [
    { id: 'es1', word: 'Buenos días', phonetic: 'BWEH-nohs DEE-ahs', translation: 'Good morning', language: 'spanish', type: 'language', difficulty: 'easy' },
    { id: 'es2', word: 'Muchas gracias', phonetic: 'MOO-chahs GRAH-syahs', translation: 'Thank you very much', language: 'spanish', type: 'language', difficulty: 'easy' },
    { id: 'es3', word: 'Me gusta la música', phonetic: 'meh GOOS-tah lah MOO-see-kah', translation: 'I like music', language: 'spanish', type: 'language', difficulty: 'medium' },
    { id: 'es4', word: 'El perro corre rápido', phonetic: 'el PEH-rroh KOH-rreh RAH-pee-doh', translation: 'The dog runs fast', language: 'spanish', type: 'language', difficulty: 'medium' },
    { id: 'es5', word: '¿Dónde está la playa?', phonetic: 'DOHN-deh es-TAH lah PLAH-yah', translation: 'Where is the beach?', language: 'spanish', type: 'language', difficulty: 'medium' },
    { id: 'es6', word: 'Tres tristes tigres', phonetic: 'trehs TREES-tehs TEE-grehs', translation: 'Three sad tigers — the classic Spanish tongue twister', language: 'spanish', type: 'language', difficulty: 'hard' },
  ],

  french: [
    { id: 'fr1', word: 'Merci beaucoup', phonetic: 'mehr-SEE boh-KOO', translation: 'Thank you very much', language: 'french', type: 'language', difficulty: 'easy' },
    { id: 'fr2', word: 'Bonjour tout le monde', phonetic: 'bon-ZHOOR too luh MOND', translation: 'Hello everyone', language: 'french', type: 'language', difficulty: 'easy' },
    { id: 'fr3', word: 'Un chat gris', phonetic: 'uhn shah GREE', translation: 'A grey cat', language: 'french', type: 'language', difficulty: 'medium' },
    { id: 'fr4', word: 'Je voudrais un café', phonetic: 'zhuh voo-DREH uhn kah-FEH', translation: 'I would like a coffee', language: 'french', type: 'language', difficulty: 'medium' },
    { id: 'fr5', word: 'À demain, bonne nuit', phonetic: 'ah duh-MAN, bun NWEE', translation: 'See you tomorrow, good night', language: 'french', type: 'language', difficulty: 'medium' },
    { id: 'fr6', word: 'Les chaussettes de l\'archiduchesse', phonetic: 'lay shoh-SET duh lar-shee-doo-SHESS', translation: 'The archduchess\'s socks — a French tongue twister', language: 'french', type: 'language', difficulty: 'hard' },
  ],

  japanese: [
    { id: 'ja1', word: 'ありがとう', phonetic: 'a-ri-ga-tou', translation: 'Thank you', language: 'japanese', type: 'language', difficulty: 'easy' },
    { id: 'ja2', word: 'こんにちは', phonetic: 'kon-ni-chi-wa', translation: 'Hello / good afternoon', language: 'japanese', type: 'language', difficulty: 'easy' },
    { id: 'ja3', word: 'すみません', phonetic: 'su-mi-ma-sen', translation: 'Excuse me / sorry', language: 'japanese', type: 'language', difficulty: 'medium' },
    { id: 'ja4', word: 'いただきます', phonetic: 'i-ta-da-ki-ma-su', translation: 'Said before eating', language: 'japanese', type: 'language', difficulty: 'medium' },
    { id: 'ja5', word: 'おはようございます', phonetic: 'o-ha-you go-za-i-ma-su', translation: 'Good morning (polite)', language: 'japanese', type: 'language', difficulty: 'medium' },
    { id: 'ja6', word: '日本語を勉強しています', phonetic: 'ni-hon-go o ben-kyou shi-te i-ma-su', translation: 'I am studying Japanese', language: 'japanese', type: 'language', difficulty: 'hard' },
  ],

  korean: [
    { id: 'ko1', word: '안녕하세요', phonetic: 'an-nyeong-ha-se-yo', translation: 'Hello', language: 'korean', type: 'language', difficulty: 'easy' },
    { id: 'ko2', word: '감사합니다', phonetic: 'gam-sa-ham-ni-da', translation: 'Thank you', language: 'korean', type: 'language', difficulty: 'easy' },
    { id: 'ko3', word: '맛있어요', phonetic: 'ma-si-sseo-yo', translation: 'It is delicious', language: 'korean', type: 'language', difficulty: 'medium' },
    { id: 'ko4', word: '죄송합니다', phonetic: 'joe-song-ham-ni-da', translation: 'I am sorry', language: 'korean', type: 'language', difficulty: 'medium' },
    { id: 'ko5', word: '만나서 반갑습니다', phonetic: 'man-na-seo ban-gap-seum-ni-da', translation: 'Nice to meet you', language: 'korean', type: 'language', difficulty: 'medium' },
    { id: 'ko6', word: '한국어를 배우고 있어요', phonetic: 'han-gu-geo-reul bae-u-go i-sseo-yo', translation: 'I am learning Korean', language: 'korean', type: 'language', difficulty: 'hard' },
  ],

  spelling_bee: [
    { id: 's1', word: 'ACCOMMODATE', phonetic: 'A C C O M M O D A T E', translation: 'To provide lodging or sufficient space for', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 's2', word: 'EMBARRASS', phonetic: 'E M B A R R A S S', translation: 'To cause someone to feel awkward or ashamed', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 's3', word: 'FLUORESCENT', phonetic: 'F L U O R E S C E N T', translation: 'Vividly colorful', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 's4', word: 'QUESTIONNAIRE', phonetic: 'Q U E S T I O N N A I R E', translation: 'A set of printed or written questions with a choice of answers', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 's5', word: 'RHYTHM', phonetic: 'R H Y T H M', translation: 'A strong, regular, repeated pattern of movement or sound', language: 'english', type: 'language', difficulty: 'medium' },
  ],
};

/**
 * A mental-arithmetic challenge for the Voice Arena.
 *
 * The prompt is the sum and the answer is kept separate. It used to put the
 * whole equation in `word` — "37 + 12 = 49" — and the arena prints `word` on
 * screen, so the player was shown the answer and asked to read it out. The
 * `translation` line then said "Say the answer clearly: 49" underneath, in case
 * they missed it.
 *
 * Subtraction never goes negative: "say minus fourteen" is a speech-recognition
 * problem, not a maths one.
 */
export function getRandomMathProblem(): ChallengeWord {
  const isPlus = Math.random() > 0.5;
  const num1 = Math.floor(Math.random() * 50) + 10;
  let num2 = isPlus
    ? Math.floor(Math.random() * 40) + 5
    : Math.floor(Math.random() * (num1 - 1)) + 1;

  // An exact halving prints its own answer: "56 − 28" already has 28 on screen,
  // and a player who spots the pattern never has to do the sum. About one in a
  // hundred otherwise.
  if (!isPlus && num1 === num2 * 2) num2 -= 1;

  const ans = isPlus ? num1 + num2 : num1 - num2;
  const expr = `${num1} ${isPlus ? '+' : '−'} ${num2}`;

  return {
    id: `math_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    word: expr,
    answer: String(ans),
    phonetic: 'Say the answer out loud',
    language: 'math',
    type: 'math',
    difficulty: 'medium',
  };
}

export const PIDGIN_FEEDBACK = {
  success: [
    'Oya sharp guy! You get mouth!',
    'Correct accent! No wahala at all!',
    'Choi! You clear the word completely!',
    'Omo, your voice clear pass 4K TV!',
  ],
  failure: [
    'Whaala dey O! Your mouth slip!',
    'Ewo! Nepa carry your mic connection!',
    'Oya try again, accent zero!',
    'Omo, you talk pass your speed limit!',
  ],
};

export const DARE_CATEGORIES = [
  { id: 'sing', name: 'Sing It', icon: '🎵' },
  { id: 'accent', name: 'Accent Challenge', icon: '🗣️' },
  { id: 'dramatic', name: 'Dramatic Reading', icon: '🎭' },
  { id: 'whisper', name: 'Whisper Mode', icon: '🤫' },
  { id: 'twister', name: 'Tongue Twister', icon: '⚡' },
  { id: 'market', name: 'Angry Market Woman', icon: '🛒' },
  { id: 'news', name: 'News Reporter', icon: '📺' },
  { id: 'crying', name: 'Nollywood Crying Scene', icon: '😭' },
];

export const NOLLYWOOD_DARES = [
  '🎵 [SING IT]: Sing the chorus of "Calm Down" by Rema in a Hausa accent!',
  '🗣️ [ACCENT]: Pretend to be a Lagos Danfo Conductor calling passengers to Oshodi!',
  '🎭 [DRAMATIC]: Read the recipe for Jollof Rice like a villain in a Nollywood thriller!',
  '🤫 [WHISPER]: Whisper your biggest secret while holding a continuous pitch!',
  '⚡ [TONGUE TWISTER]: Say "Ekaette chop kpomo inside pepper soup" 3 times fast without stuttering!',
  '🛒 [MARKET WOMAN]: Shout at a customer in Yoruba/Pidgin for offering 200 Naira for 5kg meat!',
  '📺 [NEWS REPORTER]: Deliver breaking news that Nepa brought light in a super serious BBC accent!',
  '😭 [NOLLYWOOD CRYING]: Perform a dramatic Nollywood crying scene weeping over lost roadmap points!',
  '🎵 [SING IT]: Sing your national anthem in a robotic autotune voice!',
  '⚡ [TONGUE TWISTER]: Say "Amaka disappoint me for party" 4 times in 8 seconds!',
];

export const DARES = NOLLYWOOD_DARES;

/**
 * Duel tile topics.
 *
 * Deliberately silly and unwinnable — a duel is decided by who argues it more
 * entertainingly, and a topic anyone could actually be right about turns the
 * room's vote into a fact check instead of a performance.
 */
export const DUEL_TOPICS = [
  'Jollof rice is objectively the best rice dish on earth',
  'Socks belong on before trousers, always',
  'A hot dog is a sandwich',
  'Cereal is technically cold soup',
  'Sleeping with one leg out of the duvet is the only correct way',
  'Voice notes over three minutes should be illegal',
  'Pineapple absolutely belongs on pizza',
  'Everyone secretly rehearses arguments in the shower',
  'Cutlery in the sink is worse than cutlery on the counter',
  'The aisle seat is the superior seat',
];
