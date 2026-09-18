'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { speechEngine, type SpeechError } from '@/lib/speechService';

/**
 * Somewhere to find out the microphone is broken that is not a scored round.
 *
 * Half this game is voice, and until now the first thing that told a player
 * their mic was blocked was a mini-game they had just scored zero in. The
 * server no longer charges a life for that (see forgiveMicFault), but not
 * being punished for a round you could not play is a poor substitute for
 * playing it — and the grace runs out after two.
 *
 * Deliberately behind a button rather than always running. The lobby is
 * already busy, and holding the microphone open while six people pick avatars
 * is both rude and pointless.
 */

/**
 * Peak level that counts as "that was a voice".
 *
 * The meter reports 0-100 from an average over the frequency bins. Room noise
 * and a muted-at-OS-level mic sit in the low single digits; anyone actually
 * speaking goes well past this. Set where it is so the check cannot be passed
 * by a fan or a hiss, which would be worse than no check at all.
 */
const HEARD_THRESHOLD = 25;

type Verdict = 'idle' | 'listening' | 'heard' | 'too-quiet' | 'error';

export default function MicCheck() {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [error, setError] = useState<SpeechError | null>(null);
  const peakRef = useRef(0);

  const stop = useCallback(() => {
    // No keepStream: hand the device back, or the voice call starts the match
    // fighting this check for the same microphone.
    speechEngine.stopAudioAnalyser();
    peakRef.current = 0;
    setLevel(0);
    setPeak(0);
  }, []);

  useEffect(() => {
    if (!open) return;

    setError(null);
    peakRef.current = 0;
    setPeak(0);

    void speechEngine.startAudioAnalyser(
      (vol) => {
        setLevel(vol);
        // Peak is what gives an answer. A bar that moves tells a player their
        // mic is live only if they happen to be watching at the right moment;
        // the high-water mark is still there when they look up.
        if (vol > peakRef.current) {
          peakRef.current = vol;
          setPeak(vol);
        }
      },
      (err) => setError(err)
    );

    return stop;
  }, [open, stop]);

  const verdict: Verdict = error
    ? 'error'
    : !open
      ? 'idle'
      : peak >= HEARD_THRESHOLD
        ? 'heard'
        : peak > 0
          ? 'too-quiet'
          : 'listening';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-partyCyan/30 bg-partyCyan/10 hover:bg-partyCyan/20 px-4 py-3 flex items-center justify-center gap-2 text-partyCyan font-black text-xs uppercase tracking-wider transition-all active:scale-[0.99]"
      >
        <Mic className="w-4 h-4" /> Check my mic before we start
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-partyCyan/40 bg-partyDark/70 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-partyCyan">
            Microphone check
          </span>
          <p className="text-xs text-gray-400">
            {verdict === 'heard'
              ? 'You are good to go.'
              : verdict === 'error'
                ? 'The microphone could not start.'
                : 'Say something — "testing, testing".'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close microphone check"
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {verdict === 'error' ? (
        <p className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/40 p-3 text-xs font-bold text-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {/* Already written for a player rather than a developer — it names the
              padlock, the setting, or the browser to switch to. */}
          <span>{error?.message}</span>
        </p>
      ) : (
        <>
          <div
            className="h-3 w-full rounded-full bg-black/50 border border-white/10 overflow-hidden"
            role="meter"
            aria-valuenow={level}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Microphone input level"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-75 ${
                level >= HEARD_THRESHOLD ? 'bg-emerald-400' : 'bg-partyYellow'
              }`}
              style={{ width: `${level}%` }}
            />
          </div>

          <p
            className={`flex items-center gap-2 text-xs font-black ${
              verdict === 'heard' ? 'text-emerald-300' : 'text-gray-400'
            }`}
          >
            {verdict === 'heard' ? (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" /> HEARD YOU — MIC IS WORKING
              </>
            ) : verdict === 'too-quiet' ? (
              <>
                <MicOff className="w-4 h-4 shrink-0" /> Barely picking you up. Move closer, or
                check the mic is not muted.
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 shrink-0 animate-pulse" /> Listening…
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
