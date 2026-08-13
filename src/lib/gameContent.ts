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
export const LANGUAGE_DECKS: Record<string, ChallengeWord[]> = {
  english: [
    { id: 'e1', word: 'She sells seashells by the seashore', phonetic: 'SH IY S EH L Z S IY SH EH L Z', translation: 'Say it fast without stumbling!', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 'e2', word: 'How much wood would a woodchuck chuck', phonetic: 'H AW M AH CH W UH D W UH D', translation: 'Say it fast without stumbling!', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 'e3', word: 'Peter Piper picked a peck of pickled peppers', phonetic: 'P IY T ER P AY P ER P IH K T', translation: 'Say it fast without stumbling!', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 'e4', word: 'I saw a kitten eating chicken in the kitchen', phonetic: 'AY S AO AH K IH T AH N IY T IH NG', translation: 'Say it fast without stumbling!', language: 'english', type: 'language', difficulty: 'hard' },
  ],
  spelling_bee: [
    { id: 's1', word: 'ACCOMMODATE', phonetic: 'A C C O M M O D A T E', translation: 'To provide lodging or sufficient space for', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 's2', word: 'EMBARRASS', phonetic: 'E M B A R R A S S', translation: 'To cause someone to feel awkward or ashamed', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 's3', word: 'FLUORESCENT', phonetic: 'F L U O R E S C E N T', translation: 'Vividly colorful', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 's4', word: 'QUESTIONNAIRE', phonetic: 'Q U E S T I O N N A I R E', translation: 'A set of printed or written questions with a choice of answers', language: 'english', type: 'language', difficulty: 'hard' },
    { id: 's5', word: 'RHYTHM', phonetic: 'R H Y T H M', translation: 'A strong, regular, repeated pattern of movement or sound', language: 'english', type: 'language', difficulty: 'medium' },
  ],
};

export function getRandomMathProblem(): ChallengeWord {
  const num1 = Math.floor(Math.random() * 50) + 10;
  const num2 = Math.floor(Math.random() * 40) + 5;
  const isPlus = Math.random() > 0.5;
  const ans = isPlus ? num1 + num2 : num1 - num2;
  const expr = isPlus ? `${num1} + ${num2}` : `${num1} - ${num2}`;

  return {
    id: `math_${Date.now()}`,
    word: `${expr} = ${ans}`,
    phonetic: `Calculate ${expr}`,
    translation: `Say the answer clearly: ${ans}`,
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
