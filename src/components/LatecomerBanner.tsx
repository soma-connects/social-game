'use client';

import React from 'react';
import { Eye } from 'lucide-react';
import { Player, RoomState } from '@/lib/types';
import { isSittingOut, latecomerWhen } from '@/lib/latecomers';

interface LatecomerBannerProps {
  room: Pick<RoomState, 'phase' | 'roomType' | 'roundNumber'>;
  player: Pick<Player, 'latecomer'>;
  /** `pill` is the one-line version that sits above the board's roll button. */
  variant?: 'bar' | 'pill';
}

/**
 * Tells someone who joined mid-match that they are watching, and until when.
 *
 * Without it a latecomer sees a game moving with no turn ever coming to them
 * and no way to tell whether that is on purpose or broken.
 */
export default function LatecomerBanner({ room, player, variant = 'bar' }: LatecomerBannerProps) {
  if (!isSittingOut(room, player)) return null;
  const when = latecomerWhen(player.latecomer);

  if (variant === 'pill') {
    // Short enough for one line above the roll button on a phone.
    const from = player.latecomer?.fromRound;
    return (
      <div className="rounded-full border border-partyCyan/50 bg-slate-950/90 px-3 py-1.5 text-center text-[11px] font-black text-cyan-100 shadow-xl backdrop-blur whitespace-nowrap">
        👀 Watching — {from == null ? 'you play next match' : `you're in from round ${from}`}
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl border border-partyCyan/40 bg-cyan-950/40 px-4 py-3 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-partyCyan/20 text-partyCyan flex items-center justify-center shrink-0">
        <Eye className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-white">YOU&apos;RE WATCHING FOR NOW</p>
        <p className="text-xs text-cyan-100/80 leading-snug">
          A match was already running when you joined, so you play {when}. The game brings you in
          by itself — nothing to press. Join the voice call to hang out until then.
        </p>
      </div>
    </div>
  );
}
