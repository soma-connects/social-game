'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Mic, MicOff, Share2, Home, LogOut, MoreVertical, X } from 'lucide-react';
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
  showThemeSelector?: boolean;
}

export default function GameHeader({
  roomId,
  currentTheme,
  onSelectTheme,
  onOpenTrapPicker,
  onGoHome,
  onLeaveGame,
  showThemeSelector = true,
}: GameHeaderProps) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(() => speechEngine.getIsMicMuted());
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const unsub = micStream.onMuteChange((muted) => {
      setIsMicMuted(muted);
    });
    return unsub;
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMobileMenu(false);
      }
    };
    if (showMobileMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMobileMenu]);

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
    setShowMobileMenu(false);
  };

  return (
    <header className="w-full glass-card border-b border-white/10 px-3 sm:px-4 py-2 sm:py-2.5 sticky top-0 z-40 backdrop-blur-xl bg-slate-900/80">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Brand & Room Info */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={onGoHome}
            title="Back to home"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-partyYellow via-terracotta to-partyPink flex items-center justify-center text-lg sm:text-xl shadow-lg glow-yellow hover:scale-105 transition-transform active:scale-95 shrink-0"
          >
            🎙️
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-extrabold text-xs text-white flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
              <span className="truncate">VOICE PARTY</span>
              <span className="bg-emerald-500 text-partyDark text-[8px] sm:text-[9px] px-1.5 sm:px-2 py-0.5 rounded-full font-black shrink-0">ARCADE</span>
            </h1>
            <p className="text-[10px] text-partyYellow font-mono truncate">
              ROOM: <span className="font-bold tracking-wider">{roomId}</span>
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mic Toggle — always visible */}
          <button
            onClick={toggleMic}
            className={`font-black text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl flex items-center gap-1 transition-all shadow-md active:scale-95 ${
              isMicMuted
                ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                : 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50'
            }`}
            title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isMicMuted ? 'MUTED' : 'MIC ON'}</span>
          </button>

          {/* Sound Toggle — always visible */}
          <button
            onClick={toggleSound}
            className="glass-pill hover:bg-white/20 text-white p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all"
            title={isAudioMuted ? 'Unmute Sound SFX' : 'Mute Sound SFX'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-partyYellow" />}
          </button>

          {/* Desktop-only inline buttons */}
          <div className="hidden sm:flex items-center gap-2">
            {showThemeSelector && (
              <ThemeSelector currentTheme={currentTheme} onSelectTheme={onSelectTheme} />
            )}

            <button
              onClick={shareToWhatsApp}
              className="bg-emerald-500 hover:bg-emerald-400 text-partyDark font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">WHATSAPP</span>
            </button>

            <button
              onClick={onGoHome}
              className="glass-pill hover:bg-white/20 text-white p-2 rounded-xl transition-all"
              title="Home"
            >
              <Home className="w-4 h-4 text-partyCyan" />
            </button>

            <button
              onClick={() => setConfirmLeave(true)}
              className="bg-red-500/25 hover:bg-red-500/40 text-red-300 border border-red-500/40 font-black text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
              title="Leave this game"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">LEAVE</span>
            </button>
          </div>

          {/* Mobile overflow menu trigger */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="glass-pill hover:bg-white/20 text-white p-1.5 rounded-lg transition-all"
              title="More options"
            >
              {showMobileMenu ? <X className="w-4 h-4" /> : <MoreVertical className="w-4 h-4" />}
            </button>

            {showMobileMenu && (
              <div className="absolute right-0 top-10 z-50 w-52 glass-card rounded-2xl p-2 border border-white/15 shadow-2xl bg-slate-900/95 backdrop-blur-xl space-y-1 animate-fadeIn">
                {/* Theme */}
                {showThemeSelector && (
                  <div className="px-1 pb-1 border-b border-white/10">
                    <ThemeSelector currentTheme={currentTheme} onSelectTheme={(t) => { onSelectTheme(t); setShowMobileMenu(false); }} />
                  </div>
                )}

                <button
                  onClick={shareToWhatsApp}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-white hover:bg-white/10 transition-all"
                >
                  <Share2 className="w-4 h-4 text-emerald-400" />
                  SHARE TO WHATSAPP
                </button>

                <button
                  onClick={() => { onGoHome(); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-white hover:bg-white/10 transition-all"
                >
                  <Home className="w-4 h-4 text-partyCyan" />
                  BACK TO HOME
                </button>

                <div className="border-t border-white/10 pt-1 mt-1">
                  <button
                    onClick={() => { setConfirmLeave(true); setShowMobileMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/15 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    LEAVE GAME
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leaving drops you out of the turn order, so make it deliberate. */}
      {confirmLeave && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="glass-card max-w-sm w-full rounded-3xl p-6 border border-red-500/40 space-y-4 text-center bg-slate-900/95">
            <LogOut className="w-10 h-10 text-red-400 mx-auto" />
            <h3 className="text-xl font-black text-white">LEAVE THIS GAME?</h3>
            <p className="text-xs text-gray-300">
              You will be removed from the player list and the round will carry on without you.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 glass-pill hover:bg-white/20 text-white font-bold text-sm py-3 rounded-2xl border border-white/20"
              >
                STAY
              </button>
              <button
                onClick={onLeaveGame}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white font-black text-sm py-3 rounded-2xl transition-all"
              >
                LEAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
