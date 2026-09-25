'use client';

import React from 'react';
import { PowerupItem } from '@/lib/types';
import { powerupArt } from '@/lib/gameIcons';
import GameIcon from './GameIcon';

interface PowerupCardProps {
  powerup: PowerupItem;
  onUse?: () => void;
  disabled?: boolean;
}

export default function PowerupCard({ powerup, onUse, disabled = false }: PowerupCardProps) {
  return (
    <div className="group relative">
      <button
        onClick={onUse}
        disabled={disabled || powerup.count === 0}
        className={`w-full p-2.5 rounded-2xl border transition-all text-left flex items-center justify-between relative overflow-hidden ${
          powerup.count > 0 && !disabled
            ? 'bg-gradient-to-r from-partyPurple/40 to-white/5 border-partyCyan/50 hover:border-partyYellow hover:scale-102 cursor-pointer shadow-md'
            : 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <GameIcon
            src={powerupArt(powerup.id)}
            emoji={powerup.icon}
            alt={powerup.name}
            className="w-9 h-9 text-xl p-1 rounded-xl bg-white/10 shrink-0"
          />
          <div>
            <h5 className="font-extrabold text-xs text-white">{powerup.name}</h5>
            <p className="text-[10px] text-gray-300 max-w-[120px] truncate">{powerup.description}</p>
          </div>
        </div>

        <span className="bg-partyYellow text-partyDark font-black text-xs px-2 py-0.5 rounded-full shadow">
          x{powerup.count}
        </span>
      </button>

      {/* Tooltip */}
      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-48 p-2 rounded-xl glass-card text-[11px] text-gray-200 border border-white/20 shadow-xl pointer-events-none">
        <p className="font-bold text-partyYellow">{powerup.name}</p>
        <p>{powerup.description}</p>
      </div>
    </div>
  );
}
