'use client';

import React from 'react';
import { Player } from '@/lib/types';
import { ShopItem } from '@/lib/gameRules';
import AvatarIllustration from './AvatarIllustration';
import { ShieldCheck, X } from 'lucide-react';

interface PowerupTargetPickerProps {
  item: ShopItem;
  /** Everyone who could be hit. Already excludes the user. */
  candidates: Player[];
  onPick: (target: Player) => void;
  onCancel: () => void;
}

/**
 * Chooses who an offensive powerup lands on.
 *
 * Before this the shop sold a Dare Gun, an Ice Freeze and a Rewind Trap with no
 * way to say who they were aimed at — so the server had nothing to act on and
 * they did nothing at all.
 *
 * Shielded players are shown as shielded rather than hidden: spending a freeze
 * to strip somebody's shield is a legitimate play, and the player should be able
 * to make that call knowingly instead of wasting the item by accident.
 */
export default function PowerupTargetPicker({
  item,
  candidates,
  onPick,
  onCancel,
}: PowerupTargetPickerProps) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-md rounded-3xl border border-partyYellow/60 bg-slate-900/95 p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-partyYellow">
              {item.icon} {item.name}
            </p>
            <h3 className="text-xl font-black text-white">
              {item.targetPrompt ?? 'Choose a target'}
            </h3>
            <p className="text-xs text-gray-400">{item.description}</p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="p-2 rounded-lg border border-white/15 text-gray-400 hover:text-white hover:border-white/30 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            Nobody else is in the game right now.
          </p>
        ) : (
          <div className="space-y-2">
            {candidates.map((player) => (
              <button
                key={player.id}
                onClick={() => onPick(player)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/15 bg-white/5 hover:border-partyYellow hover:bg-white/10 transition text-left active:scale-[0.98]"
              >
                <AvatarIllustration avatar={player.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-black text-sm text-white truncate">{player.name}</p>
                  <p className="text-[10px] text-gray-400">{player.score} coins</p>
                </div>
                {player.hasShield && (
                  <span className="flex items-center gap-1 text-[10px] font-black text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 px-2 py-1 rounded-full shrink-0">
                    <ShieldCheck className="w-3 h-3" /> SHIELDED
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl border border-white/15 text-xs font-black text-gray-300 hover:text-white hover:border-white/30 transition"
        >
          KEEP IT FOR LATER
        </button>
      </div>
    </div>
  );
}
