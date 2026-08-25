'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Volume2, VolumeX, Bot, Zap, MessageSquare } from 'lucide-react';
import { aiGameMaster, AiHostPrompt } from '@/lib/aiGameMaster';
import { RoomVibeId } from '@/lib/roomVibes';

interface AiGameMasterBannerProps {
  currentSpeech?: string;
  onTriggerChallenge?: (prompt: AiHostPrompt) => void;
  roomVibe?: RoomVibeId;
}

export default function AiGameMasterBanner({ currentSpeech, onTriggerChallenge, roomVibe }: AiGameMasterBannerProps) {
  const [speechText, setSpeechText] = useState<string>('');
  const [isTtsMuted, setIsTtsMuted] = useState(false);
  const [activePrompt, setActivePrompt] = useState<AiHostPrompt | null>(null);

  useEffect(() => {
    if (currentSpeech) {
      setSpeechText(currentSpeech);
    } else {
      // Default initial welcome
      setSpeechText(aiGameMaster.getWelcomeSpeech());
    }
  }, [currentSpeech]);

  const [loadingAi, setLoadingAi] = useState(false);

  const handleRequestChallenge = async () => {
    setLoadingAi(true);
    const prompt = await aiGameMaster.fetchGeminiChallenge(undefined, roomVibe);
    setLoadingAi(false);
    setActivePrompt(prompt);
    aiGameMaster.speak(`🔥 GEMINI AI CHALLENGE: ${prompt.text}`);
    if (onTriggerChallenge) onTriggerChallenge(prompt);
  };

  const toggleTtsMute = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (!isTtsMuted) {
        window.speechSynthesis.cancel();
      }
    }
    setIsTtsMuted(!isTtsMuted);
  };

  return (
    <div className="w-full glass-card rounded-2xl p-3.5 border border-partyYellow/40 shadow-xl bg-slate-900/90 relative overflow-hidden backdrop-blur-xl animate-fadeIn">
      {/* Background Ambient Glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-partyYellow/15 blur-2xl rounded-full pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
        {/* Left Host Avatar & Speech Caption */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-partyYellow via-terracotta to-partyPink flex items-center justify-center text-xl shadow-lg glow-yellow shrink-0">
            🤖
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-partyYellow tracking-widest uppercase flex items-center gap-1">
                <Bot className="w-3 h-3 text-partyYellow" /> AI GAME MASTER
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-2 py-0.5 rounded-full font-extrabold border border-emerald-500/30">
                LIVE HOST
              </span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-white truncate max-w-xl">
              &quot;{activePrompt ? activePrompt.text : speechText}&quot;
            </p>
          </div>
        </div>

        {/* Right Controls: Mute Host Voice & Ask Challenge */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={handleRequestChallenge}
            disabled={loadingAi}
            className="bg-gradient-to-r from-partyYellow via-terracotta to-partyPink hover:from-yellow-400 hover:to-pink-600 disabled:opacity-50 text-partyDark font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-95 border border-partyYellow/40"
          >
            <Zap className={`w-3.5 h-3.5 text-partyYellow fill-current ${loadingAi ? 'animate-spin' : ''}`} />
            <span>{loadingAi ? 'GEMINI THINKING…' : 'GEMINI AI CHALLENGE'}</span>
          </button>

          <button
            onClick={toggleTtsMute}
            className={`p-2 rounded-xl border transition-all ${
              isTtsMuted
                ? 'bg-red-500/20 border-red-500/40 text-red-400'
                : 'glass-pill hover:bg-white/20 text-partyYellow border-white/10'
            }`}
            title={isTtsMuted ? 'Unmute AI Host Voice' : 'Mute AI Host Voice'}
          >
            {isTtsMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
