'use client';

// What everyone else sees while one player is on the mic.
//
// Replaces a static "waiting…" panel. The room is the audience — if they cannot
// see what the performer was asked to do, they cannot laugh at how it went, and
// the reaction buttons become meaningless clicks.
//
// This renders a pushed summary rather than a mirrored canvas. Room state moves
// on ~1.5s polling, so streaming frames would be a slideshow; what actually
// matters to a spectator is the prompt and whether it is going well.

import React from 'react';
import { Mic, Radio, AlertTriangle } from 'lucide-react';
import { LiveMiniGameState, Player } from '@/lib/types';
import { MINIGAME_ICONS, MINIGAME_LABELS } from '@/lib/gameRules';
import AvatarIllustration from './AvatarIllustration';
import { useCountdown } from '@/hooks/useCountdown';

interface SpectatorViewProps {
  activePlayer: Player;
  live: LiveMiniGameState | null;
  /** Fallback label when nothing has been reported yet. */
  label: string;
  /**
   * Epoch ms at which the room gives up on this performer and moves on.
   *
   * Spectators used to be told only that the signal had been lost, with no way
   * to tell a player thinking hard from a player who had gone for good — so the
   * honest read was always "this room is broken". The server does move on now;
   * this lets the room see it coming instead of guessing.
   */
  movingOnAt?: number | null;
}

/** Close enough that a waiting room wants the number rather than the reassurance. */
const SHOW_COUNTDOWN_WITHIN_MS = 90_000;

/** Older than this and the performer has probably stalled or dropped. */
const STALE_MS = 6000;

export default function SpectatorView({ activePlayer, live, label, movingOnAt }: SpectatorViewProps) {
  const fresh = !!live && live.playerId === activePlayer.id && Date.now() - (live.at ?? 0) < STALE_MS;
  const game = live?.game;

  // Only once the performer has actually gone quiet: a countdown running under
  // somebody who is mid-attempt would read as a threat rather than an update.
  const secondsLeft = useCountdown(movingOnAt, SHOW_COUNTDOWN_WITHIN_MS);
  const showCountdown = !fresh && secondsLeft !== null;

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-6 border border-partyCyan/40 bg-slate-900/70 space-y-4">
      {/* Who is on */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AvatarIllustration avatar={activePlayer.avatar} size="md" isSpeaking={fresh} />
          <div className="min-w-0">
            <span className="text-[10px] text-partyCyan font-black uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="w-3 h-3 animate-pulse" /> WATCHING LIVE
            </span>
            <h3 className="font-extrabold text-lg text-white truncate">{activePlayer.name}</h3>
            <p className="text-[11px] text-gray-400">
              {game ? `${MINIGAME_ICONS[game]} ${MINIGAME_LABELS[game]}` : label}
            </p>
          </div>
        </div>

        {typeof live?.score === 'number' && fresh && (
          <div className="text-right shrink-0">
            <p className="text-[10px] font-black text-gray-400 uppercase">Score</p>
            <p className="text-2xl font-black text-partyYellow">{live.score}</p>
          </div>
        )}
      </div>

      {/* The prompt they are facing */}
      {fresh && live?.prompt ? (
        <div
          className={`rounded-2xl border-2 p-5 text-center transition-colors ${
            live.good === false
              ? 'bg-red-500/15 border-red-500/50'
              : live.good
              ? 'bg-emerald-500/15 border-emerald-400/50'
              : 'bg-partyDark/80 border-partyYellow/40'
          }`}
        >
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            They have to
          </p>
          <p className="text-3xl sm:text-4xl font-black text-partyYellow drop-shadow break-words">
            {live.prompt}
          </p>
          {live.detail && <p className="text-xs text-partyCyan font-mono mt-1">{live.detail}</p>}
          {live.status && (
            <p
              className={`text-sm font-extrabold mt-2 ${
                live.good === false ? 'text-red-300' : live.good ? 'text-emerald-300' : 'text-white'
              }`}
            >
              {live.status}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center space-y-2">
          <Mic className="w-8 h-8 text-gray-500 mx-auto animate-pulse" />
          <p className="text-sm font-bold text-gray-300">{label}</p>
          {live && !fresh && !showCountdown && (
            <p className="text-[11px] text-amber-300 flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Lost their signal for a moment…
            </p>
          )}
          {showCountdown && (
            <p className="text-[11px] text-amber-300 flex items-center justify-center gap-1.5 font-bold">
              <AlertTriangle className="w-3 h-3" />
              No answer — moving on in {secondsLeft}s
            </p>
          )}
        </div>
      )}

      {/* How far through the attempt they are */}
      {fresh && typeof live?.progress === 'number' && (
        <div className="h-2 rounded-full bg-partyDark overflow-hidden border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-partyYellow to-terracotta transition-all duration-500"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, live.progress)) * 100)}%` }}
          />
        </div>
      )}

      <p className="text-[10px] text-gray-500 text-center">
        Listen on the group call — react below while they go
      </p>
    </div>
  );
}
