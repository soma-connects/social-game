'use client';

import React, { useState } from 'react';
import { Volume2, VolumeX, Mic, MicOff, Share2, Zap } from 'lucide-react';
import { audioSFX } from '@/lib/audioFeedback';
import { speechEngine } from '@/lib/speechService';
import { micStream } from '@/lib/micStream';
import { MapTheme } from '@/lib/types';
import ThemeSelector from './ThemeSelector';

interface GameHeaderProps {
  roomId: string;
  currentTheme: MapTheme;
  onSelectTheme: (theme: MapTheme) => void;
  onOpenTrapPicker?: () => void;
  /** Back to the landing page, keeping this player in the room. */
  onGoHome: () => void;
  /** Leaves the room properly so the others are not left waiting on a ghost. */
  onLeaveGame: () => void;
}

export default function GameHeader({
  roomId,
  currentTheme,
  onSelectTheme,
  onOpenTrapPicker,
  onGoHome,
  onLeaveGame,
}: GameHeaderProps) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(() => speechEngine.getIsMicMuted());

  React.useEffect(() => {
    const unsub = micStream.onMuteChange((muted) => {
      setIsMicMuted(muted);
    });
    return unsub;
  }, []);

  const toggleSound = () => {
    const muted = audioSFX.toggleMute();
    setIsAudioMuted(muted);
  };

  const toggleMic = () => {
    const muted = speechEngine.toggleMicMute();
    setIsMicMuted(muted);
  };

  const shareToWhatsApp = () => {
    if (typeof window === 'undefined') return;
    audioSFX.playStreetVendorBell();
    const url = `${window.location.origin}/game/${roomId}`;
    const text = `🔥 Oya join my game, make I clear you! Room Code: ${roomId}\nTap link to play: ${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <header className="w-full glass-card border-b border-white/10 px-4 py-2.5 sticky top-0 z-40 backdrop-blur-xl bg-slate-900/80">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Brand & Room Info — the logo doubles as the way home */}
        <div className="flex items-center gap-3">
          <button
            onClick={onGoHome}
            title="Back to home"
            className="w-10 h-10 rounded-2xl bg-gradient-to-br from-partyYellow via-terracotta to-partyPink flex items-center justify-center text-xl shadow-lg glow-yellow hover:scale-105 transition-transform active:scale-95"
          >
            🎙️
          </button>
          <div>
            <h1 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5">
              VOICE PARTY <span className="bg-emerald-500 text-partyDark text-[9px] px-2 py-0.5 rounded-full font-black">ARCADE</span>
            </h1>
            <p className="text-[11px] text-partyYellow font-mono flex items-center gap-1">
              ROOM: <span className="font-bold tracking-wider">{roomId}</span>
            </p>
          </div>
        </div>

        {/* Center Theme Selector & Actions */}
        <div className="flex items-center gap-2">
          <ThemeSelector currentTheme={currentTheme} onSelectTheme={onSelectTheme} />

          {/* Manual Mic Mute Toggle Button */}
          <button
            onClick={toggleMic}
            className={`font-black text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-95 ${
              isMicMuted
                ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                : 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50'
            }`}
            title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 animate-pulse" />}
            <span className="hidden sm:inline">{isMicMuted ? 'MIC MUTED' : 'MIC ON'}</span>
          </button>

          {onOpenTrapPicker && (
            <button
              onClick={onOpenTrapPicker}
              className="bg-partyPurple hover:bg-purple-600 text-white font-extrabold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-partyYellow" />
              <span className="hidden sm:inline">TRAP ROOM</span>
            </button>
          )}

          <button
            onClick={shareToWhatsApp}
            className="bg-emerald-500 hover:bg-emerald-400 text-partyDark font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">WHATSAPP</span>
          </button>

          <button
            onClick={toggleSound}
            className="glass-pill hover:bg-white/20 text-white p-2 rounded-xl transition-all"
            title={isAudioMuted ? 'Unmute Sound SFX' : 'Mute Sound SFX'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-partyYellow" />}
          </button>
        </div>
      </div>
    </header>
  );
}
