'use client';

// Plays back the attempt the room just heard.
//
// This is the payoff of the Roast Lounge: the joke lands on the second listen,
// when everyone knows what is coming. Without it the funniest moment of the
// night exists for eight seconds and is gone.

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, MicOff, AudioLines } from 'lucide-react';
import { VoiceClip } from '@/hooks/useVoiceRecorder';

interface VoiceReplayProps {
  clip: VoiceClip | null;
  performerName: string;
  /** Shown instead of the player when there is nothing to replay. */
  emptyHint?: string;
  compact?: boolean;
}

export default function VoiceReplay({ clip, performerName, emptyHint, compact = false }: VoiceReplayProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [plays, setPlays] = useState(0);

  // A new clip means a new turn — drop the old playback state.
  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setPlays(0);
  }, [clip?.url]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    el.currentTime = 0;
    void el.play().catch(() => setPlaying(false));
  };

  const replay = () => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => setPlaying(false));
  };

  if (!clip) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center gap-2.5 text-gray-400">
        <MicOff className="w-4 h-4 shrink-0" />
        <p className="text-xs font-bold">{emptyHint ?? 'No replay captured for this round.'}</p>
      </div>
    );
  }

  const seconds = Math.max(1, Math.round(clip.durationMs / 1000));

  return (
    <div
      className={`rounded-2xl border border-partyCyan/40 bg-gradient-to-r from-partyPurple/30 to-white/5 ${
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5'
      }`}
    >
      <audio
        ref={audioRef}
        src={clip.url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setPlays((n) => n + 1);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration && Number.isFinite(el.duration)) {
            setProgress((el.currentTime / el.duration) * 100);
          }
        }}
      />

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center font-black transition-all shadow-lg ${
            playing
              ? 'bg-partyYellow text-partyDark scale-105'
              : 'bg-emerald-500 text-partyDark hover:scale-105 glow-emerald'
          }`}
          aria-label={playing ? 'Pause replay' : 'Play replay'}
        >
          {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <AudioLines className={`w-3.5 h-3.5 text-partyCyan ${playing ? 'animate-pulse' : ''}`} />
            <p className="text-[11px] font-black text-white uppercase tracking-wider truncate">
              {performerName}&apos;s attempt · {seconds}s
            </p>
          </div>

          <div className="mt-1.5 h-2 rounded-full bg-partyDark/80 overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 via-partyYellow to-terracotta transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>

          {plays > 0 && (
            <p className="text-[10px] text-gray-400 mt-1">
              Played {plays}× {plays >= 3 ? '— somebody is enjoying this 😭' : ''}
            </p>
          )}
        </div>

        <button
          onClick={replay}
          className="shrink-0 px-2.5 py-2 rounded-xl glass-pill text-partyCyan hover:text-white border border-white/15 transition-all"
          title="Play it again"
          aria-label="Play again"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
