'use client';

// Karaoke — Solfège rounds.
//
// Call and response: the tonic is played, a syllable is named, and the player
// has a few seconds to find that interval and hold it. Scored on how much of
// the window they spent on pitch rather than whether they hit it instantly,
// because a voice sliding off a held note is the entertaining part.
//
// Uses no speech recognition at all, which is why it works where the Voice
// Arena struggles — there is nothing to transcribe, only a frequency to measure.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Music,
  Mic,
  Volume2,
  ArrowRight,
  AlertTriangle,
  Play,
  ChevronUp,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Player } from '@/lib/types';
import { usePitchDetection } from '@/hooks/usePitchDetection';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import {
  CLOSE_CENTS,
  GRACE_SECONDS,
  HOLD_SECONDS,
  PERFECT_CENTS,
  ROUNDS_PER_TURN,
  SolfegeDegree,
  centsError,
  classify,
  directionFor,
  pickRound,
  scoreRound,
  targetFrequency,
  verdictFor,
} from '@/lib/solfege';

/**
 * Cents shown top-to-bottom on the meter.
 *
 * A minor third either way. The first version spanned half an octave, which
 * made a wildly wrong note and a slightly wrong one look nearly identical.
 */
const METER_RANGE = 300;
import AvatarIllustration from './AvatarIllustration';

interface SolfegeGameProps {
  player: Player;
  /** Needed so spectators can be shown what is happening. */
  roomId: string;
  onComplete: (score: number) => void;
}

type Stage = 'calibrating' | 'listen' | 'sing' | 'verdict' | 'finished';

