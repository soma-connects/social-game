'use client';

import React, { useState, useEffect } from 'react';
import { RoomState, Player } from '@/lib/types';
import { roomStore } from '@/lib/roomStore';
import { chooseBestLudoMove, nextBotAction } from '@/lib/ludo/ludoRules';
import { LudoColor } from '@/lib/ludo/ludoTypes';
import LudoBoard from './LudoBoard';
import LudoDice from './LudoDice';
import { audioSFX } from '@/lib/audioFeedback';
import { Sparkles, Trophy } from 'lucide-react';
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

export default function LudoGame({ room, myPlayer, roomId }: LudoGameProps) {
  const ls = room.ludoState;
  const [botRolling, setBotRolling] = useState(false);
  const [myRolling, setMyRolling] = useState(false);
  /** Bumped to try a bot step again after the server refused it. */
  const [botRetry, setBotRetry] = useState(0);

  // Music, including its mute button, is handled by BackgroundMusic below. The
  // local copy that used to live here only muted this one screen and forgot the
  // choice the moment you left it.

  // Find my color slot
  const myLudoPlayer = ls?.players.find((p) => p.playerId === myPlayer.id);
  const myColor = myLudoPlayer?.color;
  const isMyTurn = myColor === ls?.activeColor;

  // Active player in Ludo
  const activeLudoPlayer = ls?.players.find((p) => p.color === ls.activeColor);

  // Bots are played by the host's browser and nobody else's. The server only
  // accepts a bot's move from the host, so when every browser tried, everyone
  // but the host was refused and retried in a loop.
  const isHost = !!myPlayer.isHost;
  const botAction = nextBotAction(ls);

  // Keyed on `seq`, which moves on every roll, move and skipped turn — a bot
  // that rolls a six goes again from a state that otherwise looks identical.
  //
  // Nothing in here may be a dependency that the effect itself changes. The
  // first version listed its own busy flag: setting it re-ran the effect, whose
  // cleanup cancelled the timer it had just started, and the flag never cleared.
  // Every bot seat sat there for good.
  useEffect(() => {
    if (!isHost || !botAction || !ls) return;
    let cancelled = false;
    const rolling = botAction === 'roll';
    setBotRolling(rolling);

    const timer = setTimeout(async () => {
      let result: { error?: string } | undefined;
      if (rolling) {
        audioSFX.playDiceRoll();
        result = await roomStore.rollLudoDice(roomId);
      } else {
        const best = chooseBestLudoMove(ls.tokens[ls.activeColor], ls.diceValue!, ls.tokens);
        if (!best) return;
        audioSFX.playChoiSuccess();
        result = await roomStore.moveLudoToken(roomId, best.id);
      }
      if (cancelled) return;
      setBotRolling(false);
      // Refused or lost in transit: try the same step again rather than stall.
      if (result?.error) window.setTimeout(() => setBotRetry((n) => n + 1), 2000);
    }, rolling ? 1100 : 900);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setBotRolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, botAction, ls?.seq, ls?.activeColor, roomId, botRetry]);

  if (!ls) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center glass-card rounded-2xl">
        <p className="text-amber-400 font-bold">Connecting to Ludo Arena...</p>
      </div>
    );
  }

  const handleRollDice = async () => {
    if (!isMyTurn || ls.hasRolled || myRolling) return;
    setMyRolling(true);
    const startedAt = Date.now();
    await roomStore.rollLudoDice(roomId);
    // Let the die be seen tumbling even when the server answers at once.
    window.setTimeout(() => setMyRolling(false), Math.max(0, 700 - (Date.now() - startedAt)));
  };

  const handleTokenClick = async (tokenId: number) => {
    if (!isMyTurn || !ls.hasRolled || !ls.diceValue) return;
    audioSFX.playChoiSuccess();
    await roomStore.moveLudoToken(roomId, tokenId);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto space-y-4 px-2 py-4 select-none relative">
      {/* Track assignment lives in lib/soundtrack.ts. Ludo was sharing the
          lobby's ambient bed, so launching a match changed nothing you
          could hear and the game never felt like it had started. */}
      <BackgroundMusic screen="ludo" />

      <div className="flex items-center justify-between w-full px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-widest flex items-center gap-1.5">
            🎲 LUDO VOICE PARTY
          </span>
          <span className="text-xs font-bold text-slate-400">
            {myColor ? `You: ${COLOR_NAMES[myColor].toUpperCase()}` : 'Spectating'}
          </span>
        </div>
      </div>

      {/* Turn Indicator & Status Banner */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/80 border border-white/10 shadow-lg">
        <div>
          <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">CURRENT TURN</span>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                ls.activeColor === 'red'
                  ? 'bg-red-500 shadow-[0_0_8px_#ef4444]'
                  : ls.activeColor === 'green'
                  ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                  : ls.activeColor === 'yellow'
                  ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'
                  : 'bg-sky-500 shadow-[0_0_8px_#0ea5e9]'
              }`}
            />
            {activeLudoPlayer?.name || COLOR_NAMES[ls.activeColor]}
            {isMyTurn && <span className="text-xs text-amber-300 font-bold">(Your Move!)</span>}
          </h3>
        </div>

        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">
          {ls.winner
            ? 'Game over'
            : !isMyTurn
            ? 'Waiting…'
            : ls.hasRolled
            ? 'Pick a token'
            : 'Tap the dice'}
        </span>
      </div>

      {/* Action Ticker */}
      {ls.lastActionText && (
        <div className="w-full text-center text-xs font-bold text-amber-300/90 py-1 bg-amber-500/10 border border-amber-500/20 rounded-xl animate-fadeIn">
          {ls.lastActionText}
        </div>
      )}

      {/* The board on its own. The die used to float in the middle of it, which is
          exactly where the home triangles are, so it sat on the one part of the
          board every token is racing towards. */}
      <div className="relative w-full max-w-[520px] mx-auto">
        <LudoBoard
          tokens={ls.tokens}
          activeColor={ls.activeColor}
          diceValue={ls.diceValue}
          hasRolled={ls.hasRolled}
          isMyTurn={isMyTurn}
          onTokenClick={handleTokenClick}
        />
      </div>

      {/* The dice tray, under the board: one die, passed round the table. */}
      <div
        className={`w-full max-w-[520px] mx-auto flex items-center justify-between gap-4 rounded-3xl border px-5 py-4 ${
          isMyTurn && !ls.hasRolled && !ls.winner
            ? 'border-amber-300/60 bg-amber-500/10'
            : 'border-white/10 bg-slate-900/70'
        }`}
      >
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
            {ls.winner ? 'Match over' : isMyTurn ? 'Your roll' : `${activeLudoPlayer?.name ?? COLOR_NAMES[ls.activeColor]} is up`}
          </span>
          <span className="text-sm font-black text-white block mt-0.5">
            {ls.winner
              ? `${COLOR_NAMES[ls.winner]} wins`
              : isMyTurn
              ? ls.hasRolled
                ? 'Pick a glowing token'
                : 'Tap the die to roll'
              : botRolling || activeLudoPlayer?.isAi
              ? 'Bot is thinking…'
              : 'Waiting for them…'}
          </span>
          <span className="text-[10px] font-bold text-slate-500 block mt-1">A six brings a token out and rolls again.</span>
        </div>
        <LudoDice
          value={ls.diceValue ?? ls.lastRoll ?? null}
          isRolling={botRolling || myRolling}
          disabled={!isMyTurn || ls.hasRolled || Boolean(ls.winner)}
          ready={isMyTurn && !ls.hasRolled && !ls.winner}
          onRoll={handleRollDice}
        />
      </div>

      {/* Victory Celebration Modal */}
      {ls.winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="glass-card rounded-3xl p-6 border-2 border-amber-400 max-w-sm w-full text-center space-y-4 bg-slate-900 shadow-2xl">
            <Trophy className="w-16 h-16 text-amber-400 mx-auto animate-bounce" />
            <h2 className="text-2xl font-black text-white uppercase">VICTORY!</h2>
            <p className="text-sm text-slate-300">
              <span className="font-black text-amber-300">{COLOR_NAMES[ls.winner].toUpperCase()}</span> has brought all tokens home and won the match!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
