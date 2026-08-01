'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Gavel,
} from 'lucide-react';
import { ChallengeWord, Player, RoomState } from '@/lib/types';
import { getRandomMathProblem, LANGUAGE_DECKS, PIDGIN_FEEDBACK } from '@/lib/gameContent';
import { audioSFX } from '@/lib/audioFeedback';
import {
  speechEngine,
  SpeechError,
  SpeechMatchResult,
  ListenSession,
  MicCapabilities,
  PHONETIC_FALLBACK_LANGUAGES,
} from '@/lib/speechService';
import { roomStore } from '@/lib/roomStore';
import AvatarIllustration from './AvatarIllustration';

type ArenaStatus = 'idle' | 'listening' | 'matched' | 'failed';

interface VoiceGameControllerProps {
  room: RoomState;
  activePlayer: Player;
  onCompleteTurn: (pointsEarned: number) => void;
}

function formatTime(seconds: number): string {
  return `00:${String(Math.max(0, seconds)).padStart(2, '0')}`;
}

export default function VoiceGameController({ room, activePlayer, onCompleteTurn }: VoiceGameControllerProps) {
  const [challenge, setChallenge] = useState<ChallengeWord | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(room.turnTimeLimit);
  const [status, setStatus] = useState<ArenaStatus>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [micVolume, setMicVolume] = useState<number>(0);
  const [scoreEarned, setScoreEarned] = useState<number>(0);
  const [reactionMsg, setReactionMsg] = useState<string>('');
  const [error, setError] = useState<SpeechError | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [caps, setCaps] = useState<MicCapabilities | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<ListenSession | null>(null);
  // The recognition callback is built once per round, so it cannot read timeLeft
  // from state without going stale. Scoring reads this instead.
  const timeLeftRef = useRef<number>(room.turnTimeLimit);

  // Capabilities touch `window`, so they resolve after mount to keep the server
  // and client render identical.
  useEffect(() => {
    setCaps(speechEngine.getCapabilities());
    setIsMicMuted(speechEngine.getIsMicMuted());
  }, []);

  const teardown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    sessionRef.current?.stop();
    sessionRef.current = null;
    speechEngine.stopAudioAnalyser();
    setMicVolume(0);
  }, []);

  const pickNextChallenge = useCallback(() => {
    const trap = room.trapWords.find((t) => !t.used);
    if (trap) {
      // Persist immediately, otherwise the next poll hands out the same trap again.
      roomStore.markTrapUsed(room.roomId, trap.id);
      setChallenge({
        id: trap.id,
        word: trap.word,
        phonetic: 'OPPONENT CUSTOM TRAP!',
        translation: `Custom trap set by ${trap.authorName}`,
        language: 'trap',
        type: 'trap',
        difficulty: 'hard',
      });
      return;
    }

    if (room.mathEnabled && Math.random() < 0.35) {
      setChallenge(getRandomMathProblem());
      return;
    }

    const availableLangs = room.selectedLanguages.length > 0 ? room.selectedLanguages : ['hausa', 'yoruba', 'igbo'];
    const chosenLang = availableLangs[Math.floor(Math.random() * availableLangs.length)];
    const deck = LANGUAGE_DECKS[chosenLang] || LANGUAGE_DECKS.hausa;
    setChallenge(deck[Math.floor(Math.random() * deck.length)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.roomId, room.mathEnabled]);

  // New turn: reset the arena completely.
  useEffect(() => {
    teardown();
    setStatus('idle');
    setTranscript('');
    setError(null);
    setScoreEarned(0);
    setReactionMsg('');
    setTimeLeft(room.turnTimeLimit);
    timeLeftRef.current = room.turnTimeLimit;
    pickNextChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.activePlayerIndex]);

  // Release the microphone when the arena unmounts.
  useEffect(() => teardown, [teardown]);

  const toggleMic = () => {
    const muted = speechEngine.toggleMicMute();
    setIsMicMuted(muted);
    if (muted && status === 'listening') {
      teardown();
      setStatus('idle');
    }
  };

  const finishRound = useCallback(
    (outcome: 'matched' | 'failed', confidence = 0) => {
      teardown();
      setStatus(outcome);

      if (outcome === 'matched') {
        setScoreEarned(Math.round(150 * confidence + Math.max(0, timeLeftRef.current) * 20));
        audioSFX.playChoiSuccess();
        setReactionMsg(PIDGIN_FEEDBACK.success[Math.floor(Math.random() * PIDGIN_FEEDBACK.success.length)]);
      } else {
        setScoreEarned(0);
        audioSFX.playWhaalaFailure();
        setReactionMsg(PIDGIN_FEEDBACK.failure[Math.floor(Math.random() * PIDGIN_FEEDBACK.failure.length)]);
      }
    },
    [teardown]
  );

  const handleStartAttempt = async () => {
    if (!challenge) return;

    setError(null);
    setTranscript('');

    if (isMicMuted) {
      speechEngine.setMuted(false);
      setIsMicMuted(false);
    }

    // Ask for the microphone before starting the clock. A permission prompt that
    // eats four of the eight seconds is the same as losing the round.
    const accessError = await speechEngine.requestMicAccess();
    if (accessError) {
      setError(accessError);
      return;
    }

    const target = challenge.type === 'math' ? challenge.word.split('=')[1].trim() : challenge.word;

    let startFailed = false;
    const session = speechEngine.listenForSpeech({
      targetWord: target,
      language: challenge.language,
      onResult: (res: SpeechMatchResult) => {
        setTranscript(res.transcript);
        if (res.isMatch) finishRound('matched', res.confidence);
      },
      onError: (err) => {
        startFailed = true;
        setError(err);
        teardown();
        setStatus('idle');
      },
    });

    if (startFailed) return;

    sessionRef.current = session;
    setStatus('listening');
    setTimeLeft(room.turnTimeLimit);
    timeLeftRef.current = room.turnTimeLimit;
    audioSFX.playStreetVendorBell();

    speechEngine.startAudioAnalyser(
      (vol) => setMicVolume(vol),
      (err) => setError(err)
    );

    timerRef.current = setInterval(() => {
      const next = timeLeftRef.current - 1;
      timeLeftRef.current = next;
      setTimeLeft(next);

      if (next <= 0) {
        finishRound('failed');
        return;
      }
      audioSFX.playTimerTick(next <= 3);
    }, 1000);
  };

  const timerPercentage = Math.round((Math.max(0, timeLeft) / room.turnTimeLimit) * 100);
  const sttUnavailable = caps !== null && (!caps.hasSpeechRecognition || !caps.secureContext);
  const usesPhoneticFallback = challenge ? PHONETIC_FALLBACK_LANGUAGES.has(challenge.language) : false;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 relative">
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-partyYellow/40 text-center relative overflow-hidden space-y-6 backdrop-blur-xl bg-slate-900/70 z-10">
        {/* Top Arena Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <AvatarIllustration
              avatar={activePlayer.avatar}
              size="lg"
              isSpeaking={status === 'listening' && !isMicMuted}
            />
            <div className="text-left">
              <span className="text-[10px] text-partyYellow font-black uppercase tracking-wider block">
                ACTIVE VOICE ARENA TURN
              </span>
              <h3 className="font-extrabold text-xl text-white">{activePlayer.name}</h3>
              <p className="text-xs text-gray-300">{activePlayer.avatar.outfit}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              className={`p-2.5 rounded-2xl border font-bold text-xs flex items-center gap-1.5 transition-all shadow ${
                isMicMuted
                  ? 'bg-red-500/30 text-red-400 border-red-500/50'
                  : 'bg-emerald-500/30 text-emerald-400 border-emerald-500/50'
              }`}
              title={isMicMuted ? 'Click to unmute mic' : 'Click to mute mic'}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span className="hidden sm:inline">{isMicMuted ? 'MUTED' : 'MIC ON'}</span>
            </button>

            <div
              className={`px-4 py-2 rounded-2xl border font-mono font-black text-lg transition-all flex items-center gap-2 ${
                timeLeft <= 3 && status === 'listening'
                  ? 'bg-red-500/30 border-red-500 text-red-400 animate-pulse glow-terracotta'
                  : 'bg-partyDark border-partyYellow/40 text-partyYellow'
              }`}
            >
              <Clock className="w-5 h-5" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          </div>
        </div>

        {/* Timer Countdown Progress Bar */}
        <div className="w-full bg-partyDark h-2.5 rounded-full overflow-hidden border border-white/10">
          <div
            className={`h-full transition-all duration-1000 ${
              timeLeft <= 3 ? 'bg-red-500' : 'bg-gradient-to-r from-emerald-400 via-partyYellow to-terracotta'
            }`}
            style={{ width: `${timerPercentage}%` }}
          />
        </div>

        {/* Microphone / browser problems, always stated plainly */}
        {(error || sttUnavailable) && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/60 text-left flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-300">
                {error ? 'Microphone problem' : 'Speech recognition unavailable'}
              </p>
              <p className="text-xs text-gray-200">
                {error
                  ? error.message
                  : !caps?.secureContext
                    ? 'The microphone only works over HTTPS. Open the game on its https:// link.'
                    : 'This browser has no speech recognition. Chrome, Edge and Safari support it — or use the judge button below to score the round manually.'}
              </p>
            </div>
          </div>
        )}

        {/* Central Prompt Card */}
        {challenge && (
          <div className="py-8 px-6 rounded-3xl bg-partyDark/95 border border-partyYellow/40 space-y-4 shadow-2xl relative">
            <div className="flex justify-center items-center gap-2 flex-wrap">
              <span className="bg-partyPurple text-white text-[10px] font-black uppercase px-3 py-1 rounded-full tracking-wider">
                {challenge.language.toUpperCase()}
              </span>
              {challenge.type === 'trap' && (
                <span className="bg-red-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full animate-pulse">
                  ⚡ OPPONENT TRAP
                </span>
              )}
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-partyYellow tracking-tight drop-shadow-md">
              {challenge.word}
            </h2>

            {challenge.phonetic && (
              <p className="text-sm sm:text-base text-partyCyan font-mono">
                🗣️ Phonetic: <span className="font-bold">{challenge.phonetic}</span>
              </p>
            )}

            {challenge.translation && (
              <p className="text-xs sm:text-sm text-gray-400">Meaning: {challenge.translation}</p>
            )}

            {usesPhoneticFallback && (
              <p className="text-[11px] text-gray-500 pt-1">
                Browsers have no speech model for this language, so the round is scored on how close
                your pronunciation lands in English.
              </p>
            )}
          </div>
        )}

        {/* Live Speech Wave & Audio Indicator */}
        {status === 'listening' && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs text-emerald-400 font-bold px-1">
              <span className="flex items-center gap-1.5 animate-pulse">
                <Mic className="w-4 h-4" /> LIVE MIC ACTIVE — SPEAK THE PROMPT CLEARLY!
              </span>
              <span>AUDIO WAVE: {micVolume}%</span>
            </div>
            <div className="w-full bg-partyDark h-3 rounded-full overflow-hidden border border-emerald-500/40 p-0.5">
              <div
                className="bg-gradient-to-r from-emerald-400 via-partyYellow to-terracotta h-full rounded-full transition-all duration-75"
                style={{ width: `${micVolume}%` }}
              />
            </div>
            {micVolume === 0 && (
              <p className="text-[11px] text-gray-400">
                No sound reaching the mic yet — check the right input device is selected.
              </p>
            )}
          </div>
        )}

        {/* Live Transcript Display */}
        {transcript && (
          <div className="p-3.5 rounded-2xl glass-pill text-sm text-white font-mono flex items-center justify-center gap-2 border border-partyCyan/30">
            <span className="text-gray-400">HEARD:</span>
            <span className="text-partyCyan font-extrabold">&quot;{transcript}&quot;</span>
          </div>
        )}

        {/* Action Controls */}
        {status === 'idle' && (
          <div className="space-y-3 pt-2">
            <button
              onClick={handleStartAttempt}
              disabled={!challenge || sttUnavailable}
              className="w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-partyYellow text-partyDark font-black text-lg py-4 rounded-2xl flex items-center justify-center gap-3 transition-all transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-2xl glow-emerald"
            >
              <Mic className="w-6 h-6 fill-current" />
              <span>START {room.turnTimeLimit}-SEC VOICE ARENA</span>
            </button>
            <p className="text-xs text-gray-400">
              Your browser asks for microphone access the first time. The clock starts once you allow it.
            </p>

            {/* Honest manual path: for browsers with no speech recognition, and for
                trap words the recogniser will never transcribe. */}
            <button
              onClick={() => finishRound('matched', 0.9)}
              className="w-full glass-pill hover:bg-white/20 text-gray-300 font-bold text-xs py-2.5 rounded-xl border border-white/20 flex items-center justify-center gap-2"
            >
              <Gavel className="w-3.5 h-3.5" />
              <span>OPPONENTS JUDGE THIS ROUND MANUALLY (PASS)</span>
            </button>
          </div>
        )}

        {status === 'listening' && (
          <div className="pt-2 grid grid-cols-2 gap-3">
            <button
              onClick={() => finishRound('matched', 0.9)}
              className="glass-pill hover:bg-white/20 text-emerald-300 font-bold text-xs py-2.5 rounded-xl border border-emerald-400/40 flex items-center justify-center gap-2"
            >
              <Gavel className="w-3.5 h-3.5" />
              <span>JUDGE: PASS</span>
            </button>
            <button
              onClick={() => finishRound('failed')}
              className="glass-pill hover:bg-white/20 text-red-300 font-bold text-xs py-2.5 rounded-xl border border-red-400/40 flex items-center justify-center gap-2"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>JUDGE: FAIL</span>
            </button>
          </div>
        )}

        {/* Pass / Miss Instant Visual Badges */}
        {status === 'matched' && (
          <div className="p-6 rounded-2xl bg-emerald-500/20 border border-emerald-500 text-center space-y-3 animate-fadeIn">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-3xl font-black text-white">{reactionMsg}</h3>
            <p className="text-base font-extrabold text-partyYellow">+{scoreEarned} ROADMAP POINTS AWARDED!</p>

            <button
              onClick={() => onCompleteTurn(scoreEarned)}
              className="w-full bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl"
            >
              <span>PROCEED TO ROADMAP BOARD</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {status === 'failed' && (
          <div className="p-6 rounded-2xl bg-red-500/20 border border-red-500 text-center space-y-3 animate-fadeIn">
            <XCircle className="w-14 h-14 text-red-400 mx-auto" />
            <span className="inline-block bg-red-500 text-white font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider">
              CHOI! / WHAALA! BADGE
            </span>
            <h3 className="text-3xl font-black text-white">{reactionMsg}</h3>
            <p className="text-xs text-gray-300">Time out! No points awarded this turn.</p>

            <button
              onClick={() => onCompleteTurn(0)}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              <span>CONTINUE TO ROADMAP BOARD</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
