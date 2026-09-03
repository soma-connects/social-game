'use client';

import React, { useState } from 'react';
import { Palette, Check, Sparkles, Lock } from 'lucide-react';
import { MapTheme } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';
import { audioSFX } from '@/lib/audioFeedback';

interface ThemeSelectorProps {
  currentTheme: MapTheme;
  onSelectTheme: (theme: MapTheme) => void;
}

export default function ThemeSelector({ currentTheme, onSelectTheme }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const themes = Object.values(THEMES);
  const playable = themes.filter((t) => t.available);
  const parked = themes.filter((t) => !t.available);

  const handleSelect = (themeId: MapTheme) => {
    audioSFX.playChoiSuccess();
    onSelectTheme(themeId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="glass-pill hover:bg-white/20 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 border border-white/20 transition-all shadow-md"
      >
        <span className="text-base">{THEMES[currentTheme].icon}</span>
        <span className="hidden sm:inline">{THEMES[currentTheme].name}</span>
        <Palette className="w-3.5 h-3.5 text-partyYellow" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-64 glass-card rounded-2xl p-3 border border-white/20 shadow-2xl backdrop-blur-xl bg-slate-900/95 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-white/10 px-1">
            <span className="text-xs font-black text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-partyYellow" /> MAP THEMES
            </span>
            <span className="text-[10px] font-mono text-gray-400">
              {playable.length} READY
            </span>
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {playable.map((theme) => {
              const isSelected = theme.id === currentTheme;
              return (
                <button
                  key={theme.id}
                  onClick={() => handleSelect(theme.id)}
                  className={`w-full p-2 rounded-xl text-left transition-all flex items-center justify-between text-xs ${
                    isSelected
                      ? 'bg-partyPurple/60 border border-partyCyan text-white shadow-md'
                      : 'hover:bg-white/10 text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{theme.icon}</span>
                    <span className="font-bold">{theme.name}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-partyCyan" />}
                </button>
              );
            })}

            {/* Shown but not offered. These used to be pickable and simply drew
                the space map with a few tile colours changed, which reads as the
                theme being broken rather than unbuilt. */}
            {parked.length > 0 && (
              <>
                <p className="pt-2 pb-1 px-1 text-[10px] font-black uppercase tracking-wider text-gray-500 border-t border-white/10 mt-1">
                  Waiting on artwork
                </p>
                {parked.map((theme) => (
                  <div
                    key={theme.id}
                    className="w-full p-2 rounded-xl flex items-center justify-between text-xs text-gray-500 opacity-70 cursor-not-allowed"
                    title={`${theme.name} needs its own backdrop and scenery before it can be played`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg grayscale">{theme.icon}</span>
                      <span className="font-bold">{theme.name}</span>
                    </div>
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
