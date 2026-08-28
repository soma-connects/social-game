export type ChessGameMode = '1v1' | '2v2' | 'vs_ai';

export type ChessTimeControl = 'bullet_1m' | 'blitz_3m' | 'blitz_5m' | 'rapid_10m' | 'casual';

export type ChessPieceColor = 'w' | 'b';

export type BotDifficulty = 'cadet' | 'navigator' | 'commander' | 'overlord';

export interface ChessPlayerSlot {
  playerId: string;
  name: string;
  avatar?: string;
  color: ChessPieceColor;
  teamSlot?: 1 | 2; // For 2v2: player 1 or player 2 of that color
  isAi?: boolean;
  /** Only meaningful when isAi. */
  botSkill?: BotDifficulty;
}

/** What the host chose in the lobby before the match was created. */
export interface ChessSetup {
  mode: ChessGameMode;
  timeControl: ChessTimeControl;
  botDifficulty: BotDifficulty;
  /**
   * The colour the room's players take. The computer fills whatever is left,
   * which is what makes a one-person or three-person room playable at all.
   */
  humanColor: ChessPieceColor;
}

export interface ChessMoveProposal {
  proposerId: string;
  proposerName: string;
  from: string;
  to: string;
  promotion?: string;
  san?: string;
  timestamp: number;
}

export interface ChessClockState {
  whiteTimeMs: number;
  blackTimeMs: number;
  incrementMs: number;
  lastTickTimestamp: number;
  activeColor: ChessPieceColor;
  isRunning: boolean;
}

export interface ChessRoomState {
  mode: ChessGameMode;
  timeControl: ChessTimeControl;
  fen: string;
  pgn: string;
  history: string[]; // List of SAN moves
  turn: ChessPieceColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
  winner?: ChessPieceColor | 'draw';
  winReason?: string;
  
  whitePlayers: ChessPlayerSlot[];
  blackPlayers: ChessPlayerSlot[];
  spectators: string[]; // Player IDs
  
  clocks: ChessClockState;
  
  // 2v2 Team consultation proposals
  proposals: {
    w?: ChessMoveProposal | null;
    b?: ChessMoveProposal | null;
  };
  
  botDifficulty?: BotDifficulty;
  lastMove?: { from: string; to: string; san: string } | null;
  setup?: ChessSetup;
  /**
   * How many rematches this line-up has played.
   *
   * Colours swap each time, so it also says who is White right now without
   * having to diff the slots against the original setup.
   */
  gameNumber?: number;
}
