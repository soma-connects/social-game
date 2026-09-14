'use client';

import React, { useState } from 'react';
import { Palette, Check, Sparkles } from 'lucide-react';
import { MapTheme } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';
import { themeArt } from '@/lib/gameIcons';
import GameIcon from './GameIcon';
import { audioSFX } from '@/lib/audioFeedback';

interface ThemeSelectorProps {
  currentTheme: MapTheme;
  onSelectTheme: (theme: MapTheme) => void;
}

export default function ThemeSelector({ currentTheme, onSelectTheme }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

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
        <GameIcon src={themeArt(currentTheme)} emoji={THEMES[currentTheme].icon} className="w-5 h-5 text-base" />
        <span className="hidden sm:inline">{THEMES[currentTheme].name}</span>
        <Palette className="w-3.5 h-3.5 text-partyYellow" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-64 glass-card rounded-2xl p-3 border border-white/20 shadow-2xl backdrop-blur-xl bg-slate-900/95 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-white/10 px-1">
            <span className="text-xs font-black text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-partyYellow" /> MAP THEMES
            </span>
            <span className="text-[10px] font-mono text-gray-400">7 THEMES</span>
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {Object.values(THEMES).map((theme) => {
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
                    <GameIcon src={themeArt(theme.id)} emoji={theme.icon} className="w-6 h-6 text-lg" />
                    <span className="font-bold">{theme.name}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-partyCyan" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
