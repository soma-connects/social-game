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
}
