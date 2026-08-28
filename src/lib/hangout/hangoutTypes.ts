import type { SocialReactionId } from '../types';

export type HangoutDeckId = 'hot_take' | 'confession' | 'would_you_rather' | 'dare' | 'host';

export type HangoutCard = {
  id: string;
  deck: HangoutDeckId;
  text: string;
  drawnBy: string;
  drawnByName: string;
  at: number;
};

/** One soundboard hit, replayed on every device in the room. */
export type HangoutSound = {
  padId: string;
  by: string;
  byName: string;
  at: number;
};

export type HangoutReaction = {
  id: string;
  reaction: SocialReactionId;
  by: string;
  byName: string;
  /** Who it was aimed at — whoever held the mic when it was sent. */
  targetId: string | null;
  at: number;
};

export type HangoutState = {
  /**
   * Who has the floor, or null when nobody does.
   *
   * The lounge works perfectly well with the floor open — that is just people
   * talking — so the spotlight is opt-in rather than a turn everybody has to
   * take. It exists for the moment six people talk over each other.
   */
  spotlightId: string | null;
  spotlightName: string | null;
  /** Epoch ms the current spotlight runs out. */
  spotlightEndsAt: number | null;
  /** Length of a turn on the mic, in seconds. */
  spotlightSeconds: number;
  /** The card on the table. */
  card: HangoutCard | null;
  /**
   * Room-wide vibe, built from reactions.
   *
   * Deliberately shared rather than per-player. The lounge is the one mode
   * with no winner, and giving it a scoreboard would quietly turn it back into
   * a competition — which is the thing people came here to stop doing.
   */
  vibe: number;
  lastSound: HangoutSound | null;
  /** Newest last, trimmed hard — these are for animating, not for history. */
  reactions: HangoutReaction[];
  /** Who has held the mic since the last lap, so "next up" is fair. */
  spotlightHistory: string[];
  /** Bumped on every change, so clients can spot what is new. */
  seq: number;
};
