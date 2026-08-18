'use client';

import React, { useEffect, useState } from 'react';
import { MicOff } from 'lucide-react';
import { speechEngine } from '@/lib/speechService';
import { isMobileAudioPlatform, micStream } from '@/lib/micStream';

interface MicContentionNoticeProps {
  /** Whether a listenForSpeech session is currently meant to be running. */
  active: boolean;
  /**
   * Restarts the caller's own listening session.
   *
   * Claiming priority only takes effect for a session started after it, so the
   * caller has to redo its own `listenForSpeech` call — this component cannot
   * do that itself, every caller's options (targetWord, onResult) differ.
   */
  onClaimPriority: () => void;
}

/** How long a session may sit at zero results before this is shown. */
const STALL_MS = 6000;
const POLL_MS = 1500;

/**
 * Surfaces the one Android failure mode nine different voice mini-games share:
 * a live group call and the speech recogniser cannot use the microphone at
 * once, and the call wins by default (see micStream.ts). Only Asteroid Defense
 * had this affordance — every other voice-driven game just went silent on
 * Android with a call up, which is indistinguishable from "broken" to whoever
 * is holding the phone. One component, so the fix cannot drift out of sync
 * across the nine places it is needed again.
 */
export default function MicContentionNotice({ active, onClaimPriority }: MicContentionNoticeProps) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!active) {
      setStalled(false);
      return;
    }
    const timer = setInterval(() => {
      const d = speechEngine.getDiagnostics();
      const silentFor = d.startedAt ? Date.now() - d.startedAt : 0;
      setStalled(
        d.results === 0 &&
          silentFor > STALL_MS &&
          !d.suspendedMic &&
          micStream.isCallActive() &&
          isMobileAudioPlatform()
      );
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active]);

  if (!stalled) return null;

  return (
    <div className="rounded-lg border border-amber-500/50 bg-black/85 px-3 py-2 text-[10px] leading-relaxed text-amber-200">
      <p className="font-black tracking-wider">NOT HEARING YOU</p>
      <p className="text-amber-300/80">
        Your phone can only give the microphone to one thing at a time, and the voice call has it.
      </p>
      <button
        onClick={onClaimPriority}
        className="mt-2 w-full rounded-md border border-amber-400/60 bg-amber-400/15 px-3 py-2 text-[11px] font-black tracking-wide text-amber-100 active:scale-95"
      >
        LET THE GAME HEAR ME
        <span className="mt-0.5 block text-[9px] font-bold text-amber-300/70">
          Leaves the voice call until you are done here
        </span>
      </button>
    </div>
  );
}