export default function SolfegeGame({ player, roomId, onComplete }: SolfegeGameProps) {
  const { pitch, volume, isCalibrated, isActive, getRange, startCalibration, stopDetection } =
    usePitchDetection();

  const [stage, setStage] = useState<Stage>('calibrating');
  const [micError, setMicError] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [target, setTarget] = useState<{ tonic: number; degree: SolfegeDegree } | null>(null);
  const [liveCents, setLiveCents] = useState<number | null>(null);
  const [listenPhase, setListenPhase] = useState<'tonic' | 'target'>('tonic');
  const [holdLeft, setHoldLeft] = useState(HOLD_SECONDS);
  const [verdict, setVerdict] = useState<{ text: string; points: number; accuracy: number } | null>(null);

  // Sampled while the player holds the note. A ref, because the sampling loop
  // must not re-render on every frame.
  const samplesRef = useRef<number[]>([]);
  const pitchRef = useRef(0);
  // Displayed position is smoothed separately from the scored samples: scoring
  // wants the raw truth, the eye wants something that does not vibrate.
  const smoothCentsRef = useRef<number | null>(null);
  const targetRef = useRef<{ tonic: number; degree: SolfegeDegree } | null>(null);
  const stopToneRef = useRef<() => void>(() => {});
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  pitchRef.current = pitch;
  targetRef.current = target;

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await startCalibration();
      if (!cancelled && !ok) setMicError(true);
    })();
    return () => {
      cancelled = true;
      clearTimers();
      stopToneRef.current();
      stopDetection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Round driver ──────────────────────────────────────────────────────────
  const beginRound = useCallback(() => {
    const round = pickRound(getRange(), targetRef.current?.degree.name);
    setTarget(round);
    setVerdict(null);
    setLiveCents(null);
    smoothCentsRef.current = null;
    samplesRef.current = [];
    setStage('listen');

    // Play the tonic to set the key, then play the actual note being asked for.
    //
    // The target used to be left unplayed, which turned every round into an
    // ear-training exam: work out where So sits above Do, then produce it. That
    // is a musician's task. Playing the note makes it imitation instead — you
    // copy what you just heard — which is what a party game should ask for.
    stopToneRef.current = audioSFX.playReferenceTone(round.tonic, 1.0);
    setListenPhase('tonic');

    later(() => {
      const hz = targetFrequency(round.tonic, round.degree.semitones);
      stopToneRef.current = audioSFX.playReferenceTone(hz, 1.2);
      setListenPhase('target');
    }, 1200);

    later(() => {
      setStage('sing');
      setHoldLeft(HOLD_SECONDS);
    }, 2700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getRange]);

  // Start the first round once calibration lands.
  useEffect(() => {
    if (isCalibrated && stage === 'calibrating') beginRound();
  }, [isCalibrated, stage, beginRound]);

  // Sampling + countdown while the player is holding the note.
  useEffect(() => {
    if (stage !== 'sing' || !target) return;

    const targetHz = targetFrequency(target.tonic, target.degree.semitones);
    const started = Date.now();

    const sampler = setInterval(() => {
      const cents = centsError(pitchRef.current, targetHz);
      const elapsed = (Date.now() - started) / 1000;

      // The first moment is not scored — everyone slides onto a note rather
      // than landing on it, and grading the search made this feel like a test.
      if (elapsed >= GRACE_SECONDS) samplesRef.current.push(cents);

      // Ease the marker toward the reading instead of snapping to it. The raw
      // signal is fine for scoring but jitters far too fast to read.
      if (Number.isFinite(cents)) {
        const prev = smoothCentsRef.current;
        smoothCentsRef.current = prev === null ? cents : prev + (cents - prev) * 0.28;
        setLiveCents(smoothCentsRef.current);
      } else {
        setLiveCents(null);
      }

      setHoldLeft(Math.max(0, HOLD_SECONDS - elapsed));

      if (elapsed >= HOLD_SECONDS) {
        clearInterval(sampler);
        const result = scoreRound(samplesRef.current);
        setTotalScore((s) => s + result.points);
        setVerdict({
          text: verdictFor(result.quality, result.bestCents),
          points: result.points,
          accuracy: result.accuracy,
        });
        if (result.quality === 'perfect') audioSFX.playChoiSuccess();
        else if (result.quality === 'miss') audioSFX.playWhaalaFailure();
        setStage('verdict');
      }
    }, 60);

    return () => clearInterval(sampler);
  }, [stage, target]);

  const nextRound = () => {
    const next = roundIndex + 1;
    if (next >= ROUNDS_PER_TURN) {
      setStage('finished');
      return;
    }
    setRoundIndex(next);
    beginRound();
  };

  // ── Mic refused ───────────────────────────────────────────────────────────
  if (micError) {
    return (
      <div className="glass-card rounded-3xl p-8 border border-amber-500/50 text-center space-y-4 bg-slate-900/70">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
        <h3 className="text-xl font-black text-white">MICROPHONE BLOCKED</h3>
        <p className="text-sm text-gray-300">
          Karaoke needs to hear you. Allow the microphone for this site, then reload.
        </p>
        <button
          onClick={() => onComplete(0)}
          className="bg-gray-700 hover:bg-gray-600 text-white font-black text-sm px-6 py-3 rounded-2xl"
        >
          SKIP THIS TURN
        </button>
      </div>
    );
  }

  const off = liveCents ?? 0;
  const quality = liveCents === null ? null : classify(liveCents);
  const direction = directionFor(liveCents ?? Number.POSITIVE_INFINITY);

  // Show the room the note being asked for and how it is going, so they can
  // hear the wobble and see the target at the same time.
  useEffect(() => {
    if (!target) return;
    roomStore.pushLiveState(roomId, player.id, {
      prompt: target.degree.name,
      detail: `round ${Math.min(roundIndex + 1, ROUNDS_PER_TURN)} of ${ROUNDS_PER_TURN}`,
      score: totalScore,
      progress: (roundIndex + (stage === 'verdict' ? 1 : 0)) / ROUNDS_PER_TURN,
      status:
        stage === 'listen'
          ? 'listening to the note…'
          : stage === 'sing'
          ? direction === 'hold'
            ? 'ON PITCH!'
            : direction === 'higher'
            ? 'too low…'
            : direction === 'lower'
            ? 'too high…'
            : 'silent'
          : verdict?.text,
      good: stage === 'sing' ? direction === 'hold' : verdict ? verdict.points >= 50 : undefined,
    });
  }, [target, stage, direction, totalScore, roundIndex, verdict, roomId, player.id]);

  // Marker position, inverted because higher pitch belongs at the top.
  const markerPct = Math.max(0, Math.min(100, 50 - (off / METER_RANGE) * 50));

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-6 border border-partyPink/40 bg-slate-900/70 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AvatarIllustration avatar={player.avatar} size="md" isSpeaking={stage === 'sing'} />
          <div className="min-w-0">
            <span className="text-[10px] text-partyPink font-black uppercase tracking-wider block">
              KARAOKE — SOLFÈGE
            </span>
            <h3 className="font-extrabold text-lg text-white truncate">{player.name}</h3>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-black text-gray-400 uppercase">Score</p>
          <p className="text-2xl font-black text-partyYellow">{totalScore}</p>
          <p className="text-[10px] text-gray-400">
            Round {Math.min(roundIndex + 1, ROUNDS_PER_TURN)}/{ROUNDS_PER_TURN}
          </p>
        </div>
      </div>

      {/* Calibration */}
      {stage === 'calibrating' && (
        <div className="py-10 text-center space-y-3">
          <Mic className="w-12 h-12 text-partyCyan mx-auto animate-pulse" />
          <h4 className="text-xl font-black text-white">FINDING YOUR RANGE…</h4>
          <p className="text-xs text-gray-300 max-w-sm mx-auto">
            Hum low, then slide up high. This sets the notes to <em>your</em> voice, so nobody is
            asked for a note they cannot reach.
          </p>
          {isActive && <p className="text-[11px] font-mono text-partyCyan">{Math.round(pitch)} Hz</p>}
        </div>
      )}

      {/* Listen: the key, then the note you will be asked to copy */}
      {stage === 'listen' && target && (
        <div className="py-10 text-center space-y-3 animate-fadeIn">
          <Volume2
            className={`w-12 h-12 mx-auto animate-pulse ${
              listenPhase === 'tonic' ? 'text-gray-400' : 'text-partyYellow'
            }`}
          />
          {listenPhase === 'tonic' ? (
            <>
              <h4 className="text-xl font-black text-gray-300">SETTING THE KEY…</h4>
              <p className="text-sm text-gray-400">
                This is <span className="font-black text-white">Do</span>
              </p>
            </>
          ) : (
            <>
              <h4 className="text-2xl font-black text-white">COPY THIS NOTE</h4>
              <p className="text-4xl font-black text-partyYellow">{target.degree.name}</p>
              <p className="text-xs text-gray-400">Listen… you sing it next</p>
            </>
          )}
        </div>
      )}

      {/* Sing it */}
      {stage === 'sing' && target && (
        <div className="space-y-4 animate-fadeIn">
          {/*
            The instruction is the interface. A tuning needle is a musician's
            tool — what a player actually needs to know is "go up" or "go down",
            in words, large. The meter beside it is a refinement, not the point.
          */}
          <div className="flex items-stretch gap-3">
            <div
              className={`flex-1 rounded-2xl border-2 p-4 text-center transition-colors duration-200 ${
                direction === 'hold'
                  ? 'bg-emerald-500/25 border-emerald-400'
                  : direction === 'silent'
                  ? 'bg-white/5 border-white/15'
                  : 'bg-partyPurple/30 border-partyCyan/60'
              }`}
            >
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
                Sing {target.degree.name}
              </p>

              {direction === 'silent' && (
                <>
                  <Mic className="w-10 h-10 text-gray-400 mx-auto my-1 animate-pulse" />
                  <p className="text-lg font-black text-gray-300">SING OUT</p>
                </>
              )}
              {direction === 'higher' && (
                <>
                  <ChevronUp className="w-12 h-12 text-partyCyan mx-auto animate-bounce" />
                  <p className="text-2xl font-black text-white">GO HIGHER</p>
                </>
              )}
              {direction === 'lower' && (
                <>
                  <ChevronDown className="w-12 h-12 text-partyCyan mx-auto animate-bounce" />
                  <p className="text-2xl font-black text-white">GO LOWER</p>
                </>
              )}
              {direction === 'hold' && (
                <>
                  <Check className="w-12 h-12 text-emerald-400 mx-auto" />
                  <p className="text-2xl font-black text-emerald-300">HOLD IT!</p>
                </>
              )}

              <p className="text-[11px] text-gray-400 mt-1">{holdLeft.toFixed(1)}s left</p>
            </div>

            {/*
              Vertical, because pitch is up and down. The old bar ran left to
              right across half an octave, which is both the wrong metaphor and
              too wide a range for small errors to show.
            */}
            <div className="w-16 shrink-0 relative rounded-2xl bg-partyDark border border-white/15 overflow-hidden">
              <div
                className="absolute inset-x-0 bg-emerald-500/25 border-y border-emerald-400/50"
                style={{
                  top: `${50 - (PERFECT_CENTS / METER_RANGE) * 50}%`,
                  height: `${((PERFECT_CENTS * 2) / METER_RANGE) * 50}%`,
                }}
              />
              <div
                className="absolute inset-x-0 bg-amber-500/10"
                style={{
                  top: `${50 - (CLOSE_CENTS / METER_RANGE) * 50}%`,
                  height: `${((CLOSE_CENTS * 2) / METER_RANGE) * 50}%`,
                }}
              />
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-white/70" />

              {liveCents !== null && (
                <div
                  className={`absolute inset-x-2 h-2 rounded-full transition-all duration-150 ease-out ${
                    quality === 'perfect'
                      ? 'bg-emerald-400 shadow-[0_0_12px_rgba(0,230,118,0.9)]'
                      : quality === 'close'
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                  }`}
                  style={{ top: `calc(${markerPct}% - 4px)` }}
                />
              )}

              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-black text-gray-500">
                HIGH
              </span>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black text-gray-500">
                LOW
              </span>
            </div>
          </div>

          {/* Volume so they know the mic is hearing them */}
          <div className="h-1.5 rounded-full bg-partyDark overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-partyYellow transition-all duration-75"
              style={{ width: `${volume}%` }}
            />
          </div>
        </div>
      )}

      {/* Verdict */}
      {stage === 'verdict' && verdict && (
        <div className="py-6 text-center space-y-3 animate-fadeIn">
          <Music
            className={`w-12 h-12 mx-auto ${
              verdict.points >= 70 ? 'text-emerald-400 animate-bounce' : 'text-amber-400'
            }`}
          />
          <h4 className="text-2xl font-black text-white">{verdict.text}</h4>
          <p className="text-sm font-extrabold text-partyYellow">
            +{verdict.points} points · {Math.round(verdict.accuracy * 100)}% on pitch
          </p>
          <button
            onClick={nextRound}
            className="bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-sm px-6 py-3 rounded-2xl inline-flex items-center gap-2"
          >
            {roundIndex + 1 >= ROUNDS_PER_TURN ? 'SEE TOTAL' : 'NEXT NOTE'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Finished */}
      {stage === 'finished' && (
        <div className="py-6 text-center space-y-4 animate-fadeIn">
          <Music className="w-14 h-14 text-partyYellow mx-auto animate-bounce" />
          <h4 className="text-3xl font-black text-white">{totalScore} POINTS</h4>
          <p className="text-xs text-gray-300">
            {totalScore >= 350
              ? 'Your ear sharp! Choir don call you.'
              : totalScore >= 180
              ? 'Not bad — you fit hold note.'
              : 'Omo… make we no talk. Try again next round.'}
          </p>
          <button
            onClick={() => {
              stopDetection();
              onComplete(totalScore);
            }}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-partyDark font-black text-base py-4 rounded-2xl inline-flex items-center justify-center gap-2 glow-emerald"
          >
            <Play className="w-5 h-5 fill-current" />
            CONTINUE
          </button>
        </div>
      )}
    </div>
  );
}
