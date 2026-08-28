'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BoardEvent, BoardEventKind } from '@/lib/types';

interface TileEventOverlayProps {
  /** The event to play. Null shows nothing. */
  event: BoardEvent | null;
  onComplete: () => void;
}

/**
 * Per-kind presentation.
 *
 * Keyed off the event kind rather than sniffed out of the banner text. The old
 * version matched on substrings like `banner.includes('WORMHOLE')`, so renaming
 * a banner silently dropped it back to the generic blue card — and the four
 * powerup events had no branch at all.
 */
const LOOKS: Record<BoardEventKind, { icon: string; from: string; to: string; spin?: 'cw' | 'ccw'; pulse?: boolean }> = {
  wormhole: { icon: '🌌', from: 'from-fuchsia-600', to: 'to-indigo-700', spin: 'ccw' },
  asteroid: { icon: '☄️', from: 'from-red-600', to: 'to-orange-600', spin: 'cw' },
  shield_block: { icon: '🛡️', from: 'from-emerald-500', to: 'to-cyan-600', pulse: true },
  shield_gain: { icon: '🛰️', from: 'from-blue-500', to: 'to-cyan-500' },
  shield_up: { icon: '🛡️', from: 'from-emerald-500', to: 'to-teal-600', pulse: true },
  supply_drop: { icon: '📦', from: 'from-amber-400', to: 'to-orange-600' },
  dare: { icon: '🎤', from: 'from-pink-500', to: 'to-rose-700' },
  duel: { icon: '⚔️', from: 'from-orange-500', to: 'to-red-700' },
  finish: { icon: '🏆', from: 'from-yellow-300', to: 'to-amber-600' },
  boost: { icon: '🚀', from: 'from-cyan-400', to: 'to-blue-700' },
  rewind: { icon: '⏪', from: 'from-slate-500', to: 'to-slate-800' },
  freeze: { icon: '❄️', from: 'from-sky-300', to: 'to-blue-700', pulse: true },
  bomb: { icon: '💣', from: 'from-rose-600', to: 'to-neutral-900', spin: 'cw' },
  // Losing your last life used to borrow the rewind card, so the biggest thing
  // that can happen to you on this board looked like being nudged backwards.
  wipeout: { icon: '☠️', from: 'from-red-700', to: 'to-black', pulse: true },
};

/** Long enough to read, short enough not to stall the next roll. */
const HOLD_MS = 3200;

export default function TileEventOverlay({ event, onComplete }: TileEventOverlayProps) {
  const [visible, setVisible] = useState(false);

  // Keyed on the event id, so a repeated snapshot of the same event does not
  // restart the animation and a genuinely new one always does.
  useEffect(() => {
    if (!event) return;
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), HOLD_MS);
    const done = setTimeout(onComplete, HOLD_MS + 450);
    return () => {
      clearTimeout(hide);
      clearTimeout(done);
    };
  }, [event?.id]);

  if (!event) return null;

  const look = LOOKS[event.kind] ?? LOOKS.wormhole;
  const cleanBanner = event.banner.replace(/^[^\w\s]+\s*/, '');

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-none p-4"
        >
          <motion.div
            initial={{ scale: 0.5, y: 80, rotateX: 40 }}
            animate={{ scale: 1, y: 0, rotateX: 0 }}
            exit={{ scale: 1.15, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className={`relative flex flex-col items-center justify-center px-8 py-7 rounded-3xl bg-gradient-to-br ${look.from} ${look.to} shadow-[0_0_80px_rgba(0,0,0,0.55)] border border-white/20 max-w-md text-center overflow-hidden`}
          >
            <div className="absolute inset-0 bg-black/25" />

            <motion.div
              animate={{
                rotate: look.spin === 'cw' ? [0, 360] : look.spin === 'ccw' ? [0, -360] : 0,
                scale: look.pulse ? [1, 1.25, 1] : 1,
              }}
              transition={{
                duration: look.spin ? 4 : 1.4,
                repeat: Infinity,
                ease: look.spin ? 'linear' : 'easeInOut',
              }}
              className="text-7xl sm:text-8xl mb-5 drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] relative z-10"
            >
              {look.icon}
            </motion.div>

            {/* Who this happened to. The room is watching somebody else's turn
                most of the time, so the name is the first thing they need. */}
            <p className="relative z-10 text-[11px] font-black uppercase tracking-[0.2em] text-white/80 mb-1">
              {event.targetPlayerName
                ? `${event.playerName} → ${event.targetPlayerName}`
                : event.playerName}
            </p>

            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-widest mb-2 relative z-10 drop-shadow-md">
              {cleanBanner}
            </h2>

            <p className="text-white/90 text-sm font-medium relative z-10">{event.message}</p>

            {typeof event.coins === 'number' && event.coins !== 0 && (
              <p
                className={`relative z-10 mt-3 text-lg font-black ${
                  event.coins > 0 ? 'text-emerald-200' : 'text-rose-200'
                }`}
              >
                {event.coins > 0 ? `+${event.coins}` : event.coins} coins
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
