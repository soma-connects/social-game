'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Dices } from 'lucide-react';
import { MapTheme, Player, RoomState } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import confetti from 'canvas-confetti';
import AvatarIllustration from './AvatarIllustration';
import MapRenderer from './MapRenderer';
import DiceRoller from './DiceRoller';
import TileEventOverlay from './TileEventOverlay';
import { TOTAL_TILES } from '@/lib/gameRules';

interface RoadmapBoardProps {
  room: RoomState;
  activePlayer: Player;
  /** Only the player whose turn it is may roll. */
  canRoll: boolean;
  onTriggerDare: (targetPlayer: Player) => void;
  onNextTurn: () => void;
}

export default function RoadmapBoard({ room, activePlayer, canRoll, onTriggerDare, onNextTurn }: RoadmapBoardProps) {
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  
  // Initialize from server state so we don't get trapped on refresh
  const serverHasRolled = room.roundResults?.find(r => r.playerId === activePlayer.id)?.rolled ?? false;
  const [hasRolled, setHasRolled] = useState(serverHasRolled);

  const [tileMessage, setTileMessage] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);
  const [preRollPosition, setPreRollPosition] = useState<number | null>(null);
  /** True between sending our roll and finishing its reveal animation. */
  const rollInFlight = useRef(false);

  // A new turn resets the dice.
  //
  // Keyed on the turn, NOT on `room.roundResults` — that array is rebuilt on
  // every Firestore snapshot, so any player's heartbeat used to re-run this and
  // wipe the landing banner out from under whoever was reading it.
  const turnKey = `${room.roundNumber ?? 0}:${room.rollIndex ?? 0}:${activePlayer.id}`;
  useEffect(() => {
    rollInFlight.current = false;
    setDiceValue(null);
    setIsRolling(false);
    setTileMessage('');
    setBanner(null);
    setShowOverlay(false);
    setRollError(null);
    setPreRollPosition(null);
  }, [turnKey]);

  // The server is the authority on whether this turn's roll already happened —
  // that has to survive a refresh mid-turn. But it marks the roll done the
  // instant the request lands, so it is ignored while our own dice and token
  // animation is still playing out.
  useEffect(() => {
    if (rollInFlight.current) return;
    setHasRolled(serverHasRolled);
  }, [turnKey, serverHasRolled]);

  const rollDice = async () => {
    if (isRolling || hasRolled || !canRoll) return;

    rollInFlight.current = true;
    setIsRolling(true);
    setRollError(null);
    setPreRollPosition(activePlayer.boardPosition);
    audioSFX.playDiceRoll();

    // Ask the server to roll random dice and resolve the landing tile.
    const result = await roomStore.rollDice(room.roomId);

    if (result.error || result.roll === null) {
      rollInFlight.current = false;
      setIsRolling(false);
      setRollError(result.error ?? 'The roll did not go through. Try again.');
      setPreRollPosition(null);
      return;
    }

    setDiceValue(result.roll);

    const outcome = result.outcome;
    if (!outcome && !result.waitingForBranch) {
      rollInFlight.current = false;
      setIsRolling(false);
      return;
    }

    // Hold the token in place while the dice lands, then let the map animate.
    const tokenMovementTime = result.roll * 500;
    setTimeout(() => {
      setIsRolling(false);
      setPreRollPosition(null);
    }, 1600);

    setTimeout(() => {
      rollInFlight.current = false;
      setHasRolled(true);
      if (result.waitingForBranch) return; // Branch UI will appear now

      setBanner(outcome.banner);
      setTileMessage(outcome.message);
      if (outcome.banner) setShowOverlay(true);

      if (outcome.banner?.includes('FINISH')) {
        audioSFX.playChoiSuccess();
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
      } else if (outcome.banner?.includes('WORMHOLE') || outcome.banner?.includes('SHIELD')) {
        audioSFX.playPowerUpZap();
      } else if (outcome.banner?.includes('ASTEROID')) {
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
    }, 1700 + tokenMovementTime);
  };

  const currentTheme: MapTheme = room.theme || 'forest';
  const earnedSteps = room.turnResult?.steps ?? null;

  return (
    <div className="max-w-5xl mx-auto px-2 sm:px-4 py-3 space-y-4 relative pb-28">
      {/* Background Ambient Glow */}
      <div className="absolute top-10 left-1/4 w-72 h-72 bg-cyan-500/15 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-partyYellow/15 blur-3xl rounded-full pointer-events-none" />

      {/* Board Background Music */}
      <audio src="/audios/maksymmalko-game-minecraft-gaming-background-music-402451.mp3" autoPlay loop className="hidden" />

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
        players={room.players.map(p =>
          (p.id === activePlayer.id && isRolling && preRollPosition !== null)
            ? { ...p, boardPosition: preRollPosition }
            : p
        )}
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
            <span>{isRolling ? 'ROLLING DICE...' : !canRoll ? 'WAITING FOR TURN...' : 'ROLL DICE'}</span>
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

        {/* DICE ROLLER OVERLAY */}
        {diceValue !== null && (
          <DiceRoller
            isRolling={isRolling}
            value={diceValue}
            onRollComplete={() => {}}
          />
        )}
      </div>

      {showOverlay && banner && tileMessage && (
        <TileEventOverlay
          banner={banner}
          message={tileMessage}
          onComplete={() => setShowOverlay(false)}
        />
      )}
    </div>
  );
}
