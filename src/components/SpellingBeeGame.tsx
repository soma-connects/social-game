'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PlayCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { ChallengeWord, Player, RoomState } from '@/lib/types';
import { micStream } from '@/lib/micStream';
import MicContentionNotice from './MicContentionNotice';
import { LANGUAGE_DECKS } from '@/lib/gameContent';
import { audioSFX } from '@/lib/audioFeedback';
import { aiGameMaster } from '@/lib/aiGameMaster';
import {
  speechEngine,
  SpeechError,
  SpeechMatchResult,
  ListenSession,
  MicCapabilities,
} from '@/lib/speechService';
import { roomStore } from '@/lib/roomStore';
import AvatarIllustration from './AvatarIllustration';

type ArenaStatus = 'idle' | 'reading' | 'listening' | 'matched' | 'failed';

interface SpellingBeeGameProps {
  room: RoomState;
  activePlayer: Player;
  onCompleteTurn: (pointsEarned: number) => void;
}

function formatTime(seconds: number): string {
  return `00:${String(Math.max(0, seconds)).padStart(2, '0')}`;
}

export default function SpellingBeeGame({ room, activePlayer, onCompleteTurn }: SpellingBeeGameProps) {
  const [challenge, setChallenge] = useState<ChallengeWord | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(room.turnTimeLimit + 5); // extra 5s for reading
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
  const timeLeftRef = useRef<number>(room.turnTimeLimit + 5);
  
  // Track transcripts across Speech API session restarts
  const fullTranscriptRef = useRef('');
  const lastSessionTranscriptRef = useRef('');

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
    const deck = LANGUAGE_DECKS.spelling_bee ?? LANGUAGE_DECKS.english;
    setChallenge(deck[Math.floor(Math.random() * deck.length)]);
  }, []);

  useEffect(() => {
    teardown();
    setStatus('idle');
    setTranscript('');
    setError(null);
    setScoreEarned(0);
    setReactionMsg('');
    const time = room.turnTimeLimit + 5;
    setTimeLeft(time);
    timeLeftRef.current = time;
    pickNextChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.activePlayerIndex]);

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
        setScoreEarned(Math.round(200 * confidence + Math.max(0, timeLeftRef.current) * 20));
        audioSFX.playChoiSuccess();
        setReactionMsg('Correct Spelling! Beautiful!');
      } else {
        setScoreEarned(0);
        audioSFX.playWhaalaFailure();
        setReactionMsg('Incorrect! Better luck next time.');
      }
    },
    [teardown]
  );

  const readWordAndListen = async () => {
    if (!challenge) return;
    setStatus('reading');
    
    // Use the existing aiGameMaster to read the word since it handles the PCM audio decoding correctly.
    // We add a 2 second timeout since the browser TTS fallback or Gemini TTS might not give a clean callback,
    // and we don't want to get stuck. But ideally we just trigger it and start listening immediately so we don't hold up the game.
    aiGameMaster.speak(`Your word is: ${challenge.word}. I repeat, ${challenge.word}.`);
    
    // Give it 3.5 seconds to read before we start listening
    await new Promise(r => setTimeout(r, 3500));
    
    startListening();
  };

  const startListening = async () => {
    if (!challenge) return;
    setError(null);
    setTranscript('');

    if (isMicMuted) {
      speechEngine.setMuted(false);
      setIsMicMuted(false);
    }

    const accessError = await speechEngine.probeMicPermission();
    if (accessError) {
      setError(accessError);
      return;
    }
    
    let startFailed = false;
    const session = speechEngine.listenForSpeech({
      targetWord: challenge.word,
      language: 'en-US',
      onResult: (res: SpeechMatchResult) => {
        // If the new transcript is shorter or empty, it means the speech engine restarted a new session
        if (res.transcript.length < lastSessionTranscriptRef.current.length) {
           fullTranscriptRef.current += ' ' + lastSessionTranscriptRef.current;
        }
        lastSessionTranscriptRef.current = res.transcript;
        
        const combined = (fullTranscriptRef.current + ' ' + res.transcript).trim();
        setTranscript(combined);
        
        const t = combined.replace(/[^a-zA-Z]/g, '').toLowerCase();
        const w = challenge.word.replace(/[^a-zA-Z]/g, '').toLowerCase();
        
        if (t.includes(w)) {
           finishRound('matched', 1.0);
        } else if (res.isMatch) {
           finishRound('matched', res.confidence);
        }
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

  /**
   * Restarts just the listening session with the mic taken off the call.
   *
   * Leaves the timer, SFX and analyser alone, and keeps the accumulated
   * transcript refs as they are — the player is mid-word, not starting over.
   */
  const restartWithMicPriority = () => {
    if (!challenge || status !== 'listening') return;
    micStream.setSpeechPriority(true);
    sessionRef.current?.stop();
    sessionRef.current = speechEngine.listenForSpeech({
      targetWord: challenge.word,
      language: 'en-US',
      onResult: (res: SpeechMatchResult) => {
        if (res.transcript.length < lastSessionTranscriptRef.current.length) {
          fullTranscriptRef.current += ' ' + lastSessionTranscriptRef.current;
        }
        lastSessionTranscriptRef.current = res.transcript;

        const combined = (fullTranscriptRef.current + ' ' + res.transcript).trim();
        setTranscript(combined);

        const t = combined.replace(/[^a-zA-Z]/g, '').toLowerCase();
        const w = challenge.word.replace(/[^a-zA-Z]/g, '').toLowerCase();

        if (t.includes(w)) {
          finishRound('matched', 1.0);
        } else if (res.isMatch) {
          finishRound('matched', res.confidence);
        }
      },
      onError: (err) => {
        setError(err);
        teardown();
        setStatus('idle');
      },
    });
  };

  useEffect(() => {
    if (!challenge) return;
    roomStore.pushLiveState(room.roomId, activePlayer.id, {
      prompt: "Spelling Bee",
      detail: status === 'reading' ? 'Listening to the word...' : 'Spell the word!',
      progress: 1 - Math.max(0, timeLeft) / (room.turnTimeLimit + 5),
      status:
        status === 'matched'
          ? 'GOT IT!'
          : status === 'failed'
          ? 'Missed it'
          : transcript
          ? `heard: "${transcript}"`
          : status === 'listening'
          ? 'listening…'
          : status === 'reading'
          ? 'Reading the word...'
          : 'about to start',
      good: status === 'matched' ? true : status === 'failed' ? false : undefined,
    });
  }, [challenge, transcript, status, timeLeft, room.roomId, room.turnTimeLimit, activePlayer.id]);

  const timerPercentage = Math.round((Math.max(0, timeLeft) / (room.turnTimeLimit + 5)) * 100);
  const sttUnavailable = caps !== null && (!caps.hasSpeechRecognition || !caps.secureContext);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 relative">
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-partyYellow/40 text-center relative overflow-hidden space-y-6 backdrop-blur-xl bg-slate-900/70 z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <AvatarIllustration
              avatar={activePlayer.avatar}
              size="lg"
              isSpeaking={status === 'listening' && !isMicMuted}
            />
            <div className="text-left">
              <span className="text-[10px] text-partyYellow font-black uppercase tracking-wider block">
                SPELLING BEE TURN
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

        <div className="w-full bg-partyDark h-2.5 rounded-full overflow-hidden border border-white/10">
          <div
            className={`h-full transition-all duration-1000 ${
              timeLeft <= 3 ? 'bg-red-500' : 'bg-gradient-to-r from-emerald-400 via-partyYellow to-terracotta'
            }`}
            style={{ width: `${timerPercentage}%` }}
          />
        </div>

        <MicContentionNotice active={status === 'listening'} onClaimPriority={restartWithMicPriority} />

        {(error || sttUnavailable) && (
          <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/60 text-left flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-300">
                {error ? 'Microphone problem' : 'Speech recognition unavailable'}
              </p>
              <p className="text-xs text-amber-400/80">
                {error?.message || 'Your browser does not support the Web Speech API.'}
              </p>
            </div>
          </div>
        )}

        <div className="py-6 min-h-[160px] flex flex-col justify-center relative">
          {status === 'idle' && !error && !sttUnavailable ? (
            <div className="space-y-4 animate-fadeIn">
              <p className="text-sm text-gray-300">
                The Game Master will read a word. You must spell it out loud.
              </p>
              <button
                onClick={readWordAndListen}
                className="mx-auto bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-sm px-6 py-3 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg glow-yellow"
              >
                <PlayCircle className="w-5 h-5" />
                <span>HEAR WORD & START SPELLING</span>
              </button>
            </div>
          ) : status === 'reading' ? (
             <div className="space-y-4 animate-pulse">
                <Loader2 className="w-10 h-10 text-partyYellow mx-auto animate-spin" />
                <h2 className="text-2xl font-black text-white">Listen carefully...</h2>
             </div>
          ) : status === 'matched' || status === 'failed' ? (
            <div className="space-y-2 animate-bounce-in">
              <div className="flex justify-center mb-4">
                {status === 'matched' ? (
                  <CheckCircle2 className="w-16 h-16 text-emerald-400" />
                ) : (
                  <XCircle className="w-16 h-16 text-red-500" />
                )}
              </div>
              <h2 className={`text-2xl font-black uppercase tracking-widest ${status === 'matched' ? 'text-emerald-400' : 'text-red-400'}`}>
                {status === 'matched' ? 'CORRECT SPELLING!' : 'TIME UP!'}
              </h2>
              <p className="text-gray-300 text-sm">
                Word was: <span className="font-bold text-white">{challenge?.word}</span>
              </p>
              <p className="text-partyYellow font-bold">{reactionMsg}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight">
                SPELL IT!
              </h2>
              <p className="text-sm text-gray-400">
                Heard: <span className="text-partyCyan font-mono bg-partyCyan/10 px-2 py-0.5 rounded">{transcript || '...'}</span>
              </p>
            </div>
          )}
        </div>

        {status === 'matched' || status === 'failed' ? (
          <button
            onClick={() => onCompleteTurn(scoreEarned)}
            className="w-full bg-partyCyan hover:bg-cyan-400 text-partyDark font-black text-sm px-6 py-4 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-xl glow-cyan"
          >
            <span>FINISH TURN</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

