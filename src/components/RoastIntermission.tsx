'use client';

// 25-Second Open-Mic Roast Intermission ("Roast Lounge").
//
// After every mini-game turn, the room enters this 25-second intermission phase.
// All players' microphones stay active so everyone can laugh, roast, tease, or
// hype up the performer's attempt over live audio. Spectators can blast party
// SFX from the interactive soundboard and send floating reaction badges.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  Flame,
  Laugh,
  Sparkles,
  Theater,
  Volume2,
  Trophy,
  ArrowRight,
  Sparkle,
  Zap,
} from 'lucide-react';
import { Player, RoomState, SocialReactionId } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import { MINIGAME_FAIL_THRESHOLD, STARTING_LIVES, heatTier } from '@/lib/gameRules';
import { VoiceClip } from '@/hooks/useVoiceRecorder';
import AvatarIllustration from './AvatarIllustration';
import VoiceReplay from './VoiceReplay';

interface RoastIntermissionProps {
  room: RoomState;
  activePlayer: Player;
  myPlayer: Player;
  /** The attempt this client just captured, for the room to hear again. */
  replayClip: VoiceClip | null;
  onFinishRoast: () => void;
}

/** Long enough to actually replay the clip and then react to it. */
const ROAST_SECONDS = 25;

const SOUNDBOARD = [
  { id: 'horn', name: 'Danfo Horn', icon: '🎺', action: () => audioSFX.playStreetVendorBell() },
  { id: 'gen', name: 'Generator Rev', icon: '🚜', action: () => audioSFX.playGeneratorRev() },
  { id: 'bell', name: 'Vendor Bell', icon: '🔔', action: () => audioSFX.playStreetVendorBell() },
  { id: 'brass', name: 'Nollywood Brass', icon: '🎭', action: () => audioSFX.playNollywoodBrass() },
  { id: 'choi', name: 'Choi Chime', icon: '✨', action: () => audioSFX.playChoiSuccess() },
  { id: 'whaala', name: 'Whaala Buzzer', icon: '🚨', action: () => audioSFX.playWhaalaFailure() },
];

const REACTION_EMOJI: Record<SocialReactionId, string> = {
  laugh: '😂',
  fire: '🔥',
  almost: '👏',
  drama: '🎭',
};

const REACTION_BUTTONS: {
  id: SocialReactionId;
  label: string;
  badge: string;
  icon: string;
}[] = [
  { id: 'laugh', label: 'Try Again Boss', badge: '🤣 Flawless Comedy', icon: '😂' },
  { id: 'fire', label: 'Clean!', badge: '🔥 Fire Delivery', icon: '🔥' },
  { id: 'almost', label: 'Almost There', badge: '✨ Pure Vibe', icon: '👏' },
  { id: 'drama', label: 'Oscar Performance', badge: '🎭 Nollywood Legend', icon: '🎭' },
];

