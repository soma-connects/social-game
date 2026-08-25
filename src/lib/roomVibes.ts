import type { AiHostPrompt } from './aiGameMaster';
import type { MiniGameId } from './types';

export type RoomVibeId = 'classic_party' | 'getting_to_know' | 'bros_hangout' | 'anime_squad' | 'flirty_wild';

export type RoomVibePreset = {
  id: RoomVibeId;
  label: string;
  emoji: string;
  /** Lobby card copy. */
  blurb: string;
  /** Spliced into the AI Master's system prompt to steer its tone. */
  hostPersona: string;
  /** Biases which curated prompt category / Gemini prompt style gets served. */
  preferredCategories: AiHostPrompt['category'][];
  /** Biases mini-game rotation toward what fits this room's mood. */
  preferredGames: MiniGameId[];
  /** 'grok' resolves to Gemini today — see resolveProvider() in ai-master/route.ts. */
  provider: 'gemini' | 'grok';
  /** Only true for flirty_wild — drives the lobby "coming soon" badge. */
  comingSoon?: boolean;
};

export const DEFAULT_ROOM_VIBE: RoomVibeId = 'classic_party';

export const ROOM_VIBES: Record<RoomVibeId, RoomVibePreset> = {
  classic_party: {
    id: 'classic_party',
    label: 'Classic Party',
    emoji: '🎉',
    blurb: 'The default mixed-crowd host — energetic, silly, for any group.',
    hostPersona:
      'Keep your usual high-energy, silly, crowd-pleasing party host tone. No particular theme — just keep everyone laughing.',
    preferredCategories: [],
    preferredGames: [],
    provider: 'gemini',
  },
  getting_to_know: {
    id: 'getting_to_know',
    label: 'Getting to Know You',
    emoji: '💛',
    blurb: 'Two friends easing into conversation and building a connection.',
    hostPersona:
      'This room is just two people getting to know each other — be warm, a little playful, and curious rather than chaotic. Favor gentle, personal icebreakers over roasting. Give them room to actually talk.',
    preferredCategories: ['icebreaker', 'truth_bluff'],
    preferredGames: ['truth_or_bluff', 'story_builder'],
    provider: 'gemini',
  },
  bros_hangout: {
    id: 'bros_hangout',
    label: 'Bros Hangout',
    emoji: '🍻',
    blurb: 'A few guys cruising — banter, debate, and light roasting.',
    hostPersona:
      'This room is a group of guys hanging out. Bring competitive banter, confident trash talk, and silly debates. Keep it punchy and fun — hype rivalries between them.',
    preferredCategories: ['debate', 'dare'],
    preferredGames: ['debate', 'asteroid_defense', 'trivia_showdown'],
    provider: 'gemini',
  },
  anime_squad: {
    id: 'anime_squad',
    label: 'Anime Squad',
    emoji: '🍥',
    blurb: 'A fandom crew — trivia, hot takes, and who really knows their anime.',
    hostPersona:
      'This room is a group of anime fans. Lean into fandom energy — trivia-style challenges, "who actually watched it" callouts, and playful hot-take debates. Reference anime/otaku culture naturally when it fits, without forcing it.',
    preferredCategories: ['personality', 'debate'],
    preferredGames: ['trivia_showdown', 'debate'],
    provider: 'gemini',
  },
  flirty_wild: {
    id: 'flirty_wild',
    label: 'Flirty & Wild',
    emoji: '🔥',
    blurb: 'Raw, spicy, no filter — for consenting adults who want it wild.',
    hostPersona:
      'This room wants a raw, flirty, no-filter vibe between consenting adults. Be bold, teasing, and spicy — but never explicit, never demeaning, and always keep it a game rather than anything uncomfortable.',
    preferredCategories: ['truth_bluff', 'debate'],
    preferredGames: ['truth_or_bluff', 'debate'],
    provider: 'grok',
    comingSoon: true,
  },
};
