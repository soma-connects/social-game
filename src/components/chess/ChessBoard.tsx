'use client';

import React, { useMemo } from 'react';
import { Chess, Square } from 'chess.js';
import { ChessPieceColor, ChessMoveProposal } from '@/lib/chess/chessTypes';

interface ChessBoardProps {
  fen: string;
  myColor: ChessPieceColor;
  isMyTurn: boolean;
  selectedSquare: Square | null;
  validDestinations: Square[];
  proposal?: ChessMoveProposal | null;
  lastMove?: { from: string; to: string } | null;
  onSquareClick: (square: Square) => void;
  flipBoard?: boolean;
}

/**
 * Board squares.
 *
 * Cool steel rather than wood, so the board still belongs to the space theme,
 * but with a genuine light/dark split. The previous pair — slate-800/80 against
 * slate-900/90 — were within a few percent of each other in luminance, so the
 * chequer pattern was essentially invisible and pieces had no grid to sit on.
 */
const SQUARE_LIGHT = '#C6CFDD';
const SQUARE_DARK = '#4E5B71';

// Crisp Vector SVG Chess Pieces
const PIECE_SVGS: Record<string, JSX.Element> = {
  p: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-md">
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  r: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-md">
      <g fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
        <path d="M34 14l-3 3H14l-3-3" />
        <path d="M31 17v12.5H14V17" />
        <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
        <path d="M11 14h23" />
      </g>
    </svg>
  ),
  n: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-md">
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
      <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  b: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-md">
      <g fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
        <path d="M17.5 26h10M15 30h15" />
      </g>
    </svg>
  ),
  q: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-md">
      <g fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" />
        <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" />
        <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
      </g>
    </svg>
  ),
  k: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-md">
      <g fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M22.5 11.63V6M20 8h5" />
        <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
        <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-6 2-6 2s-3-2-7-2-7 2-7 2-2-3-6-2c-3 6 6 10.5 6 10.5v7z" />
        <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" />
      </g>
    </svg>
  ),
};

// White pieces have glowing cyan / white core, Black pieces have dark violet / obsidian accents
const WHITE_PIECE_SVGS: Record<string, JSX.Element> = {
  P: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]">
      <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#f8fafc" stroke="#0ea5e9" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  R: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]">
      <g fill="#f8fafc" stroke="#0ea5e9" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
        <path d="M34 14l-3 3H14l-3-3" />
        <path d="M31 17v12.5H14V17" />
        <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
        <path d="M11 14h23" />
      </g>
    </svg>
  ),
  N: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]">
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#f8fafc" stroke="#0ea5e9" strokeWidth="1.5" />
      <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#f8fafc" stroke="#0ea5e9" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  B: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]">
      <g fill="#f8fafc" stroke="#0ea5e9" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" />
        <path d="M17.5 26h10M15 30h15" />
      </g>
    </svg>
  ),
  Q: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]">
      <g fill="#f8fafc" stroke="#0ea5e9" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM33 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" />
        <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" />
        <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
      </g>
    </svg>
  ),
  K: (
    <svg viewBox="0 0 45 45" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]">
      <g fill="#f8fafc" stroke="#0ea5e9" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M22.5 11.63V6M20 8h5" />
        <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
        <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-6 2-6 2s-3-2-7-2-7 2-7 2-2-3-6-2c-3 6 6 10.5 6 10.5v7z" />
        <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" />
      </g>
    </svg>
  ),
};

