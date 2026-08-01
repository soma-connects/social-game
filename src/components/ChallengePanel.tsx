'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Mic, Clock, CheckCircle2, XCircle, ArrowRight, Zap } from 'lucide-react';
import { STTStatus } from '@/lib/speechService';
import { ChallengeWord, Player } from '@/lib/types';

interface ChallengePanelProps {
  challenge: ChallengeWord | null;
  activePlayer: Player;
  timeLeft: number;
  maxTime: number;
  status: STTStatus;
  transcript: string;
  micVolume: number;
  scoreEarned: number;
  reactionMsg: string;
  onStartAttempt: () => void;
  onCompleteTurn: (score: number) => void;
}

export default function ChallengePanel({
  challenge,
  activePlayer,
  timeLeft,
  maxTime,
  status,
  transcript,
  micVolume,
  scoreEarned,
  reactionMsg,
  onStartAttempt,
  onCompleteTurn,
}: ChallengePanelProps) {
  const timerPercentage = Math.round((timeLeft / maxTime) * 100);

  return (
    <div className="glass-card rounded-3xl p-5 border border-partyYellow/40 space-y-4 backdrop-blur-xl bg-slate-900/80 text-center relative overflow-hidden shadow-2xl">
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-partyYellow tracking-wider uppercase flex items-center gap-1">
          <Zap className="w-3.5 h-3.5 text-partyYellow" /> VOICE ARENA CHALLENGE
        </span>

        {/* Circular Countdown Badge */}
        <div
          className={`px-3 py-1 rounded-full border font-mono font-black text-xs flex items-center gap-1.5 ${
            timeLeft <= 3 ? 'bg-red-500/30 border-red-500 text-red-400 animate-pulse' : 'bg-slate-950 border-partyYellow/40 text-partyYellow'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>00:0{timeLeft}</span>
        </div>
      </div>

      {/* Challenge Card */}
      {challenge && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="p-5 rounded-2xl bg-slate-950 border border-white/15 space-y-2 shadow-inner"
        >
          <span className="bg-partyPurple text-white text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full">
            {challenge.language.toUpperCase()}
          </span>

          <h3 className="text-2xl sm:text-3xl font-black text-partyYellow tracking-wide">
            {challenge.word}
          </h3>

          {challenge.phonetic && (
            <p className="text-xs text-partyCyan font-mono">🗣️ {challenge.phonetic}</p>
          )}
        </motion.div>
      )}

      {/* Waveform & Listening State */}
      {status === 'listening' && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px] text-emerald-400 font-extrabold">
            <span className="flex items-center gap-1 animate-pulse">
              <Mic className="w-3.5 h-3.5" /> LIVE MIC ACTIVE
            </span>
            <span>WAVE: {micVolume}%</span>
          </div>
          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-emerald-500/40 p-0.5">
            <div
              className="bg-gradient-to-r from-emerald-400 via-partyYellow to-terracotta h-full rounded-full transition-all duration-75"
              style={{ width: `${micVolume}%` }}
            />
          </div>
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <p className="text-xs font-mono text-partyCyan bg-slate-950 p-2 rounded-xl border border-white/10">
          HEARD: &quot;{transcript}&quot;
        </p>
      )}

      {/* Controls & Badges */}
      {status === 'idle' && (
        <button
          onClick={onStartAttempt}
          className="w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-partyYellow text-partyDark font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-xl glow-emerald"
        >
          <Mic className="w-4 h-4 fill-current" />
          <span>START 8-SEC VOICE ARENA</span>
        </button>
      )}

      {status === 'matched' && (
        <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto animate-bounce" />
          <h4 className="font-extrabold text-white text-base">{reactionMsg}</h4>
          <p className="text-xs font-black text-partyYellow">+{scoreEarned} ROADMAP POINTS!</p>
          <button
            onClick={() => onCompleteTurn(scoreEarned)}
            className="w-full bg-partyYellow text-partyDark font-black text-xs py-2.5 rounded-xl flex items-center justify-center gap-1 shadow"
          >
            <span>MOVE ON ROADMAP</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {status === 'failed' && (
        <div className="p-4 rounded-2xl bg-red-500/20 border border-red-500 space-y-2">
          <XCircle className="w-8 h-8 text-red-400 mx-auto" />
          <h4 className="font-extrabold text-white text-base">{reactionMsg}</h4>
          <button
            onClick={() => onCompleteTurn(0)}
            className="w-full bg-gray-700 text-white font-black text-xs py-2.5 rounded-xl flex items-center justify-center gap-1 shadow"
          >
            <span>CONTINUE</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
