'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RoomState, Player } from '@/lib/types';
import { roomStore } from '@/lib/roomStore';
import { chooseBestLudoMove } from '@/lib/ludo/ludoRules';
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
  const [isBotProcessing, setIsBotProcessing] = useState(false);

  // Music, including its mute button, is handled by BackgroundMusic below. The
  // local copy that used to live here only muted this one screen and forgot the
  // choice the moment you left it.

  // Find my color slot
  const myLudoPlayer = ls?.players.find((p) => p.playerId === myPlayer.id);
  const myColor = myLudoPlayer?.color;
  const isMyTurn = myColor === ls?.activeColor;

  // Active player in Ludo
  const activeLudoPlayer = ls?.players.find((p) => p.color === ls.activeColor);
  const isBotTurn = activeLudoPlayer?.isAi;

  // Automated Bot Turn Logic
  useEffect(() => {
    if (!ls || !isBotTurn || ls.winner || isBotProcessing) return;

    setIsBotProcessing(true);

    if (!ls.hasRolled) {
      // Bot rolls dice
      const rollTimer = setTimeout(async () => {
        try {
          audioSFX.playDiceRoll();
          await roomStore.rollLudoDice(roomId);
        } catch (e) {
          console.error('Bot roll failed:', e);
        } finally {
          setIsBotProcessing(false);
        }
      }, 1000);
      return () => clearTimeout(rollTimer);
    } else if (ls.diceValue) {
      // Bot chooses and moves token
      const moveTimer = setTimeout(async () => {
        try {
          const myTokens = ls.tokens[ls.activeColor];
          const best = chooseBestLudoMove(myTokens, ls.diceValue!, ls.tokens);
          if (best) {
            audioSFX.playChoiSuccess();
            await roomStore.moveLudoToken(roomId, best.id);
          }
        } catch (e) {
          console.error('Bot move failed:', e);
        } finally {
          setIsBotProcessing(false);
        }
      }, 900);
      return () => clearTimeout(moveTimer);
    }
  }, [ls?.activeColor, ls?.hasRolled, ls?.diceValue, isBotTurn, ls?.winner, roomId, isBotProcessing]);

  if (!ls) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center glass-card rounded-2xl">
        <p className="text-amber-400 font-bold">Connecting to Ludo Arena...</p>
      </div>
    );
  }

  const handleRollDice = async () => {
    if (!isMyTurn || ls.hasRolled) return;
    await roomStore.rollLudoDice(roomId);
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

        {/* The dice itself now lives in the middle of the board — see below. */}
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

      {/* Interactive 15x15 Ludo Board, with the dice floating in the middle.
          That is where a die lands on a real board and where everyone's eyes
          already are — parking it in the header above meant looking away from
          the board to roll, then back again to move. */}
      <div className="relative w-full max-w-[520px] mx-auto">
        <LudoBoard
          tokens={ls.tokens}
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
              isRolling={isBotProcessing}
              disabled={!isMyTurn || ls.hasRolled || Boolean(ls.winner)}
              onRoll={handleRollDice}
            />
          </div>
        </div>
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
