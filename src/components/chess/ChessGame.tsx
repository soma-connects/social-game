'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RoomState, Player } from '@/lib/types';
import { Chess, Square } from 'chess.js';
import { roomStore } from '@/lib/roomStore';
import { getBotMove } from '@/lib/chess/chessEngine';
import { pickBotDriverId } from '@/lib/botDriver';
import { ChessPieceColor } from '@/lib/chess/chessTypes';
import ChessBoard from './ChessBoard';
import ChessClocks from './ChessClocks';
import BackgroundMusic from '../BackgroundMusic';
import { audioSFX } from '@/lib/audioFeedback';
import { Bot, Flag, RotateCcw, Check, X, Sparkles } from 'lucide-react';

interface ChessGameProps {
  room: RoomState;
  myPlayer: Player;
  roomId: string;
}

/** A move waiting on the player to say what the pawn becomes. */
type PendingPromotion = { from: Square; to: Square };

const PROMOTION_CHOICES: { piece: 'q' | 'r' | 'b' | 'n'; label: string; glyphW: string; glyphB: string }[] = [
  { piece: 'q', label: 'Queen', glyphW: '♕', glyphB: '♛' },
  { piece: 'r', label: 'Rook', glyphW: '♖', glyphB: '♜' },
  { piece: 'b', label: 'Bishop', glyphW: '♗', glyphB: '♝' },
  { piece: 'n', label: 'Knight', glyphW: '♘', glyphB: '♞' },
];

