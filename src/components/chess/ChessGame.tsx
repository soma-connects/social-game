'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RoomState, Player } from '@/lib/types';
import { Chess, Square } from 'chess.js';
import { roomStore } from '@/lib/roomStore';
import { getBotMove } from '@/lib/chess/chessEngine';
import { ChessPieceColor, ChessMoveProposal } from '@/lib/chess/chessTypes';
import ChessBoard from './ChessBoard';
import ChessClocks from './ChessClocks';
import BackgroundMusic from '../BackgroundMusic';
import { audioSFX } from '@/lib/audioFeedback';
import { Flag, RotateCcw, MessageSquare, Check, X, ShieldAlert, Sparkles } from 'lucide-react';

interface ChessGameProps {
  room: RoomState;
  myPlayer: Player;
  roomId: string;
}

export default function ChessGame({ room, myPlayer, roomId }: ChessGameProps) {
  const cs = room.chessState;

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const chess = useMemo(() => new Chess(cs?.fen || undefined), [cs?.fen]);

  // Determine user's player slot & color
  const myWhiteSlot = cs?.whitePlayers.find((p) => p.playerId === myPlayer.id);
  const myBlackSlot = cs?.blackPlayers.find((p) => p.playerId === myPlayer.id);
  const isSpectator = !myWhiteSlot && !myBlackSlot;
  const myColor: ChessPieceColor = myWhiteSlot ? 'w' : myBlackSlot ? 'b' : 'w';

  const isMyTurn = !isSpectator && cs?.turn === myColor;
  const is2v2Mode = cs?.mode === '2v2';
  const isVsAi = cs?.mode === 'vs_ai';

  // Proposal for my team (if 2v2)
  const myTeamProposal = myColor === 'w' ? cs?.proposals.w : cs?.proposals.b;
  const opponentProposal = myColor === 'w' ? cs?.proposals.b : cs?.proposals.w;

  // Compute legal destination squares for the selected piece
  const validDestinations = useMemo<Square[]>(() => {
    if (!selectedSquare || !isMyTurn) return [];
    const moves = chess.moves({ square: selectedSquare, verbose: true });
    return moves.map((m) => m.to as Square);
  }, [chess, selectedSquare, isMyTurn]);

  /**
   * Drives the computer opponent.
   *
   * Only the host runs this. Every client in the room was previously computing
   * a bot move and posting it the moment it became Black's turn, so a room with
   * two people watching submitted the bot's move two or three times — and the
   * server accepted all of them, because vs_ai mode skipped the turn check.
   */
  const drivesBot = room.hostId === myPlayer.id;

  useEffect(() => {
    if (!isVsAi || !drivesBot || !cs || cs.turn !== 'b' || cs.winner) return;

    let cancelled = false;
    setIsAiThinking(true);

    const timer = setTimeout(async () => {
      try {
        const botMove = getBotMove(cs.fen, cs.botDifficulty || 'navigator');
        if (botMove && !cancelled) {
          await roomStore.makeChessMove(roomId, myPlayer.id, botMove.from, botMove.to, botMove.promotion);
          audioSFX.playPop();
        }
      } catch (e) {
        console.error('Bot move failed:', e);
      } finally {
        if (!cancelled) setIsAiThinking(false);
      }
    }, 800 + Math.random() * 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isVsAi, drivesBot, cs?.fen, cs?.turn, cs?.winner, roomId, cs?.botDifficulty, myPlayer.id]);

  // Handle Square Selection and Moves
  const handleSquareClick = useCallback(
    async (sq: Square) => {
      if (cs?.winner || !isMyTurn) return;

      const piece = chess.get(sq);

      // If clicking own piece, select it
      if (piece && piece.color === myColor) {
        setSelectedSquare(sq);
        return;
      }

      // If we already had a square selected and clicked a legal destination:
      if (selectedSquare && validDestinations.includes(sq)) {
        const from = selectedSquare;
        const to = sq;
        setSelectedSquare(null);

        if (is2v2Mode) {
          // In 2v2 consultation mode, clicking a move proposes it to your teammate
          const moveAttempt = chess.moves({ square: from, verbose: true }).find((m) => m.to === to);
          await roomStore.proposeChessMove(roomId, myPlayer.id, from, to, moveAttempt?.san, 'q');
          audioSFX.playTap();
        } else {
          // Direct 1v1 / vs AI move
          await roomStore.makeChessMove(roomId, myPlayer.id, from, to, 'q');
          audioSFX.playChoiSuccess();
        }
      } else {
        setSelectedSquare(null);
      }
    },
    [cs?.winner, isMyTurn, chess, myColor, selectedSquare, validDestinations, is2v2Mode, roomId, myPlayer.id]
  );

  // Confirm teammate's proposal in 2v2
  const handleConfirmProposal = async () => {
    if (!myTeamProposal) return;
    await roomStore.makeChessMove(roomId, myPlayer.id, myTeamProposal.from, myTeamProposal.to, myTeamProposal.promotion);
    audioSFX.playChoiSuccess();
  };

  /** Either partner can withdraw a suggestion — otherwise a pair who disagree
   *  are stuck staring at a move neither of them wants to play. */
  const handleClearProposal = async () => {
    await roomStore.clearChessProposal(roomId, myPlayer.id);
    audioSFX.playTap();
  };

  const flagReported = useRef(false);
  const handleFlagFall = useCallback(() => {
    if (flagReported.current || !drivesBot) return;
    flagReported.current = true;
    void roomStore.chessTimeout(roomId);
  }, [drivesBot, roomId]);

  // A new position means a new clock, so the guard resets.
  useEffect(() => {
    flagReported.current = false;
  }, [cs?.fen]);

  // Names for clocks
  const whiteName = cs?.whitePlayers.map((p) => p.name).join(' & ') || 'White';
  const blackName = cs?.blackPlayers.map((p) => p.name).join(' & ') || 'Black';

  if (!cs) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center glass-card rounded-2xl">
        <p className="text-cyan-400 font-bold">Connecting to Chess Arena...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto space-y-4 px-2 py-4 select-none">
      {/* Chess had no music at all. Deliberately the sparsest track in the set —
          this screen is thinking time, and a busy loop turns irritating fast. */}
      <BackgroundMusic screen="chess" />
      {/* Game Mode Badge & Status Header */}
      <div className="flex items-center justify-between w-full px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-widest">
            {cs.mode === 'vs_ai' ? `🤖 VS AI (${cs.botDifficulty})` : cs.mode === '2v2' ? '👥 2v2 CONSULTATION' : '⚔️ 1v1 DUEL'}
          </span>
          {isSpectator && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Spectator
            </span>
          )}
        </div>

        {/* Turn Indicator */}
        <div className="flex items-center gap-2">
          {cs.winner ? (
            <span className="text-xs font-black text-amber-300 bg-amber-500/20 px-3 py-1 rounded-lg border border-amber-500/30 animate-pulse">
              🏆 {cs.winReason}: {cs.winner === 'w' ? 'WHITE WINS' : cs.winner === 'b' ? 'BLACK WINS' : 'DRAW'}
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-300">
              Turn: <span className="font-black text-cyan-400">{cs.turn === 'w' ? 'WHITE' : 'BLACK'}</span>
            </span>
          )}
        </div>
      </div>

      {/* Clocks. Only the host reports a flag fall — every client watches the
          same countdown, so letting all of them report it would fire the same
          action once per person in the room. */}
      <ChessClocks
        clocks={cs.clocks}
        activeColor={cs.turn}
        whiteName={whiteName}
        blackName={blackName}
        onFlagFall={handleFlagFall}
      />

      {/* 2v2 Teammate Consultation Prompt (if any) */}
      {is2v2Mode && myTeamProposal && (
        <div className="w-full bg-gradient-to-r from-purple-900/50 to-indigo-900/50 border border-purple-400/40 rounded-xl p-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-300 animate-spin" />
            <div className="text-xs text-purple-200">
              <span className="font-bold text-white">{myTeamProposal.proposerName}</span> proposes move{' '}
              <span className="font-mono font-black text-amber-300 text-sm px-1.5 py-0.5 bg-black/40 rounded">
                {myTeamProposal.san || `${myTeamProposal.from}→${myTeamProposal.to}`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {myTeamProposal.proposerId !== myPlayer.id && (
              <button
                onClick={handleConfirmProposal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-lg transition active:scale-95 shadow-md shadow-emerald-500/20"
              >
                <Check className="w-3.5 h-3.5" /> PLAY IT
              </button>
            )}
            <button
              onClick={handleClearProposal}
              title="Withdraw this suggestion"
              className="flex items-center gap-1 px-2.5 py-1.5 border border-white/15 hover:border-white/35 text-slate-300 font-bold text-xs rounded-lg transition active:scale-95"
            >
              <X className="w-3.5 h-3.5" />
              {myTeamProposal.proposerId === myPlayer.id ? 'CANCEL' : 'NO'}
            </button>
          </div>
        </div>
      )}

      {/* Chess Board */}
      <ChessBoard
        fen={cs.fen}
        myColor={myColor}
        isMyTurn={isMyTurn}
        selectedSquare={selectedSquare}
        validDestinations={validDestinations}
        proposal={myTeamProposal}
        lastMove={cs.lastMove}
        onSquareClick={handleSquareClick}
        flipBoard={myColor === 'b' && !isSpectator}
      />

      {/* Move History / SAN ticker */}
      <div className="w-full flex items-center gap-2 overflow-x-auto py-1 px-2 rounded-lg bg-slate-950/60 border border-white/5 text-xs text-slate-400 no-scrollbar">
        <span className="font-bold text-slate-500 flex-shrink-0">MOVES:</span>
        {cs.history.length === 0 && <span className="italic text-slate-600">No moves yet</span>}
        {cs.history.map((san, idx) => (
          <span key={idx} className="font-mono text-slate-300 flex-shrink-0">
            {idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}.` : ''} <span className="font-bold text-cyan-300">{san}</span>
          </span>
        ))}
      </div>

      {/* Action Footer */}
      {!cs.winner && !isSpectator && (
        <div className="flex items-center justify-between w-full px-2 pt-2">
          <button
            onClick={() => roomStore.resignChess(roomId, myPlayer.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-bold transition active:scale-95"
          >
            <Flag className="w-3.5 h-3.5" /> Resign
          </button>
          {is2v2Mode && (
            <p className="text-[11px] text-slate-400 italic">
              💡 Tip: Click pieces to propose moves to your teammate!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
