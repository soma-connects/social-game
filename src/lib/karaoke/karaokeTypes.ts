export type KaraokeStagePhase =
  /** The setlist is up, waiting for the next singer to take the mic. */
  | 'on_deck'
  /** Somebody is singing right now. */
  | 'performing'
  /** Their score is up and the room is reacting. */
  | 'applause'
  /** Every singer has been through every song. */
  | 'finished';

export type KaraokePerformance = {
  playerId: string;
  playerName: string;
  avatar?: string;
  songId: string;
  songTitle: string;
  /** 0..1 mean note accuracy. */
  accuracy: number;
  notesHit: number;
  notesTotal: number;
  bestStreak: number;
  /** Points from singing, before the crowd bonus. */
  points: number;
  /** Points the room added by reacting. */
  crowdBonus: number;
  grade: string;
  verdict: string;
  at: number;
};

export type KaraokeSetup = {
  /** Song ids, in the order the room will work through them. */
  setlist: string[];
  /**
   * Whether the room sings the whole setlist each, or one song each per round.
   *
   * 'rotate' is the party answer — everyone sings song one, then everyone
   * sings song two — because it means nobody waits through four songs before
   * their first turn.
   */
  order: 'rotate' | 'block';
};

export type KaraokeState = {
  setup: KaraokeSetup;
  phase: KaraokeStagePhase;
  /** Player ids in singing order. Fixed at start so the queue is predictable. */
  singerOrder: string[];
  /** Index into singerOrder. */
  singerIndex: number;
  /** Index into setup.setlist. */
  songIndex: number;
  /** Running totals per player id. */
  scores: Record<string, number>;
  /** Every performance so far, newest last. */
  performances: KaraokePerformance[];
  /** The one on screen during 'applause'. */
  lastPerformance: KaraokePerformance | null;
  /**
   * Epoch ms the current singer's turn began.
   *
   * Used only to move a room on past somebody who walked away mid-setlist —
   * the score itself is submitted by the singer's own browser.
   */
  startedAt: number | null;
  /** Bumped on every state change, so duplicate submissions can be dropped. */
  turnSeq: number;
};
