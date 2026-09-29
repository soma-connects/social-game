import { SocialReactionId } from './types';

/**
 * The emoji the room can throw, and which of them still count for points.
 *
 * Two jobs in one list, deliberately. The stream shows every tap — that is what
 * makes it feel live — but only the four that map onto a SocialReactionId reach
 * the performer's score, and those keep the old one-per-player-per-kind rule.
 * Without that split, holding a finger on 😂 would run the laugh meter to full
 * on its own and the badge that reads the reaction mix would become noise.
 *
 * A fixed list rather than free-form emoji: the server has to be able to say no
 * to anything else, and a palette of ten is more inviting on a phone than a
 * keyboard picker anyway.
 */
export type ChatEmoji = {
  glyph: string;
  label: string;
  /** Present only on the four that feed the performer's social bonus. */
  scoresAs?: SocialReactionId;
};

export const CHAT_EMOJI: ChatEmoji[] = [
  { glyph: '😂', label: 'Laugh', scoresAs: 'laugh' },
  { glyph: '🔥', label: 'Fire', scoresAs: 'fire' },
  { glyph: '😮', label: 'Almost', scoresAs: 'almost' },
  { glyph: '🎭', label: 'Drama', scoresAs: 'drama' },
  { glyph: '💐', label: 'Flowers' },
  { glyph: '👏', label: 'Clap' },
  { glyph: '❤️', label: 'Love' },
  { glyph: '💀', label: 'Dead' },
  { glyph: '🙌', label: 'Hands up' },
  { glyph: '🤔', label: 'Hmm' },
];

const BY_GLYPH = new Map(CHAT_EMOJI.map((e) => [e.glyph, e]));

/** Null for anything not in the palette, which is how the server rejects it. */
export function findChatEmoji(glyph: string): ChatEmoji | null {
  return BY_GLYPH.get(glyph) ?? null;
}

/**
 * The glyph that carries a given scoring reaction.
 *
 * Anywhere that still offers the four named reactions as their own buttons has
 * to send the palette's glyph for them, not whichever emoji happened to be on
 * the button — the server scores by glyph, and 👏 is a cheer in this palette,
 * not an "almost".
 */
export function glyphForReaction(id: SocialReactionId): string {
  return CHAT_EMOJI.find((e) => e.scoresAs === id)?.glyph ?? '👏';
}

/** Longest comment the room will carry. Long enough to be funny, short enough to read. */
export const MAX_COMMENT_CHARS = 140;

/**
 * How many of each kind survive a trim.
 *
 * Counted per kind rather than over one shared total, because a live stream
 * gets far more emoji than comments — one shared cap and a burst of 😂 would
 * push every comment out of the feed within seconds.
 */
export const CHAT_TEXT_KEPT = 30;
export const CHAT_EMOJI_KEPT = 24;

/** How long a floating emoji is airborne, and how long a client will start one. */
export const EMOJI_FLIGHT_MS = 3_600;
