'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapTheme, TileNodeType } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';

/**
 * One landing spot on the road.
 *
 * Drawn flat rather than tilted. These used to be rotated 45° on the X axis to
 * suggest depth, which on a small circle mostly reads as squashed — and the icon
 * then had to be counter-rotated back upright, so the 3D never applied to the
 * thing you actually look at. A flat disc with a thick rim and a dropped shadow
 * gives the same weight and stays legible at any zoom.
 */

interface TileNodeProps {
  index: number;
  nodeType: TileNodeType;
  theme: MapTheme;
  isFinish?: boolean;
  /** Diameter in pixels, so tiles scale with the world rather than the screen. */
  size?: number;
  /** Hides the number badge and hover affordances on the small overview. */
  quiet?: boolean;
  onClick?: () => void;
}

const TILE_DESCRIPTIONS: Record<string, string> = {
  normal: 'Safe zone. Catch your breath.',
  buff: 'Nitro Boost! Move +2 spaces.',
  debuff: 'Malfunction! Lose a turn.',
  dare: 'Dare Challenge! Pass or face penalties.',
  duel: 'Voice Duel! Battle another player.',
  trap: 'Asteroid Field! Fall back -3 spaces.',
  bonus: 'Gold Mine! +50 Coins.',
  mystery: 'Mystery Event! Anything can happen.',
  empty: '',
};

export default function TileNode({
  index,
  nodeType,
  theme,
  isFinish = false,
  size = 56,
  quiet = false,
  onClick,
}: TileNodeProps) {
  const themeConfig = THEMES[theme] || THEMES.space;
  const nodeStyle = themeConfig.nodeColors[nodeType] || themeConfig.nodeColors.normal;

  return (
    <motion.div
      whileHover={quiet ? undefined : { scale: 1.18, y: -6, zIndex: 50 }}
      whileTap={quiet ? undefined : { scale: 0.94 }}
      onClick={onClick}
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center group cursor-pointer"
    >
      {!quiet && (
        <div
          className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 w-max max-w-[150px] text-center"
          style={{ bottom: size + 8 }}
        >
          <div className="bg-slate-900/95 backdrop-blur-xl border border-white/20 text-white text-[10px] font-bold px-3 py-2 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] leading-tight">
            <span className="text-[13px] block mb-0.5">{isFinish ? '🏆' : nodeStyle.icon}</span>
            {isFinish ? 'The Final Station!' : TILE_DESCRIPTIONS[nodeType]}
          </div>
        </div>
      )}

      {/* Halo. Deliberately tight: spread wide it stops reading as light coming
          off the tile and starts reading as a bubble around it. */}
      <div
        className={`absolute rounded-full ${nodeStyle.glow} opacity-45 group-hover:opacity-90 transition-opacity`}
        style={{ inset: size * 0.06 }}
      />

      {/* The disc: a bright face over a dark rim, so it sits on the road
          rather than floating above it. */}
      <div
        className={`absolute inset-0 rounded-full ${nodeStyle.bg} border-2 ${nodeStyle.border}`}
        style={{
          boxShadow: `0 ${size * 0.13}px 0 rgba(4,6,20,0.85), 0 ${size * 0.2}px ${size * 0.3}px rgba(0,0,0,0.55), inset 0 ${size * 0.06}px ${size * 0.12}px rgba(255,255,255,0.35)`,
        }}
      />

      {/* Top-lit sheen. */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: size * 0.1,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, transparent 55%)',
        }}
      />

      <span
        className="relative z-10 block leading-none pointer-events-none"
        style={{ fontSize: size * 0.44, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.85))' }}
      >
        {isFinish ? '🏆' : nodeStyle.icon}
      </span>

      {!quiet && (
        <span
          className="absolute bg-slate-950/85 backdrop-blur text-cyan-100 border border-cyan-400/40 font-mono font-black rounded-full shadow-lg pointer-events-none"
          style={{
            top: -size * 0.26,
            fontSize: Math.max(9, size * 0.19),
            padding: `${size * 0.02}px ${size * 0.12}px`,
          }}
        >
          {index}
        </span>
      )}

      {isFinish && (
        <div
          className="absolute rounded-full border-2 border-partyYellow/60 border-dashed animate-[spin_12s_linear_infinite] pointer-events-none"
          style={{ inset: -size * 0.24 }}
        />
      )}
    </motion.div>
  );
}
