'use client';

import React, { useState } from 'react';
import { Bot, Sparkles, Mic, Volume2, Zap, RefreshCw, Trophy, Flame } from 'lucide-react';
import { Player, RoomState } from '@/lib/types';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { audioSFX } from '@/lib/audioFeedback';

interface GeminiAiMasterStageProps {
  room: RoomState;
  activePlayer: Player;
  myPlayer: Player;
}

export default function GeminiAiMasterStage({ room, activePlayer, myPlayer }: GeminiAiMasterStageProps) {
  const [currentPrompt, setCurrentPrompt] = useState<string>(
    `Yo ${activePlayer.name}! Step up to the mic and ask Gemini for your first Voice Dare!`
  );
  const [loading, setLoading] = useState(false);
  const [playerScore, setPlayerScore] = useState<number>(0);
  const [aiCommentary, setAiCommentary] = useState<string>('');

  const handleGeneratePrompt = async (type: 'challenge' | 'debate' | 'roast') => {
    setLoading(true);
    audioSFX.playChoiSuccess();
    try {
      const res = await fetch('/api/ai-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: type, playerName: activePlayer.name }),
      });
      const data = await res.json();
      if (data.text) {
        setCurrentPrompt(data.text);
        aiGameMaster.speak(data.text);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGradeVoiceAttempt = async () => {
    setLoading(true);
    audioSFX.playStreetVendorBell();
    try {
      const points = Math.floor(Math.random() * 80) + 120;
      setPlayerScore((prev) => prev + points);

      const res = await fetch('/api/ai-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'roast', playerName: activePlayer.name }),
      });
      const data = await res.json();
      if (data.text) {
        setAiCommentary(data.text);
        aiGameMaster.speak(data.text);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full glass-card rounded-3xl p-6 space-y-6 backdrop-blur-xl bg-slate-900/90 border border-partyYellow/40 shadow-2xl relative overflow-hidden animate-fadeIn">
      {/* Background Cosmic Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-partyYellow/15 blur-3xl rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-partyYellow via-terracotta to-partyPink flex items-center justify-center text-2xl shadow-lg glow-yellow shrink-0">
            🤖
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-partyYellow tracking-widest uppercase">
                GEMINI 2.5 FLASH AI MASTER
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-2.5 py-0.5 rounded-full font-black border border-emerald-500/30">
                LIVE REASONING
              </span>
            </div>
            <h3 className="text-lg font-black text-white">INTERACTIVE VOICE ARENA</h3>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-partyDark/80 px-4 py-2 rounded-2xl border border-partyYellow/30">
          <Trophy className="w-4 h-4 text-partyYellow" />
          <span className="text-xs font-black text-white">SCORE: {playerScore} PTS</span>
        </div>
      </div>

      {/* Gemini Speech Display Stage */}
      <div className="rounded-2xl bg-slate-950/80 border border-partyYellow/30 p-6 space-y-4 text-center relative overflow-hidden shadow-inner">
        <div className="inline-flex items-center gap-1.5 bg-partyYellow/15 text-partyYellow text-xs px-3 py-1 rounded-full font-extrabold border border-partyYellow/30">
          <Sparkles className="w-3.5 h-3.5" /> GEMINI PROMPT FOR {activePlayer.name.toUpperCase()}
        </div>

        <p className="text-lg sm:text-xl font-black text-white leading-relaxed max-w-2xl mx-auto">
          &quot;{currentPrompt}&quot;
        </p>

        {aiCommentary && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold animate-fadeIn">
            🔥 AI HOST FEEDBACK: &quot;{aiCommentary}&quot;
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => handleGeneratePrompt('challenge')}
          disabled={loading}
          className="bg-gradient-to-r from-partyYellow to-terracotta hover:from-yellow-400 hover:to-orange-600 disabled:opacity-50 text-partyDark font-black text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
        >
          <Zap className="w-4 h-4" />
          <span>GENERATE VOICE DARE</span>
        </button>

        <button
          onClick={() => handleGeneratePrompt('debate')}
          disabled={loading}
          className="bg-gradient-to-r from-partyPink to-rose-600 hover:from-pink-600 hover:to-rose-700 disabled:opacity-50 text-white font-black text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
        >
          <Flame className="w-4 h-4" />
          <span>SPICY DEBATE TOPIC</span>
        </button>

        <button
          onClick={handleGradeVoiceAttempt}
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-partyDark font-black text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 glow-emerald"
        >
          <Mic className="w-4 h-4" />
          <span>SPEAK & GRADE ATTEMPT</span>
        </button>
      </div>
    </div>
  );
}
