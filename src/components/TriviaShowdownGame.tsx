'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Brain,
} from 'lucide-react';
import { Player, RoomState, TriviaState } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { speechEngine, SpeechError, ListenSession, MicCapabilities } from '@/lib/speechService';
import { roomStore } from '@/lib/roomStore';
import AvatarIllustration from './AvatarIllustration';

interface TriviaShowdownGameProps {
  room: RoomState;
  activePlayer: Player;
  onCompleteTurn: (pointsEarned: number) => void;
}

function formatTime(seconds: number): string {
  return `00:${String(Math.max(0, seconds)).padStart(2, '0')}`;
}

export default function TriviaShowdownGame({
  room,
  activePlayer,
  onCompleteTurn,
}: TriviaShowdownGameProps) {
  const triviaState = room.triviaState as TriviaState | null | undefined;

  const [status, setStatus] = useState<'loading' | 'asking' | 'listening' | 'evaluating' | 'correct' | 'wrong'>('loading');
  const [transcript, setTranscript] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(20);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [caps, setCaps] = useState<MicCapabilities | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<ListenSession | null>(null);
  const isEvaluatedRef = useRef(false);

  // Initialize Speech Capabilities
  useEffect(() => {
    setCaps(speechEngine.getCapabilities());
    setIsMicMuted(speechEngine.getIsMicMuted());
  }, []);

  // Request trivia question from server if missing
  useEffect(() => {
    if (!triviaState && room.roomId) {
      roomStore.send(room.roomId, { action: 'trivia_generate' }).catch(console.error);
    } else if (triviaState && status === 'loading') {
      setStatus('asking');
      aiGameMaster.speak(`Trivia Question: ${triviaState.question}`);
    }
  }, [triviaState, room.roomId, status]);

  // Teardown speech and timer
  const teardown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    sessionRef.current?.stop();
    sessionRef.current = null;
    speechEngine.stopAudioAnalyser();
  }, []);

  useEffect(() => teardown, [teardown]);

  /**
   * Submits the spoken answer for grading.
   *
   * The comparison happens on the server. It has to: the answer is no longer
   * sent to the client before the reveal, because every browser in the room
   * subscribes to the same room document and could simply read it. A client
   * that grades itself can also just declare that it won.
   */
  const handleEvaluate = useCallback(
    async (userAnswer: string) => {
      if (isEvaluatedRef.current || !triviaState) return;
      isEvaluatedRef.current = true;
      teardown();
      setStatus('evaluating');

      const result = await roomStore.send(room.roomId, {
        action: 'trivia_answer',
        answerText: userAnswer,
      });

      const correct = result.isCorrect === true;
      const answer = typeof result.answer === 'string' ? result.answer : '';

      if (correct) {
        setStatus('correct');
        audioSFX.playChoiSuccess();
        aiGameMaster.speak('That is correct!');
        setTimeout(() => onCompleteTurn(100), 3000);
      } else {
        setStatus('wrong');
        audioSFX.playWhaalaFailure();
        aiGameMaster.speak(
          answer ? `Sorry, that's incorrect. The correct answer was ${answer}.` : "Sorry, that's incorrect."
        );
        setTimeout(() => onCompleteTurn(0), 3000);
      }
    },
    [triviaState, teardown, onCompleteTurn, room.roomId]
  );

  // Countdown timer
  useEffect(() => {
    if (status === 'asking' || status === 'listening') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleEvaluate(transcript || textInput);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, transcript, textInput, handleEvaluate]);

  // Listen via Mic
  const startListening = async () => {
    if (status === 'listening') return;
    setStatus('listening');
    setTranscript('');
    try {
      const accessError = await speechEngine.probeMicPermission();
      if (accessError) return;

      sessionRef.current = speechEngine.listenForSpeech({
        language: 'en-US',
        // No target word: the client is not told the answer, so it cannot match
        // against it. The player submits when they finish, or the timer does.
        targetWord: '',
        onResult: (res) => {
          setTranscript(res.transcript);
          if (res.isFinal && res.transcript.trim()) {
            void handleEvaluate(res.transcript);
          }
        },
        onError: (err) => {
          console.error('Speech error:', err);
        },
      });
    } catch (err) {
      console.error('Speech recognition error:', err);
      setStatus('asking');
    }
  };

  const toggleMic = () => {
    const muted = speechEngine.toggleMicMute();
    setIsMicMuted(muted);
  };

  if (!triviaState || status === 'loading') {
    return (
      <div className="glass-card rounded-3xl p-8 border border-purple-500/20 text-center space-y-4">
        <Brain className="w-12 h-12 text-purple-400 animate-pulse mx-auto" />
        <h2 className="text-xl font-bold text-purple-200">AI Game Master is loading a Trivia Question...</h2>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-6 sm:p-8 border border-purple-500/30 space-y-6 shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-xl">
            ðŸ§ 
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">TRIVIA SHOWDOWN</h2>
            <p className="text-xs text-purple-300">Answer the AI's question using your voice!</p>
          </div>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-2 glass-pill px-4 py-1.5 rounded-full border border-purple-400/30">
          <Clock className="w-4 h-4 text-purple-400 animate-spin-slow" />
          <span className="font-mono font-bold text-purple-200">{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* Active Player Card */}
      <div className="flex items-center gap-4 bg-purple-950/40 p-4 rounded-2xl border border-purple-500/20">
        <AvatarIllustration avatar={activePlayer.avatar} size="md" />
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">Current Turn</span>
          <h3 className="text-lg font-bold text-white">{activePlayer.name}</h3>
        </div>
      </div>

      {/* Question Card */}
      <div className="bg-gradient-to-br from-purple-900/40 to-slate-900/60 p-6 rounded-2xl border border-purple-400/30 space-y-3 relative">
        <div className="flex items-center gap-2 text-purple-300 text-xs font-semibold tracking-wider uppercase">
          <HelpCircle className="w-4 h-4" /> Question
        </div>
        <p className="text-lg sm:text-xl font-medium text-white leading-relaxed">
          "{triviaState.question}"
        </p>
      </div>

      {/* Answer / Interactive Area */}
      {status !== 'correct' && status !== 'wrong' && (
        <div className="space-y-4">
          {/* Transcript Display */}
          {(transcript || textInput) && (
            <div className="bg-black/30 p-4 rounded-xl border border-white/10 text-center">
              <span className="text-xs text-gray-400 block mb-1">Your Answer:</span>
              <p className="text-lg font-semibold text-purple-300">"{transcript || textInput}"</p>
            </div>
          )}

          {/* Voice Input Controls */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={startListening}
              disabled={status === 'listening' || status === 'evaluating'}
              className={`w-full sm:flex-1 py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all duration-300 shadow-lg ${
                status === 'listening'
                  ? 'bg-purple-600 text-white animate-pulse border border-purple-300'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/40'
              }`}
            >
              <Mic className={`w-5 h-5 ${status === 'listening' ? 'animate-bounce' : ''}`} />
              {status === 'listening' ? 'Listening...' : 'Tap & Speak Answer'}
            </button>

            <button
              onClick={toggleMic}
              className={`p-4 rounded-2xl border transition-all ${
                isMicMuted
                  ? 'bg-red-500/20 border-red-500/40 text-red-400'
                  : 'glass-card border-white/10 text-gray-300 hover:text-white'
              }`}
              title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          </div>

          {/* Fallback Text Input */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="text"
              placeholder="Or type answer here..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && textInput.trim()) {
                  handleEvaluate(textInput);
                }
              }}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
            />
            <button
              onClick={() => textInput.trim() && handleEvaluate(textInput)}
              className="bg-purple-600/80 hover:bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1 transition"
            >
              Submit <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Result Cards */}
      {status === 'correct' && (
        <div className="bg-emerald-950/60 border border-emerald-500/40 p-6 rounded-2xl text-center space-y-3 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
          <h3 className="text-2xl font-black text-emerald-200">CORRECT! +100 PTS</h3>
          <p className="text-sm text-emerald-300/80 leading-relaxed font-medium">
            ðŸ’¡ {triviaState.funFact}
          </p>
        </div>
      )}

      {status === 'wrong' && (
        <div className="bg-rose-950/60 border border-rose-500/40 p-6 rounded-2xl text-center space-y-3 animate-in fade-in slide-in-from-bottom-4">
          <XCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h3 className="text-2xl font-black text-rose-200">INCORRECT!</h3>
          <p className="text-sm text-rose-300 font-semibold">
            Correct Answer: <span className="underline">{triviaState.answer}</span>
          </p>
          <p className="text-xs text-rose-300/70 leading-relaxed">
            ðŸ’¡ {triviaState.funFact}
          </p>
        </div>
      )}
    </div>
  );
}


