'use client';

import React, { useEffect, useState } from 'react';
import { ChessClockState, ChessPieceColor } from '@/lib/chess/chessTypes';

interface ChessClocksProps {
  clocks: ChessClockState;
  activeColor: ChessPieceColor;
  whiteName: string;
  blackName: string;
  /** Fired once when the side to move runs out, so the match can be ended. */
  onFlagFall?: (loser: ChessPieceColor) => void;
}

function formatTime(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function ChessClocks({
  clocks,
  activeColor,
  whiteName,
  blackName,
  onFlagFall,
}: ChessClocksProps) {
  /**
   * Live countdown for the side to move.
   *
   * The server only adjusts the clock when a move is made, so these numbers sat
   * frozen between moves and then jumped. A chess clock that does not tick is
   * not a clock â€” you cannot feel time pressure, and you cannot tell whether
   * your opponent is thinking or has walked away.
   *
   * The server value stays authoritative; this only counts down from the last
   * tick it published, and every move resets it.
   */
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!clocks.isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [clocks.isRunning]);

  const elapsed = clocks.isRunning ? Math.max(0, now - clocks.lastTickTimestamp) : 0;
  const whiteTimeMs = Math.max(0, clocks.whiteTimeMs - (activeColor === 'w' ? elapsed : 0));
  const blackTimeMs = Math.max(0, clocks.blackTimeMs - (activeColor === 'b' ? elapsed : 0));

  // Flag fall. Without this a player could sit at 0:00 indefinitely â€” the
  // clamp at zero simply held there and the game never ended.
  const flagged = clocks.isRunning && ((activeColor === 'w' && whiteTimeMs <= 0) || (activeColor === 'b' && blackTimeMs <= 0));
  useEffect(() => {
    if (flagged) onFlagFall?.(activeColor);
  }, [flagged, activeColor, onFlagFall]);

  const isWhiteActive = activeColor === 'w' && clocks.isRunning;
  const isBlackActive = activeColor === 'b' && clocks.isRunning;

  const isWhiteLow = whiteTimeMs < 30_000 && whiteTimeMs > 0;
  const isBlackLow = blackTimeMs < 30_000 && blackTimeMs > 0;

  return (
    <div className="flex items-center justify-between w-full max-w-[480px] mx-auto gap-4 px-2 py-1 select-none">
      {/* Black Player Clock */}
      <div
        className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
          isBlackActive
            ? 'bg-slate-900 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
            : 'bg-slate-950/60 border-white/5 opacity-70'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-3 h-3 rounded-full bg-slate-900 border border-cyan-400" />
          <span className="text-xs font-bold text-slate-300 truncate max-w-[90px]">{blackName}</span>
        </div>
        <span
          className={`font-mono text-sm sm:text-base font-black ${
            isBlackLow ? 'text-red-400 animate-pulse' : isBlackActive ? 'text-cyan-300' : 'text-slate-400'
          }`}
        >
          {formatTime(blackTimeMs)}
        </span>
      </div>

      {/* White Player Clock */}
      <div
        className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
          isWhiteActive
            ? 'bg-slate-900 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.2)]'
            : 'bg-slate-950/60 border-white/5 opacity-70'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-3 h-3 rounded-full bg-slate-100 border border-amber-400 shadow-[0_0_4px_#fef08a]" />
          <span className="text-xs font-bold text-slate-300 truncate max-w-[90px]">{whiteName}</span>
        </div>
        <span
          className={`font-mono text-sm sm:text-base font-black ${
            isWhiteLow ? 'text-red-400 animate-pulse' : isWhiteActive ? 'text-amber-300' : 'text-slate-400'
          }`}
        >
          {formatTime(whiteTimeMs)}
        </span>
      </div>
    </div>
  );
}

