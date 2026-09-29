export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

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
}

export interface LudoRoomState {
  players: LudoPlayer[];
  activeColor: LudoColor;
  diceValue: number | null;
  hasRolled: boolean;
  consecutiveSixes: number;
  tokens: Record<LudoColor, LudoToken[]>;
  winner: LudoColor | null;
  rankings: LudoColor[];
  lastActionText?: string;
  /**
   * The most recent roll, kept after the turn resolves.
   *
   * `diceValue` is cleared the moment a roll is auto-played or passed, so the
   * table never saw the number a player had just rolled — only a line of text
   * saying so. This stays put until the next roll.
   */
  lastRoll?: number | null;
  /**
   * Counts every roll, move and skipped turn.
   *
   * A bot that rolls a six moves and then rolls again from an identical-looking
   * state — same colour, nothing rolled, nothing showing — so the browser driving
   * it had no way to tell a fresh turn from the one it had just played.
   */
  seq?: number;
}
