export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

/**
 * How hard the computer plays.
 *
 * Kept per-seat rather than per-match so a room can put one gentle bot in for a
 * child and one ruthless one in for the person who keeps winning.
 */
export type LudoBotSkill = 'easy' | 'normal' | 'hard';

export interface LudoToken {
  id: number; // 0, 1, 2, 3
  color: LudoColor;
  /**
   * -1: in yard base
   * 0..51: on standard common track
   * 100..105: inside colored home column (105 is exact home entrance)
   * 999: finished in home triangle
   */
  position: number;
}

export interface LudoPlayer {
  playerId: string;
  name: string;
  avatar?: string;
  color: LudoColor;
  isAi?: boolean;
  /** Only meaningful when isAi. */
  botSkill?: LudoBotSkill;
}

/** What the host chose in the lobby before the match was created. */
export interface LudoSetup {
  /** 2, 3 or 4 seats. */
  seatCount: number;
  /**
   * Per seat, in seating order: whether that chair is meant for a person or the
   * computer. A 'human' seat with nobody left to fill it becomes a bot at
   * start — that is the whole point of the mixed lineup.
   */
  seatKinds: ('human' | 'ai')[];
  botSkill: LudoBotSkill;
}

export interface LudoRoomState {
  players: LudoPlayer[];
  /**
   * The colours actually in play, in turn order.
   *
   * Turn rotation walks this array. It used to be a hardcoded `(i + 1) % 4`,
   * which only worked because every match was forced to four seats — with two
   * or three players that steps onto a colour nobody owns and the game stops.
   */
  seatOrder: LudoColor[];
  activeColor: LudoColor;
  diceValue: number | null;
  hasRolled: boolean;
  /**
   * Consecutive sixes by the player currently rolling.
   *
   * Reset whenever the turn changes hands. A single shared counter — which is
   * what this used to be — carried one player's sixes over to the next player,
   * so somebody else forfeited the turn.
   */
  consecutiveSixes: number;
  tokens: Record<LudoColor, LudoToken[]>;
  winner: LudoColor | null;
  /** Finishing order, first place first. Everyone who gets all four home. */
  rankings: LudoColor[];
  lastActionText?: string;
  /**
   * Incremented on every state-changing Ludo action.
   *
   * Bot turns are kicked off by the browsers watching the game, and every
   * browser sees the same bot turn at the same moment. The sequence number is
   * what makes those duplicate kicks harmless: a bot step names the turn it
   * meant to play, and the server refuses it if the game has already moved on.
   */
  turnSeq: number;
  /** Set once no seat is still playing, so the UI can offer a rematch. */
  gameOver?: boolean;
  setup?: LudoSetup;
}
