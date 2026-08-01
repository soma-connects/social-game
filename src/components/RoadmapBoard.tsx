'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { MapTheme, Player, RoomState } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import confetti from 'canvas-confetti';
import AvatarIllustration from './AvatarIllustration';
import Dice3D from './Dice3D';
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
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6 relative">
      <div className="absolute top-10 left-1/4 w-72 h-72 bg-purple-600/25 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-partyPink/20 blur-3xl rounded-full pointer-events-none" />

      {/* Board Controls & 3D Dice */}
      <div className="glass-card rounded-3xl p-6 border border-partyPink/40 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden backdrop-blur-xl bg-slate-900/70">
        <div className="flex items-center gap-4">
          <AvatarIllustration avatar={activePlayer.avatar} size="lg" />
          <div>
            <span className="text-[10px] text-partyYellow font-black uppercase tracking-wider block">
              ROADMAP BOARD TURN
            </span>
            <h3 className="font-extrabold text-2xl text-white">{activePlayer.name}</h3>
            <p className="text-xs text-partyCyan font-bold">
              Node #{activePlayer.boardPosition + 1} of {TOTAL_TILES} • {activePlayer.score} pts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center">
            <Dice3D value={diceValue} isRolling={isRolling} onClick={rollDice} disabled={hasRolled || !canRoll} />
            <span className="text-[10px] font-black text-partyYellow uppercase tracking-widest mt-1 text-center">
              {!canRoll ? 'WAITING…' : hasRolled ? 'MOVED!' : 'TAP TO REVEAL'}
            </span>
            {!hasRolled && canRoll && earnedSteps !== null && (
              <span className="text-[10px] text-emerald-400 font-bold mt-0.5">
                {earnedSteps} node{earnedSteps === 1 ? '' : 's'} earned
              </span>
            )}
          </div>

          {hasRolled && canRoll && (
            <button
              onClick={onNextTurn}
              className="bg-emerald-500 hover:bg-emerald-400 text-partyDark font-black text-base px-6 py-4 rounded-2xl shadow-xl transition-all glow-emerald flex items-center gap-2"
            >
              <span>NEXT TURN</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {rollError && (
        <div className="p-3 rounded-2xl bg-red-500/20 border border-red-500/50 text-center text-xs font-bold text-red-300">
          {rollError}
        </div>
      )}

      {banner && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-partyPurple via-partyPink to-terracotta text-white font-black text-center text-sm sm:text-base tracking-wide shadow-2xl border border-partyYellow animate-bounce">
          ⚡ {banner}
        </div>
      )}

      {tileMessage && !banner && (
        <div className="p-3.5 rounded-2xl bg-partyPurple/30 border border-partyCyan text-center text-xs sm:text-sm font-bold text-partyCyan animate-fadeIn">
          {tileMessage}
        </div>
      )}

      <MapRenderer
        theme={currentTheme}
        players={room.players}
        activePlayerId={activePlayer.id}
        totalTiles={TOTAL_TILES}
      />
    </div>
  );
}
