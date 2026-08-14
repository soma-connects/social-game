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
}