export default function ChessBoard({
  fen,
  myColor,
  isMyTurn,
  selectedSquare,
  validDestinations,
  proposal,
  lastMove,
  onSquareClick,
  flipBoard = false,
}: ChessBoardProps) {
  const chess = useMemo(() => new Chess(fen), [fen]);

  const ranks = flipBoard ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipBoard ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  /**
   * The square of the king that is currently in check.
   *
   * Chess is unplayable if you cannot see that you are in check, and nothing on
   * the board said so — you had to notice it in the event feed.
   */
  const checkedKingSquare = useMemo<Square | null>(() => {
    if (!chess.inCheck()) return null;
    const side = chess.turn();
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === side) return cell.square as Square;
      }
    }
    return null;
  }, [chess]);

  return (
    <div className="relative w-full max-w-[480px] aspect-square mx-auto select-none rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.15)] bg-slate-950 p-1 sm:p-2">
      {/* 8x8 Grid */}
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-xl overflow-hidden">
        {ranks.map((rank, rIdx) =>
          files.map((file, fIdx) => {
            const sq = `${file}${rank}` as Square;
            const isLight = (rIdx + fIdx) % 2 === 0;
            const piece = chess.get(sq);

            const isSelected = selectedSquare === sq;
            const isValidDest = validDestinations.includes(sq);
            const isLastMoveSquare = lastMove?.from === sq || lastMove?.to === sq;
            const isProposalSource = proposal?.from === sq;
            const isProposalDest = proposal?.to === sq;

            const isCheckedKing = checkedKingSquare === sq;

            return (
              <div
                key={sq}
                onClick={() => onSquareClick(sq)}
                // Square colour is set inline from SQUARE_LIGHT/SQUARE_DARK.
                // The old classes were bg-slate-800/80 and bg-slate-900/90 —
                // two values so close together that the board barely read as a
                // chequerboard at all, which is the one thing a chess board has
                // to do.
                style={{ backgroundColor: isLight ? SQUARE_LIGHT : SQUARE_DARK }}
                className={`relative flex items-center justify-center cursor-pointer transition-all duration-150 ${
                  isSelected ? 'ring-2 ring-inset ring-amber-300' : ''
                } ${isProposalSource ? 'ring-2 ring-inset ring-purple-400' : ''} ${
                  isProposalDest ? 'ring-2 ring-inset ring-emerald-400 animate-pulse' : ''
                }`}
              >
                {/* Tints layered over the square rather than replacing its
                    colour, so a highlighted square still reads as light or
                    dark and the chequer pattern survives. */}
                {isLastMoveSquare && (
                  <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(250, 204, 21, 0.28)' }} />
                )}
                {isSelected && (
                  <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(250, 204, 21, 0.35)' }} />
                )}
                {isCheckedKing && (
                  <div
                    className="absolute inset-0 pointer-events-none animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.85) 10%, rgba(239,68,68,0.15) 75%)' }}
                  />
                )}

                {/* Coordinate labels, tinted against their own square so they
                    stay legible on both colours. */}
                {fIdx === 0 && (
                  <span
                    className="absolute top-0.5 left-1 text-[9px] font-black pointer-events-none"
                    style={{ color: isLight ? SQUARE_DARK : SQUARE_LIGHT, opacity: 0.75 }}
                  >
                    {rank}
                  </span>
                )}
                {rIdx === 7 && (
                  <span
                    className="absolute bottom-0.5 right-1 text-[9px] font-black pointer-events-none"
                    style={{ color: isLight ? SQUARE_DARK : SQUARE_LIGHT, opacity: 0.75 }}
                  >
                    {file}
                  </span>
                )}

                {/* Valid Move Indicator */}
                {isValidDest && !piece && (
                  <div
                    className="w-[28%] h-[28%] rounded-full pointer-events-none"
                    style={{ backgroundColor: 'rgba(16,185,129,0.85)', boxShadow: '0 0 8px rgba(16,185,129,0.9)' }}
                  />
                )}
                {isValidDest && piece && (
                  // A ring around a capturable piece, which is the standard
                  // language for "you can take this" — the old animate-ping
                  // shrank to nothing and left the square looking empty.
                  <div
                    className="absolute inset-[6%] rounded-full pointer-events-none"
                    style={{ border: '3px solid rgba(239,68,68,0.9)', boxShadow: '0 0 10px rgba(239,68,68,0.6)' }}
                  />
                )}

                {/* 2v2 Teammate Proposed Target Marker */}
                {isProposalDest && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xs sm:text-sm font-black text-emerald-300 drop-shadow-[0_0_6px_#10b981]">
                      🎯 {proposal?.san}
                    </span>
                  </div>
                )}

                {/* Piece Rendering. The drop shadow is what keeps a white
                    piece readable on a light square and a dark piece readable
                    on a dark one, now that the squares actually contrast. */}
                {piece && (
                  <div
                    className="w-[85%] h-[85%] p-0.5 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 relative"
                    style={{
                      filter:
                        piece.color === 'w'
                          ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.85))'
                          : 'drop-shadow(0 1px 2px rgba(255,255,255,0.35))',
                    }}
                  >
                    {piece.color === 'w'
                      ? WHITE_PIECE_SVGS[piece.type.toUpperCase()]
                      : PIECE_SVGS[piece.type]}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
