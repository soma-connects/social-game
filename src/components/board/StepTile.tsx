'use client';

import React from 'react';

/**
 * An ordinary space on the road.
 *
 * These are real landing spots, not decoration: the dice walks the graph one
 * edge at a time and three of these sit between every pair of event tiles, so a
 * roll of four puts a token on one. They used to be drawn as 1.25-unit studs,
 * which was legible enough on a board squeezed into a 560px square but left the
 * road looking like a string of beads with the real tiles floating off it — and
 * gave a player no way to count how far a roll could carry them.
 *
 * At full size the spacing works out at roughly one tile per gap, so the road
 * reads as a continuous chain of spaces with the event tiles as the coloured
 * ones among them. Deliberately plain: no icon, no number, no tooltip. There
 * are seventy-five of these and nothing about any of them needs explaining.
 */

interface StepTileProps {
  /** Diameter in pixels, matching the scale the event tiles are drawn at. */
  size: number;
}

export default function StepTile({ size }: StepTileProps) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Mid-tone on purpose. Near-white spaces at this size blew out the road
          underneath and turned the track into one bright rope — the coloured
          tiles are what a player is meant to pick out, and seventy-five plain
          ones have to sit below them. */}
      <div
        className="absolute inset-0 rounded-full border"
        style={{
          background: 'linear-gradient(180deg, #8ea3c4 0%, #5d6f92 100%)',
          borderColor: 'rgba(226,240,255,0.45)',
          boxShadow: `0 ${size * 0.1}px 0 rgba(6,10,28,0.8), 0 ${size * 0.16}px ${size * 0.22}px rgba(0,0,0,0.5), inset 0 ${size * 0.07}px ${size * 0.13}px rgba(255,255,255,0.45)`,
        }}
      />
      {/* Top-lit sheen, the same trick the event tiles use, so a plain space and
          a coloured one read as the same kind of object. */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: size * 0.12,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, transparent 60%)',
        }}
      />
    </div>
  );
}
