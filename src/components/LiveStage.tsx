'use client';

// What the room watches while somebody else is playing.
//
// Replaces a pushed summary with the game itself. When the performer is on the
// voice call their canvas arrives as video over the same peer connection their
// voice does, so the room sees the rocks falling and the bird flying rather
// than a line of text describing them. When they are not, this falls back to
// the state frames — and says so, rather than quietly showing less.

import React, { useEffect, useRef } from 'react';
import { Mic, Radio, AlertTriangle, Wifi } from 'lucide-react';
import { Player } from '@/lib/types';
import { MINIGAME_ICONS, MINIGAME_LABELS } from '@/lib/gameRules';
import { useLiveStage } from '@/hooks/useLiveStage';
import AvatarIllustration from './AvatarIllustration';

interface LiveStageProps {
  performer: Player;
  /** Shown before anything has arrived. */
  label: string;
}

export default function LiveStage({ performer, label }: LiveStageProps) {
  const { frame, via, fresh, video } = useLiveStage(performer.id);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.srcObject !== video) element.srcObject = video;
    if (video) {
      // Muted and inline, so mobile browsers will autoplay it — the audio for
      // this player is already coming through the voice call, and playing it
      // twice would echo.
      void element.play().catch(() => {
        /* autoplay refused; the poster state below still reads correctly */
      });
    }
  }, [video]);

  const game = frame?.game;
  const gameLabel =
    game && game !== 'other' && game !== 'karaoke'
      ? `${MINIGAME_ICONS[game]} ${MINIGAME_LABELS[game]}`
      : game === 'karaoke'
      ? '🎤 Karaoke'
      : label;

  const showVideo = !!video && fresh;

  return (
    <div className="glass-card rounded-3xl p-4 sm:p-6 border border-partyCyan/40 bg-slate-900/70 space-y-3 sm:space-y-4">
      {/* Who is on */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AvatarIllustration avatar={performer.avatar} size="md" isSpeaking={fresh} />
          <div className="min-w-0">
            <span className="text-[10px] text-partyCyan font-black uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="w-3 h-3 animate-pulse" /> WATCHING LIVE
            </span>
            <h3 className="font-extrabold text-base sm:text-lg text-white truncate">{performer.name}</h3>
            <p className="text-[11px] text-gray-400 truncate">{gameLabel}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {typeof frame?.score === 'number' && fresh && (
            <div className="text-right">
              <p className="text-[10px] font-black text-gray-400 uppercase leading-none">Score</p>
              <p className="text-xl sm:text-2xl font-black text-partyYellow tabular-nums leading-tight">
                {frame.score}
              </p>
            </div>
          )}
          {/* Honest about which path is carrying this. A summary once a second
              and a live mirror are very different things to be looking at. */}
          {fresh && (
            <span
              className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 ${
                via === 'mesh' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-400'
              }`}
              title={
                via === 'mesh'
                  ? 'Streaming directly from their device'
                  : 'Summary only — they are not on the voice call, so there is no direct link'
              }
            >
              <Wifi className="w-2.5 h-2.5" />
              {via === 'mesh' ? 'LIVE' : 'SUMMARY'}
            </span>
          )}
        </div>
      </div>

      {/* The game itself */}
      {showVideo ? (
        <div className="relative rounded-2xl overflow-hidden border-2 border-partyCyan/40 bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="w-full aspect-video object-contain bg-black"
          />
          {frame?.status && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 py-2">
              <p
                className={`text-xs sm:text-sm font-extrabold truncate ${
                  frame.good === false ? 'text-red-300' : frame.good ? 'text-emerald-300' : 'text-white'
                }`}
              >
                {frame.status}
              </p>
            </div>
          )}
        </div>
      ) : fresh && frame?.prompt ? (
        <div
          className={`rounded-2xl border-2 p-4 sm:p-5 text-center transition-colors ${
            frame.good === false
              ? 'bg-red-500/15 border-red-500/50'
              : frame.good
              ? 'bg-emerald-500/15 border-emerald-400/50'
              : 'bg-partyDark/80 border-partyYellow/40'
          }`}
        >
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">They have to</p>
          <p className="text-2xl sm:text-4xl font-black text-partyYellow drop-shadow break-words">
            {frame.prompt}
          </p>
          {frame.detail && <p className="text-xs text-partyCyan font-mono mt-1">{frame.detail}</p>}
          {frame.status && (
            <p
              className={`text-sm font-extrabold mt-2 ${
                frame.good === false ? 'text-red-300' : frame.good ? 'text-emerald-300' : 'text-white'
              }`}
            >
              {frame.status}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center space-y-2">
          <Mic className="w-8 h-8 text-gray-500 mx-auto animate-pulse" />
          <p className="text-sm font-bold text-gray-300">{label}</p>
          {frame && !fresh && (
            <p className="text-[11px] text-amber-300 flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Lost their signal for a moment…
            </p>
          )}
        </div>
      )}

      {/* Whatever this game counts down — lives, shields, waves. */}
      {fresh && frame?.meter && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0">
            {frame.meter.label}
          </span>
          <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-400 to-amber-300 transition-all duration-200"
              style={{
                width: `${Math.round(
                  (Math.max(0, Math.min(frame.meter.value, frame.meter.max)) / Math.max(1, frame.meter.max)) * 100
                )}%`,
              }}
            />
          </div>
          <span className="text-[11px] font-black text-white tabular-nums shrink-0">
            {frame.meter.value}/{frame.meter.max}
          </span>
        </div>
      )}

      {/* How far through the attempt they are */}
      {fresh && typeof frame?.progress === 'number' && (
        <div className="h-2 rounded-full bg-partyDark overflow-hidden border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-partyYellow to-terracotta transition-all duration-200"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, frame.progress)) * 100)}%` }}
          />
        </div>
      )}

      <p className="text-[10px] text-gray-500 text-center">
        Listen on the group call — react below while they go
      </p>
    </div>
  );
}
