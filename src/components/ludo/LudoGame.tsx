'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RoomState, Player } from '@/lib/types';
import { roomStore } from '@/lib/roomStore';
import { LudoColor } from '@/lib/ludo/ludoTypes';
import LudoBoard from './LudoBoard';
import LudoDice from './LudoDice';
import { audioSFX } from '@/lib/audioFeedback';
import { Bot, RotateCcw, Trophy } from 'lucide-react';
import BackgroundMusic from '../BackgroundMusic';

interface LudoGameProps {
  room: RoomState;
  myPlayer: Player;
  roomId: string;
}

const COLOR_NAMES: Record<LudoColor, string> = {
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
};

/** Matches the board's paint, so the roster and the pieces read as one thing. */
const DOT: Record<LudoColor, string> = {
  red: 'bg-[#A8443F] shadow-[0_0_8px_#A8443F]',
  green: 'bg-[#3B7F5E] shadow-[0_0_8px_#3B7F5E]',
  yellow: 'bg-[#B08B3E] shadow-[0_0_8px_#B08B3E]',
  blue: 'bg-[#3F6E96] shadow-[0_0_8px_#3F6E96]',
};

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

export default function LudoGame({ room, myPlayer, roomId }: LudoGameProps) {
  const ls = room.ludoState;

  // Shown while a request is in flight, so the die tumbles for the round trip
  // instead of snapping from one number straight to the next.
  const [rolling, setRolling] = useState(false);

  // The turn this browser has already tried to play for the computer, as
  // "<turnSeq>:<nudge>". Without it a re-render mid-flight fires a second
  // identical step.
  const botAttempt = useRef('');

  // Bumped while a computer turn sits unplayed, so a step that never reached
  // the server — a dropped request, a sleeping phone — is tried again instead
  // of leaving the whole table waiting on a move that is not coming.
  const [botNudge, setBotNudge] = useState(0);

  const turnSeq = ls?.turnSeq ?? 0;

  useEffect(() => {
    setRolling(false);
  }, [turnSeq]);

  const activeSeat = ls?.players.find((p) => p.color === ls.activeColor);
  const isBotTurn = Boolean(activeSeat?.isAi) && !ls?.gameOver;
  const botHasRolled = Boolean(ls?.hasRolled);

  useEffect(() => {
    if (!isBotTurn) return;
    const id = setInterval(() => setBotNudge((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [isBotTurn, turnSeq]);

  /**
   * Drives the computer seats.
   *
   * Every browser in the room runs this and they all fire at once — that is
   * fine and deliberate, because the step names the turn it is playing and the
   * server drops anything aimed at a turn that has already moved on. Electing
   * one browser instead would mean the bots stop dead the moment that person
   * closes their tab.
   *
   * The dependency list is deliberately narrow. Holding the room object in it
   * meant every heartbeat re-ran this effect, and each re-run cleared the
   * pending timer and then bailed on the guard below — so the timer was
   * cancelled forever and the computer never took its turn at all.
   */
  useEffect(() => {
    if (!isBotTurn) return;

    const attempt = `${turnSeq}:${botNudge}`;
    if (botAttempt.current === attempt) return;
    botAttempt.current = attempt;

    if (!botHasRolled) {
      setRolling(true);
      audioSFX.playDiceRoll();
    }

    let sent = false;
    const timer = setTimeout(() => {
      sent = true;
      void roomStore.ludoBotStep(roomId, turnSeq).catch(() => {
        // A losing duplicate, or a dropped request. The nudge above retries.
      });
    }, botHasRolled ? 700 : 550);

    return () => {
      clearTimeout(timer);
      // An attempt that never went out must stay retryable, otherwise one
      // unlucky unmount strands the game on a computer's turn.
      if (!sent) botAttempt.current = '';
    };
  }, [isBotTurn, botHasRolled, turnSeq, botNudge, roomId]);

  if (!ls) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center glass-card rounded-2xl">
        <p className="text-amber-400 font-bold">Connecting to Ludo Arena...</p>
      </div>
    );
  }

  // A match that was already running when the variable line-up shipped has no
  // seatOrder until its next action repairs it server-side.
  const seatOrder = ls.seatOrder?.length ? ls.seatOrder : (['red', 'green', 'yellow', 'blue'] as LudoColor[]);
  const rankings = ls.rankings ?? [];

  const mySeat = ls.players.find((p) => p.playerId === myPlayer.id && !p.isAi);
  const myColor = mySeat?.color;
  const isMyTurn = !ls.gameOver && myColor === ls.activeColor;

  const handleRollDice = async () => {
    if (!isMyTurn || ls.hasRolled) return;
    setRolling(true);
    try {
      await roomStore.rollLudoDice(roomId);
    } finally {
      setRolling(false);
    }
  };

  const handleTokenClick = async (tokenId: number) => {
    if (!isMyTurn || !ls.hasRolled || !ls.diceValue) return;
    audioSFX.playChoiSuccess();
    await roomStore.moveLudoToken(roomId, tokenId);
  };

  const handleRematch = async () => {
    audioSFX.playNollywoodBrass();
    await roomStore.ludoRematch(roomId);
  };

  const homeCount = (color: LudoColor) =>
    (ls.tokens[color] ?? []).filter((t) => t.position === 999).length;

  const statusLine = ls.gameOver
    ? 'Match over'
    : isBotTurn
    ? 'Computer thinking…'
    : !isMyTurn
    ? 'Waiting…'
    : ls.hasRolled
    ? 'Pick a token'
    : 'Tap the dice';

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto space-y-4 px-2 py-4 select-none relative">
      {/* Track assignment lives in lib/soundtrack.ts. Ludo was sharing the
          lobby's ambient bed, so launching a match changed nothing you
          could hear and the game never felt like it had started. */}
      <BackgroundMusic screen="ludo" />

      <div className="flex items-center justify-between w-full px-2">
        <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-widest">
          🎲 LUDO · {seatOrder.length} SEATS
        </span>
        <span className="text-xs font-bold text-slate-400">
          {myColor ? `You: ${COLOR_NAMES[myColor].toUpperCase()}` : 'Spectating'}
        </span>
      </div>

      {/* Seat roster. With a variable line-up you can no longer assume four
          players in a known order, so who is playing — and which of them is a
          computer — has to be on screen. */}
      <div className="w-full grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
        {seatOrder.map((color) => {
          const seat = ls.players.find((p) => p.color === color);
          const isActive = color === ls.activeColor && !ls.gameOver;
          const place = rankings.indexOf(color);
          return (
            <div
              key={color}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl border transition-all ${
                isActive
                  ? 'bg-amber-500/15 border-amber-400/60 shadow-lg'
                  : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[color]}`} />
              <span className="text-[11px] font-black text-white truncate flex-1 min-w-0">
                {seat?.name ?? COLOR_NAMES[color]}
              </span>
              {seat?.isAi && <Bot className="w-3 h-3 text-sky-300 shrink-0" />}
              <span className="text-[10px] font-black text-slate-400 shrink-0">
                {place >= 0 ? MEDALS[place] ?? `#${place + 1}` : `${homeCount(color)}/4`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Turn Indicator & Status Banner */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/80 border border-white/10 shadow-lg">
        <div>
          <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
            CURRENT TURN
          </span>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${DOT[ls.activeColor]}`} />
            {activeSeat?.name || COLOR_NAMES[ls.activeColor]}
            {isMyTurn && <span className="text-xs text-amber-300 font-bold">(Your Move!)</span>}
          </h3>
        </div>

        {/* The dice itself now lives in the middle of the board — see below. */}
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">
          {statusLine}
        </span>
      </div>

      {/* Action Ticker */}
      {ls.lastActionText && (
        <div className="w-full text-center text-xs font-bold text-amber-300/90 py-1 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-fadeIn">
          {ls.lastActionText}
        </div>
      )}

      {/* Interactive 15x15 Ludo Board, with the dice floating in the middle.
          That is where a die lands on a real board and where everyone's eyes
          already are — parking it in the header above meant looking away from
          the board to roll, then back again to move. */}
      <div className="relative w-full max-w-[520px] mx-auto">
        <LudoBoard
          tokens={ls.tokens}
          seatOrder={seatOrder}
          activeColor={ls.activeColor}
          diceValue={ls.diceValue}
          hasRolled={ls.hasRolled}
          isMyTurn={isMyTurn}
          onTokenClick={handleTokenClick}
        />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
          <div className="pointer-events-auto">
            <LudoDice
              value={ls.diceValue}
              isRolling={rolling}
              disabled={!isMyTurn || ls.hasRolled || ls.gameOver === true}
              onRoll={handleRollDice}
            />
          </div>
        </div>
      </div>

      {/* Final standings. Everyone who got all four home is listed in the order
          they did it — a four-seat game has three real places to play for, and
          calling it after first place threw two thirds of the match away. */}
      {ls.gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="glass-card rounded-3xl p-6 border-2 border-amber-400 max-w-sm w-full text-center space-y-4 bg-slate-900 shadow-2xl">
            <Trophy className="w-14 h-14 text-amber-400 mx-auto animate-bounce" />
            <h2 className="text-2xl font-black text-white uppercase">Final Standings</h2>

            <div className="space-y-2 text-left">
              {rankings.map((color, idx) => {
                const seat = ls.players.find((p) => p.color === color);
                return (
                  <div
                    key={color}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                      idx === 0
                        ? 'bg-amber-500/15 border-amber-400/50'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <span className="text-lg leading-none">{MEDALS[idx] ?? `#${idx + 1}`}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${DOT[color]}`} />
                    <span className="text-sm font-black text-white truncate flex-1 min-w-0">
                      {seat?.name ?? COLOR_NAMES[color]}
                    </span>
                    {seat?.isAi && <Bot className="w-3.5 h-3.5 text-sky-300 shrink-0" />}
                  </div>
                );
              })}
            </div>

            {myPlayer.isHost ? (
              <button
                onClick={handleRematch}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-sm py-3 rounded-2xl transition active:scale-95 shadow-lg"
              >
                <RotateCcw className="w-4 h-4" /> PLAY AGAIN
              </button>
            ) : (
              <p className="text-xs text-slate-400 font-bold">Waiting for the host to start a rematch…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
