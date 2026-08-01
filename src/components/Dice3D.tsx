'use client';

import React from 'react';

interface Dice3DProps {
  value: number | null;
  isRolling: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function Dice3D({ value, isRolling, onClick, disabled = false }: Dice3DProps) {
  // SVG face dot layouts
  const renderDots = (num: number) => {
    switch (num) {
      case 1:
        return <circle cx="50" cy="50" r="10" fill="#0B0E1B" />;
      case 2:
        return (
          <>
            <circle cx="28" cy="28" r="8" fill="#0B0E1B" />
            <circle cx="72" cy="72" r="8" fill="#0B0E1B" />
          </>
        );
      case 3:
        return (
          <>
            <circle cx="25" cy="25" r="7" fill="#0B0E1B" />
            <circle cx="50" cy="50" r="7" fill="#0B0E1B" />
            <circle cx="75" cy="75" r="7" fill="#0B0E1B" />
          </>
        );
      case 4:
        return (
          <>
            <circle cx="28" cy="28" r="7" fill="#0B0E1B" />
            <circle cx="72" cy="28" r="7" fill="#0B0E1B" />
            <circle cx="28" cy="72" r="7" fill="#0B0E1B" />
            <circle cx="72" cy="72" r="7" fill="#0B0E1B" />
          </>
        );
      case 5:
        return (
          <>
            <circle cx="25" cy="25" r="6.5" fill="#0B0E1B" />
            <circle cx="75" cy="25" r="6.5" fill="#0B0E1B" />
            <circle cx="50" cy="50" r="6.5" fill="#0B0E1B" />
            <circle cx="25" cy="75" r="6.5" fill="#0B0E1B" />
            <circle cx="75" cy="75" r="6.5" fill="#0B0E1B" />
          </>
        );
      case 6:
        return (
          <>
            <circle cx="28" cy="22" r="6" fill="#0B0E1B" />
            <circle cx="72" cy="22" r="6" fill="#0B0E1B" />
            <circle cx="28" cy="50" r="6" fill="#0B0E1B" />
            <circle cx="72" cy="50" r="6" fill="#0B0E1B" />
            <circle cx="28" cy="78" r="6" fill="#0B0E1B" />
            <circle cx="72" cy="78" r="6" fill="#0B0E1B" />
          </>
        );
      default:
        return <circle cx="50" cy="50" r="10" fill="#0B0E1B" />;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isRolling}
      className={`group relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl p-1 transition-all duration-300 transform active:scale-95 ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'
      }`}
    >
      {/* Ambient Neon Glow Shadow behind 3D Dice */}
      <div className="absolute inset-0 bg-gradient-to-tr from-partyYellow via-partyPink to-partyCyan blur-xl opacity-75 group-hover:opacity-100 transition-opacity rounded-3xl" />

      {/* 3D Rendered Outer Cube Frame */}
      <div
        className={`relative w-full h-full rounded-2xl bg-gradient-to-br from-partyYellow via-amber-400 to-yellow-600 border-2 border-white/80 shadow-2xl flex flex-col items-center justify-center overflow-hidden ${
          isRolling ? 'animate-spin' : ''
        }`}
        style={{
          boxShadow: 'inset 0 4px 8px rgba(255,255,255,0.7), 0 12px 24px rgba(0,0,0,0.6)',
        }}
      >
        {/* Inner Glossy Glass Top Sheen */}
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />

        {value ? (
          <svg width="68" height="68" viewBox="0 0 100 100" className="drop-shadow-md">
            {renderDots(value)}
          </svg>
        ) : (
          <div className="text-center font-black text-partyDark">
            <span className="text-2xl sm:text-3xl block leading-none">🎲</span>
            <span className="text-[10px] uppercase font-mono tracking-widest block mt-1">REVEAL</span>
          </div>
        )}
      </div>
    </button>
  );
}
