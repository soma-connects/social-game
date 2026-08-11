'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight, Dices, Sparkles } from 'lucide-react';
import { MapTheme, Player, RoomState } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import confetti from 'canvas-confetti';
import AvatarIllustration from './AvatarIllustration';
import MapRenderer from './MapRenderer';
import { TOTAL_TILES } from '@/lib/gameRules';

interface RoadmapBoardProps {
  room: RoomState;
  activePlayer: Player;
  /** Only the player whose turn it is may reveal their move. */
  canRoll: boolean;
  onTriggerDare: (targetPlayer: Player) => void;
  onNextTurn: () => void;
}

export default function RoadmapBoard({ room, activePlayer, canRoll, onTriggerDare, onNextTurn }: RoadmapBoardProps) {
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);
  const [tileMessage, setTileMessage] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);

  // A new turn resets the dice.
  useEffect(() => {
    setDiceValue(null);
    setIsRolling(false);
    setHasRolled(false);
    setTileMessage('');
    setBanner(null);
    setRollError(null);
  }, [room.activePlayerIndex]);

  const rollDice = async () => {
    if (isRolling || hasRolled || !canRoll) return;

    setIsRolling(true);
    setRollError(null);
    audioSFX.playDiceRoll();

    // Not a random roll — the server returns the movement this player earned in
    // the mini-game. The delay is only so the dice animation has time to play.
    const [result] = await Promise.all([
      roomStore.rollDice(room.roomId),
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]);

    setIsRolling(false);

    if (result.error || result.roll === null) {
      setRollError(result.error ?? 'The roll did not go through. Try again.');
      return;
    }

    setDiceValue(result.roll);
    setHasRolled(true);

    const outcome = result.outcome;
    if (!outcome) return;

    setBanner(outcome.banner);
    setTileMessage(outcome.message);

    if (outcome.banner?.includes('FINISH')) {
      audioSFX.playChoiSuccess();
      confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
    } else if (outcome.banner?.includes('BOOST')) {
      audioSFX.playPowerUpZap();
    } else if (outcome.banner?.includes('DEBUFF')) {
      audioSFX.playWhaalaFailure();
    }

    if (outcome.triggersDare) {
      audioSFX.playNollywoodBrass();
      const opponents = room.players.filter((p) => p.id !== activePlayer.id);
      if (opponents.length > 0) {
        const target = opponents[Math.floor(Math.random() * opponents.length)];
        setTimeout(() => onTriggerDare(target), 1200);
      }
    }
  };

  const currentTheme: MapTheme = room.theme || 'forest';
  const earnedSteps = room.turnResult?.steps ?? null;

  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-4 py-3 space-y-4 relative pb-28">
      {/* Background Ambient Glow */}
      <div className="absolute top-10 left-1/4 w-72 h-72 bg-cyan-500/15 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-partyYellow/15 blur-3xl rounded-full pointer-events-none" />

      {/* Dynamic Event Banner */}
      {banner && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-partyYellow via-terracotta to-partyPink text-partyDark font-black text-center text-sm sm:text-base tracking-wide shadow-2xl border border-partyYellow animate-bounce z-20 relative">
          ⚡ {banner}
        </div>
      )}

      {tileMessage && !banner && (
        <div className="p-3 rounded-2xl bg-cyan-950/80 border border-partyCyan/40 text-center text-xs sm:text-sm font-bold text-partyCyan animate-fadeIn z-20 relative backdrop-blur-md">
          {tileMessage}
        </div>
      )}

      {rollError && (
        <div className="p-3 rounded-2xl bg-red-500/20 border border-red-500/50 text-center text-xs font-bold text-red-300 z-20 relative">
          {rollError}
        </div>
      )}

      {/* Main Clean 3D Map Renderer */}
      <MapRenderer
        theme={currentTheme}
        players={room.players}
        activePlayerId={activePlayer.id}
        totalTiles={TOTAL_TILES}
      />

      {/* STICKY FLOATING ACTION BUTTON (FAB) IN THE MIDDLE AT THE BOTTOM — MOBILE OPTIMIZED! */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs px-4 flex flex-col items-center gap-2">
        {!hasRolled ? (
          <button
            onClick={rollDice}
            disabled={isRolling || !canRoll}
            className={`w-full py-4 px-6 rounded-full font-black text-base flex items-center justify-center gap-3 shadow-2xl transition-all transform active:scale-95 border ${
              !canRoll
                ? 'bg-gray-800 text-gray-400 border-gray-700 opacity-60 cursor-not-allowed'
                : isRolling
                ? 'bg-partyYellow text-partyDark border-partyYellow animate-pulse'
                : 'bg-gradient-to-r from-partyYellow via-terracotta to-partyPink text-partyDark border-partyYellow hover:scale-105 glow-yellow'
            }`}
          >
            <Dices className={`w-6 h-6 ${isRolling ? 'animate-spin' : ''}`} />
            <span>{isRolling ? 'ROLLING DICE…' : !canRoll ? 'WAITING FOR TURN…' : 'ROLL DICE'}</span>
          </button>
        ) : (
          canRoll && (
            <button
              onClick={onNextTurn}
              className="w-full py-4 px-6 rounded-full bg-emerald-500 hover:bg-emerald-400 text-partyDark font-black text-base flex items-center justify-center gap-3 shadow-2xl transition-all transform hover:scale-105 active:scale-95 border border-emerald-300 glow-emerald"
            >
              <span>NEXT TURN</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          )
        )}

        {earnedSteps !== null && !hasRolled && canRoll && (
          <span className="bg-slate-900/90 text-emerald-400 border border-emerald-500/40 text-[10px] font-black px-3 py-1 rounded-full shadow-lg backdrop-blur-md">
            🎯 Mini-Game Score Earned {earnedSteps} Step{earnedSteps === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
}
