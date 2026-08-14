'use client';

import React, { useState } from 'react';
import { Bot, Sparkles, Mic, Volume2, Zap, Flame, ArrowLeft, Send, MessageSquare } from 'lucide-react';
import { Player, RoomState } from '@/lib/types';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { audioSFX } from '@/lib/audioFeedback';
import { speechEngine } from '@/lib/speechService';

interface GeminiAiMasterStageProps {
  room: RoomState;
  activePlayer: Player;
  myPlayer: Player;
  onExit?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'gemini' | 'user';
  text: string;
  timestamp: string;
}

export default function GeminiAiMasterStage({ room, activePlayer, myPlayer, onExit }: GeminiAiMasterStageProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'gemini',
      text: `Yo ${activePlayer.name}! Welcome to Gemini AI Master Studio! Clear your throat and ask me for a Voice Dare or Debate Topic!`,
      timestamp: 'Just now',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const recordSpeech = async () => {
    if (isRecording) {
      speechEngine.stopListening();
      setIsRecording(false);
      return;
    }
    
    setIsRecording(true);
    setInputText(''); // clear previous text
    try {
      const accessError = await speechEngine.probeMicPermission();
      if (accessError) {
        setIsRecording(false);
        return;
      }
      
      let session: any = null;
      session = speechEngine.listenForSpeech({
        targetWord: '',
        language: 'en-US',
        onResult: (result: any) => {
          if (result && result.transcript) {
            setInputText(result.transcript);
          }
          if (result.isFinal && session) {
            session.stop();
            setIsRecording(false);
            if (result.transcript.trim()) {
              handleGeneratePrompt('custom', result.transcript.trim());
              setInputText('');
            }
          }
        },
        onError: () => setIsRecording(false)
      });
      
      // Auto-stop recording after 15 seconds max
      setTimeout(() => {
        if (session) {
          session.stop();
          speechEngine.stopListening();
          setIsRecording(false);
        }
      }, 15000);
      
    } catch (error) {
      setIsRecording(false);
    }
  };

  const handleGeneratePrompt = async (type: 'challenge' | 'debate' | 'custom', customText?: string) => {
    setLoading(true);
    audioSFX.playChoiSuccess();

    if (customText) {
      setMessages((prev) => [
        ...prev,
        { id: String(Date.now()), sender: 'user', text: customText, timestamp: 'Now' },
      ]);
    }

    try {
      const res = await fetch('/api/ai-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: type, playerName: activePlayer.name, gameContext: customText }),
      });
      const data = await res.json();
      if (data.text) {
        setMessages((prev) => [
          ...prev,
          { id: String(Date.now() + 1), sender: 'gemini', text: data.text, timestamp: 'Now' },
        ]);
        setIsSpeaking(true);
        aiGameMaster.speak(data.text);
        setTimeout(() => setIsSpeaking(false), 5000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setInputText('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050814] text-white flex flex-col justify-between animate-fadeIn overflow-hidden">
      {/* Ambient Subtle Cosmic Background Orbs */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-partyYellow/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Clean Gemini/ChatGPT Minimalist Header */}
      <div className="w-full max-w-4xl mx-auto px-4 py-4 flex items-center justify-between border-b border-white/10 relative z-10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {onExit && (
            <button
              onClick={onExit}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 transition-all border border-white/10"
              title="Exit Gemini Mode"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full bg-gradient-to-r from-partyCyan via-partyYellow to-partyPink flex items-center justify-center text-sm shadow-md ${isSpeaking ? 'animate-pulse glow-cyan' : ''}`}>
              ðŸ¤–
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                Gemini 2.5 Flash Host
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </h3>
              <p className="text-[10px] text-partyCyan font-mono">Live Conversational Voice Environment</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-gray-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
            {activePlayer.name.toUpperCase()} ON MIC
          </span>
        </div>
      </div>

      {/* Main Conversational Stream (Clean ChatGPT/Gemini Style) */}
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 overflow-y-auto space-y-6 relative z-10 custom-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 animate-fadeIn ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.sender === 'gemini' && (
              <div className="w-8 h-8 rounded-full bg-slate-900 border border-partyCyan/40 text-sm flex items-center justify-center shrink-0 shadow">
                ðŸ¤–
              </div>
            )}
            <div
              className={`max-w-lg rounded-2xl p-4 text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-partyCyan/20 text-white border border-partyCyan/40 rounded-tr-none'
                  : 'bg-slate-900/90 text-gray-100 border border-white/15 rounded-tl-none shadow-xl backdrop-blur-md'
              }`}
            >
              {msg.sender === 'gemini' && (
                <span className="text-[10px] font-black text-partyYellow block mb-1 uppercase tracking-wider">
                  AI MASTER
                </span>
              )}
              <p className="font-medium text-sm sm:text-base">{msg.text}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-partyCyan font-bold animate-pulse px-2">
            <Sparkles className="w-4 h-4 animate-spin" /> Gemini is reasoning...
          </div>
        )}
      </div>

      {/* Bottom Floating Control & Voice Prompt Bar */}
      <div className="w-full max-w-3xl mx-auto px-4 pb-6 space-y-3 relative z-10">
        {/* Preset Quick Mode Chips */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => handleGeneratePrompt('challenge')}
            disabled={loading}
            className="bg-slate-900/90 hover:bg-slate-800 text-partyYellow border border-partyYellow/40 font-extrabold text-xs px-3.5 py-2 rounded-full flex items-center gap-1.5 transition-all shadow-md active:scale-95"
          >
            <Zap className="w-3.5 h-3.5" /> VOICE DARE
          </button>

          <button
            onClick={() => handleGeneratePrompt('debate')}
            disabled={loading}
            className="bg-slate-900/90 hover:bg-slate-800 text-partyPink border border-partyPink/40 font-extrabold text-xs px-3.5 py-2 rounded-full flex items-center gap-1.5 transition-all shadow-md active:scale-95"
          >
            <Flame className="w-3.5 h-3.5" /> SPICY DEBATE
          </button>
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputText.trim()) handleGeneratePrompt('custom', inputText.trim());
          }}
          className="flex items-center gap-2 bg-slate-900/90 border border-white/20 rounded-2xl p-2 shadow-2xl backdrop-blur-xl"
        >
          <input
            type="text"
            placeholder="Ask Gemini AI Master anything or type a topic..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading || isRecording}
            className="flex-1 bg-transparent px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={recordSpeech}
            className={`p-3 rounded-xl transition-all shadow-md flex items-center justify-center ${
              isRecording 
                ? 'bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
                : 'bg-slate-800 text-gray-300 hover:bg-slate-700 hover:text-white'
            }`}
            title={isRecording ? "Stop Recording" : "Start Voice Input"}
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="p-3 bg-partyCyan hover:bg-cyan-400 disabled:opacity-40 text-partyDark rounded-xl transition-all font-bold shadow-md"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