export default function ChessGame({ room, myPlayer, roomId }: ChessGameProps) {
  const cs = room.chessState;

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const chess = useMemo(() => new Chess(cs?.fen || undefined), [cs?.fen]);

  // Determine user's player slot & color
  const myWhiteSlot = cs?.whitePlayers.find((p) => p.playerId === myPlayer.id && !p.isAi);
  const myBlackSlot = cs?.blackPlayers.find((p) => p.playerId === myPlayer.id && !p.isAi);
  const isSpectator = !myWhiteSlot && !myBlackSlot;
  const myColor: ChessPieceColor = myWhiteSlot ? 'w' : myBlackSlot ? 'b' : 'w';

  const isMyTurn = !isSpectator && cs?.turn === myColor && !cs?.winner;
  const is2v2Mode = cs?.mode === '2v2';

  // Proposal for my team (if 2v2)
  const myTeamProposal = myColor === 'w' ? cs?.proposals.w : cs?.proposals.b;

  // Compute legal destination squares for the selected piece
  const validDestinations = useMemo<Square[]>(() => {
    if (!selectedSquare || !isMyTurn) return [];
    const moves = chess.moves({ square: selectedSquare, verbose: true });
    return moves.map((m) => m.to as Square);
  }, [chess, selectedSquare, isMyTurn]);

  /**
   * The side to move, and who — if anyone — is human on it.
   *
   * A side made entirely of computers plays itself. A side with one person and
   * one computer is played by the person, with the computer offering a move
   * through the consultation box rather than taking their turn from them.
   */
  const activeSlots = cs ? (cs.turn === 'w' ? cs.whitePlayers : cs.blackPlayers) : [];
  const sideIsAllBots = activeSlots.length > 0 && activeSlots.every((s) => s.isAi);
  const advisorSlot = activeSlots.every((s) => s.isAi) ? undefined : activeSlots.find((s) => s.isAi);
  const activeSkill =
    activeSlots.find((s) => s.isAi)?.botSkill ?? cs?.botDifficulty ?? 'navigator';

  /**
   * Drives the computer.
   *
   * Only one browser does this. Every client in the room used to compute a bot
   * move and post it the moment it became the computer's turn, so a room with
   * two people watching submitted the same move two or three times. The host
   * takes the job, and hands it on automatically if they leave — a computer
   * opponent that stops playing when the host closes a tab is worse than no
   * computer at all.
   */
  const drivesBot = pickBotDriverId(room.players, room.hostId) === myPlayer.id;
  const ply = cs?.history.length ?? 0;
  const needsBot = Boolean(cs) && !cs?.winner && (sideIsAllBots || Boolean(advisorSlot));
  const advisorIdle = Boolean(advisorSlot) && !myTeamProposal && !cs?.proposals[cs.turn];

  useEffect(() => {
    if (!cs || !drivesBot || !needsBot) return;
    // A computer teammate only speaks up when the box is empty, and never
    // talks over a suggestion a person already put there.
    if (!sideIsAllBots && !advisorIdle) return;

    let cancelled = false;
    setIsAiThinking(true);

    const timer = setTimeout(async () => {
      try {
        const botMove = getBotMove(cs.fen, activeSkill);
        if (!botMove || cancelled) return;

        if (sideIsAllBots) {
          await roomStore.makeChessBotMove(roomId, botMove.from, botMove.to, botMove.promotion, ply);
          audioSFX.playPop();
        } else {
          await roomStore.proposeChessBotMove(
            roomId,
            botMove.from,
            botMove.to,
            botMove.san,
            botMove.promotion,
            ply
          );
        }
      } catch (e) {
        console.error('Bot move failed:', e);
      } finally {
        if (!cancelled) setIsAiThinking(false);
      }
    }, 700 + Math.random() * 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Keyed on the position, not the room object: holding the whole room here
    // means every heartbeat cancels the pending think and restarts it.
  }, [cs?.fen, drivesBot, needsBot, sideIsAllBots, advisorIdle, activeSkill, ply, roomId]);

  /** True when moving from → to is a pawn arriving on the last rank. */
  const isPromotion = useCallback(
    (from: Square, to: Square) => {
      const piece = chess.get(from);
      if (!piece || piece.type !== 'p') return false;
      return to[1] === (piece.color === 'w' ? '8' : '1');
    },
    [chess]
  );

  const submitMove = useCallback(
    async (from: Square, to: Square, promotion: 'q' | 'r' | 'b' | 'n') => {
      if (is2v2Mode) {
        const attempt = chess.moves({ square: from, verbose: true }).find((m) => m.to === to);
        await roomStore.proposeChessMove(roomId, myPlayer.id, from, to, attempt?.san, promotion);
        audioSFX.playTap();
      } else {
        await roomStore.makeChessMove(roomId, myPlayer.id, from, to, promotion);
        audioSFX.playChoiSuccess();
      }
    },
    [chess, is2v2Mode, roomId, myPlayer.id]
  );

  // Handle Square Selection and Moves
  const handleSquareClick = useCallback(
    async (sq: Square) => {
      if (cs?.winner || !isMyTurn || pendingPromotion) return;

      const piece = chess.get(sq);

      // If clicking own piece, select it
      if (piece && piece.color === myColor) {
        setSelectedSquare(sq);
        return;
      }

      if (selectedSquare && validDestinations.includes(sq)) {
        const from = selectedSquare;
        setSelectedSquare(null);

        // Promotion was hardcoded to a queen, so underpromotion — which is the
        // whole point in a handful of positions, and the only way out of some
        // stalemate traps — simply could not be played.
        if (isPromotion(from, sq)) {
          setPendingPromotion({ from, to: sq });
          return;
        }

        await submitMove(from, sq, 'q');
      } else {
        setSelectedSquare(null);
      }
    },
    [cs?.winner, isMyTurn, pendingPromotion, chess, myColor, selectedSquare, validDestinations, isPromotion, submitMove]
  );

  const choosePromotion = async (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    await submitMove(from, to, piece);
  };

  // Confirm teammate's proposal in 2v2
  const handleConfirmProposal = async () => {
    if (!myTeamProposal) return;
    await roomStore.makeChessMove(
      roomId,
      myPlayer.id,
      myTeamProposal.from,
      myTeamProposal.to,
      myTeamProposal.promotion
    );
    audioSFX.playChoiSuccess();
  };

  /** Either partner can withdraw a suggestion — otherwise a pair who disagree
   *  are stuck staring at a move neither of them wants to play. */
  const handleClearProposal = async () => {
    await roomStore.clearChessProposal(roomId, myPlayer.id);
    audioSFX.playTap();
  };

  const handleRematch = async () => {
    audioSFX.playNollywoodBrass();
    await roomStore.chessRematch(roomId);
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

  // Clearing a half-made promotion when the position moves on, so a stale
  // dialog cannot post a move against a board that has since changed.
  useEffect(() => {
    setPendingPromotion(null);
    setSelectedSquare(null);
  }, [cs?.fen]);

  if (!cs) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center glass-card rounded-2xl">
        <p className="text-cyan-400 font-bold">Connecting to Chess Arena...</p>
      </div>
    );
  }

  const sideLabel = (slots: typeof cs.whitePlayers, fallback: string) =>
    slots.length ? slots.map((p) => p.name).join(' & ') : fallback;
  const whiteName = sideLabel(cs.whitePlayers, 'White');
  const blackName = sideLabel(cs.blackPlayers, 'Black');

  const modeBadge =
    cs.mode === 'vs_ai'
      ? `🤖 VS COMPUTER (${(cs.botDifficulty ?? 'navigator').toUpperCase()})`
      : cs.mode === '2v2'
      ? '👥 2v2 CONSULTATION'
      : '⚔️ 1v1 DUEL';

  const promotionColor = pendingPromotion ? chess.get(pendingPromotion.from)?.color ?? myColor : myColor;

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto space-y-4 px-2 py-4 select-none">
      {/* Chess had no music at all. Deliberately the sparsest track in the set —
          this screen is thinking time, and a busy loop turns irritating fast. */}
      <BackgroundMusic screen="chess" />

      {/* Game Mode Badge & Status Header */}
      <div className="flex items-center justify-between w-full px-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-widest truncate">
            {modeBadge}
          </span>
          {(cs.gameNumber ?? 1) > 1 && (
            <span className="text-[10px] font-black text-slate-400 shrink-0">
              GAME {cs.gameNumber}
            </span>
          )}
          {isSpectator && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
              Spectator
            </span>
          )}
        </div>

        {/* Turn Indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {cs.winner ? (
            <span className="text-xs font-black text-amber-300 bg-amber-500/20 px-3 py-1 rounded-lg border border-amber-500/30 animate-pulse">
              🏆 {cs.winReason}: {cs.winner === 'w' ? 'WHITE' : cs.winner === 'b' ? 'BLACK' : 'DRAW'}
            </span>
          ) : isAiThinking && (sideIsAllBots || advisorSlot) ? (
            <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 animate-pulse" /> Thinking…
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-300">
              Turn: <span className="font-black text-cyan-400">{cs.turn === 'w' ? 'WHITE' : 'BLACK'}</span>
            </span>
          )}
        </div>
      </div>

      {/* Clocks. Only the bot driver reports a flag fall — every client watches
          the same countdown, so letting all of them report it would fire the
          same action once per person in the room. */}
      <ChessClocks
        clocks={cs.clocks}
        activeColor={cs.turn}
        whiteName={whiteName}
        blackName={blackName}
        onFlagFall={handleFlagFall}
      />

      {/* 2v2 Teammate Consultation Prompt (if any) */}
      {is2v2Mode && myTeamProposal && !cs.winner && (
        <div className="w-full bg-gradient-to-r from-purple-900/50 to-indigo-900/50 border border-purple-400/40 rounded-xl p-3 flex items-center justify-between shadow-lg gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-purple-300 shrink-0" />
            <div className="text-xs text-purple-200 min-w-0">
              <span className="font-bold text-white">{myTeamProposal.proposerName}</span> proposes{' '}
              <span className="font-mono font-black text-amber-300 text-sm px-1.5 py-0.5 bg-black/40 rounded">
                {myTeamProposal.san || `${myTeamProposal.from}→${myTeamProposal.to}`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {myTeamProposal.proposerId !== myPlayer.id && isMyTurn && (
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
      <div className="relative w-full">
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

        {/* Promotion picker */}
        {pendingPromotion && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm rounded-2xl animate-fadeIn">
            <div className="text-center space-y-3 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-cyan-300">
                Promote to
              </p>
              <div className="flex items-center gap-2">
                {PROMOTION_CHOICES.map((choice) => (
                  <button
                    key={choice.piece}
                    onClick={() => choosePromotion(choice.piece)}
                    title={choice.label}
                    aria-label={`Promote to ${choice.label}`}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-800 border-2 border-cyan-500/40 hover:border-cyan-300 hover:bg-slate-700 transition active:scale-95 flex items-center justify-center text-3xl sm:text-4xl leading-none text-white"
                  >
                    {promotionColor === 'w' ? choice.glyphW : choice.glyphB}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPendingPromotion(null)}
                className="text-[11px] font-bold text-slate-400 hover:text-slate-200 underline"
              >
                Cancel the move
              </button>
            </div>
          </div>
        )}
      </div>

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
        <div className="flex items-center justify-between w-full px-2 pt-2 gap-2">
          <button
            onClick={() => roomStore.resignChess(roomId, myPlayer.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-bold transition active:scale-95"
          >
            <Flag className="w-3.5 h-3.5" /> Resign
          </button>
          {is2v2Mode && (
            <p className="text-[11px] text-slate-400 italic text-right">
              💡 Click pieces to propose moves to your teammate
            </p>
          )}
        </div>
      )}

      {/* Game over. Colours swap on a rematch, which is the only way to get the
          other end of a time control — or to play Black against the computer. */}
      {cs.winner && (
        <div className="w-full flex flex-col items-center gap-2 pt-1">
          <p className="text-sm font-black text-white text-center">
            {cs.winner === 'draw'
              ? `Drawn — ${cs.winReason}`
              : `${cs.winner === 'w' ? whiteName : blackName} wins by ${(cs.winReason ?? '').toLowerCase()}`}
          </p>
          {myPlayer.isHost ? (
            <button
              onClick={handleRematch}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-black text-sm py-2.5 px-6 rounded-2xl transition active:scale-95 shadow-lg"
            >
              <RotateCcw className="w-4 h-4" /> REMATCH (SWAP COLOURS)
            </button>
          ) : (
            <p className="text-xs text-slate-400 font-bold">Waiting for the host to start a rematch…</p>
          )}
        </div>
      )}
    </div>
  );
}