export default function RoastIntermission({
  room,
  activePlayer,
  myPlayer,
  replayClip,
  onFinishRoast,
}: RoastIntermissionProps) {
  const [timeLeft, setTimeLeft] = useState<number>(ROAST_SECONDS);
  const [busyReaction, setBusyReaction] = useState<string | null>(null);
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([]);
  /** Reaction ids already animated, so polling does not replay them each tick. */
  const seenReactionIds = useRef<Set<string>>(new Set());

  const isPerformer = activePlayer.id === myPlayer.id;
  const isHost = myPlayer.isHost;
  const turnResult = room.turnResult;
  const socialRound = room.socialRound;
  const reactions = socialRound?.reactions ?? [];

  // Keep the callback in a ref so the countdown effect has no changing
  // dependency — otherwise a re-render mid-roast restarts the countdown.
  const finishRef = useRef(onFinishRoast);
  finishRef.current = onFinishRoast;

  // Countdown. Runs once per performer, not once per render.
  //
  // Everyone runs the same clock so the room sees the same numbers, but only
  // the performer's client sends the "roast over" request — the server accepts
  // a turn ending from the active player alone, so the other five would be
  // rejected and each would surface an error.
  useEffect(() => {
    setTimeLeft(ROAST_SECONDS);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (isPerformer) finishRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activePlayer.id, isPerformer]);

  const triggerSound = (action: () => void) => {
    action();
  };

  const spawnEmoji = useCallback((emoji: string) => {
    const id = Date.now() + Math.random();
    setFloatingEmojis((prev) => [...prev, { id, emoji, x: Math.random() * 80 + 10 }]);
    window.setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
    }, 2000);
  }, []);

  // Float an emoji for reactions arriving from *other* players too. Without
  // this the laugh meter only animates for whoever tapped, so nobody sees the
  // room react — which is the whole point of the meter.
  useEffect(() => {
    for (const reaction of reactions) {
      if (seenReactionIds.current.has(reaction.id)) continue;
      seenReactionIds.current.add(reaction.id);
      // Skip our own — those already floated optimistically on tap.
      if (reaction.voterId === myPlayer.id) continue;
      spawnEmoji(REACTION_EMOJI[reaction.reaction]);
    }
  }, [reactions, myPlayer.id, spawnEmoji]);

  const handleSendReaction = async (reactionId: SocialReactionId, emoji: string) => {
    if (isPerformer || busyReaction) return;
    setBusyReaction(reactionId);

    spawnEmoji(emoji); // optimistic, so the tap feels instant
    await roomStore.addSocialReaction(
      room.roomId,
      reactionId,
      myPlayer.id,
      myPlayer.name,
      activePlayer.id
    );
    setBusyReaction(null);
  };

  const timerPct = Math.round((timeLeft / ROAST_SECONDS) * 100);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 relative overflow-hidden">
      {/* Floating Emojis Overlay */}
      {floatingEmojis.map(({ id, emoji, x }) => (
        <div
          key={id}
          className="absolute z-50 text-4xl animate-floatUp pointer-events-none drop-shadow-lg"
          style={{ left: `${x}%`, bottom: '18%' }}
        >
          {emoji}
        </div>
      ))}

      {/* Top Banner & Timer */}
      <div className="glass-card rounded-3xl p-6 border border-partyYellow/50 text-center relative overflow-hidden backdrop-blur-xl bg-slate-900/85 space-y-5 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-left">
            <AvatarIllustration avatar={activePlayer.avatar} size="lg" isSpeaking />
            <div>
              <span className="text-[10px] font-black text-partyYellow uppercase tracking-widest block animate-pulse">
                🎙️ OPEN MIC ROAST LOUNGE
              </span>
              <h3 className="font-extrabold text-2xl text-white">{activePlayer.name}&apos;s Turn Recap</h3>
              <p className="text-xs text-partyCyan font-bold">
                {turnResult ? `${turnResult.pointsEarned} points banked • ${turnResult.steps} steps earned` : 'Voice round complete'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-5 py-2.5 rounded-2xl bg-partyDark border border-partyYellow/50 font-mono font-black text-2xl text-partyYellow flex items-center gap-2 glow-yellow animate-pulse">
              <Clock className="w-6 h-6 text-partyYellow" />
              <span>00:{String(timeLeft).padStart(2, '0')}</span>
            </div>
          </div>
        </div>

        {/* The replay — the reason the roast is funny. Sits above everything
            else so the room hears the attempt before reacting to it. */}
        <VoiceReplay
          clip={replayClip}
          performerName={activePlayer.name}
          emptyHint={
            isPerformer
              ? 'Your attempt was not captured — check the mic is on.'
              : `Join the voice call to capture ${activePlayer.name}'s attempts.`
          }
        />

        {/* Progress timer bar */}
        <div className="w-full bg-partyDark h-3 rounded-full overflow-hidden border border-white/10 p-0.5">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-partyYellow to-terracotta rounded-full transition-all duration-1000"
            style={{ width: `${timerPct}%` }}
          />
        </div>

        <p className="text-xs text-gray-300 font-bold bg-white/5 py-2 px-4 rounded-xl border border-white/10 inline-block">
          🎙️ Live mics stay open! Laugh at each other&apos;s flaws, tease the accent, and blast the soundboard!
        </p>

        {/* Where the streak stands after that round.
            This is the beat where momentum is won or lost, so it gets its own
            line rather than being buried in the event feed the room is not
            reading mid-roast. */}
        {(() => {
          const streak = activePlayer.streak ?? 0;
          if (streak >= 2) {
            const tier = heatTier(streak);
            return (
              <div
                className="rounded-2xl px-4 py-2.5 border-2 font-black text-sm inline-flex items-center gap-2 animate-pulse"
                style={{ color: tier.color, borderColor: tier.color, backgroundColor: `${tier.color}1A` }}
              >
                {tier.icon} {tier.label.toUpperCase()} — {streak} IN A ROW · x{tier.multiplier} COINS
              </div>
            );
          }
          // Only worth calling out a break where there was something to break.
          if (streak === 0 && (activePlayer.bestStreak ?? 0) >= 2) {
            return (
              <div className="rounded-2xl px-4 py-2.5 border-2 border-sky-400/60 bg-sky-500/10 text-sky-300 font-black text-sm inline-flex items-center gap-2">
                💧 STREAK BROKEN — back to zero
              </div>
            );
          }
          return null;
        })()}

        {/* Turn Performance & Badges Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
          <div className="glass-pill rounded-2xl p-4 border border-partyYellow/30 space-y-1">
            <span className="text-[10px] font-black text-partyYellow uppercase">Skill Points</span>
            <p className="text-2xl font-black text-white">{turnResult?.pointsEarned ?? 0} PTS</p>
            <p className="text-[11px] text-gray-400">Earned from mini-game performance</p>
          </div>

          <div className="glass-pill rounded-2xl p-4 border border-partyCyan/30 space-y-1">
            <span className="text-[10px] font-black text-partyCyan uppercase">Social Vibe Bonus</span>
            <p className="text-2xl font-black text-partyCyan">+{activePlayer.vibeScore ?? 0} VIBES</p>
            <p className="text-[11px] text-gray-400">From crowd reactions & votes</p>
          </div>

          <div className="glass-pill rounded-2xl p-4 border border-purple-400/30 space-y-1">
            <span className="text-[10px] font-black text-purple-300 uppercase">Voice Badge</span>
            <div className="flex items-center gap-1.5 pt-0.5">
              <Trophy className="w-4 h-4 text-partyYellow shrink-0" />
              <p className="text-xs font-black text-white truncate">
                {activePlayer.badges?.[activePlayer.badges.length - 1] ?? 'Nollywood Vibe'}
              </p>
            </div>
            <p className="text-[11px] text-gray-400">Level {activePlayer.level ?? 1} Performer</p>
          </div>
        </div>

        {/* Bombing the task costs a life, so say so here rather than leaving it
            to a heart quietly going dark in the sidebar. */}
        {(room.roomType ?? 'board_game') !== 'team_battle' &&
          turnResult !== null &&
          turnResult !== undefined &&
          turnResult.performance <= MINIGAME_FAIL_THRESHOLD && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-left">
              <p className="text-sm font-black text-red-300">
                {(activePlayer.lives ?? STARTING_LIVES) === STARTING_LIVES && activePlayer.boardPosition === 0
                  ? '☠️ WIPED OUT — back to the launchpad with a fresh bar'
                  : `💔 BOMBED IT — ${activePlayer.lives ?? STARTING_LIVES} ${
                      (activePlayer.lives ?? STARTING_LIVES) === 1 ? 'life' : 'lives'
                    } left`}
              </p>
              <p className="text-[11px] text-red-200/70 mt-0.5">
                Lose them all and you restart from the beginning — the points stay, the road does not.
              </p>
            </div>
          )}

        {/* Interactive Soundboard Pad */}
        <div className="space-y-2 pt-2 text-left">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
            🔊 LIVE PARTY SOUNDBOARD (TAP TO BLAST OVER MIC):
          </span>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {SOUNDBOARD.map((item) => (
              <button
                key={item.id}
                onClick={() => triggerSound(item.action)}
                className="glass-pill hover:bg-white/20 active:scale-95 text-white font-extrabold text-xs py-3 px-2 rounded-xl border border-white/20 flex flex-col items-center justify-center gap-1 transition-all shadow-md"
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-[10px] truncate w-full text-center">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Social Reaction Buttons */}
        {!isPerformer && (
          <div className="space-y-2 pt-2 text-left">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
              🤣 REACT TO THIS ROUND:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {REACTION_BUTTONS.map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => handleSendReaction(btn.id, btn.icon)}
                  className="glass-pill hover:bg-partyYellow/20 active:scale-95 text-white font-bold text-xs py-3 px-3 rounded-2xl border border-partyYellow/40 flex items-center justify-between gap-2 transition-all shadow-lg"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{btn.icon}</span>
                    <span>{btn.label}</span>
                  </span>
                  <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-mono text-partyYellow font-black">
                    +{reactions.filter((r) => r.reaction === btn.id).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Proceed / Skip Control — the performer's call, so only they see it. */}
        <div className="pt-3">
          {isPerformer ? (
            <button
              onClick={onFinishRoast}
              className="w-full bg-gradient-to-r from-emerald-500 via-partyYellow to-emerald-400 text-partyDark font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] shadow-2xl glow-emerald"
            >
              <span>PROCEED TO POWER-UP SHOP &amp; ROADMAP BOARD</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <p className="text-center text-xs font-bold text-gray-400 py-4">
              Keep reacting — {activePlayer.name} moves the room on when the clock runs out.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
