'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapTheme, Player } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';
// Shared with the server so the board shown matches the tile effects applied.
import { NODE_TYPES, TOTAL_TILES } from '@/lib/gameRules';
import TileNode from './TileNode';
import AvatarIllustration from './AvatarIllustration';

interface MapRendererProps {
  theme: MapTheme;
  players: Player[];
  activePlayerId: string;
  totalTiles?: number;
}

// Tile Index 0..19 mapped 1:1 to exact (x%, y%) coordinates on winding adventure path
export const NODE_COORDINATES: { x: number; y: number }[] = [
  { x: 10, y: 12 }, // Node 0 (Start)
  { x: 28, y: 10 }, // Node 1
  { x: 48, y: 14 }, // Node 2
  { x: 68, y: 10 }, // Node 3 (Dare)
  { x: 86, y: 16 }, // Node 4
  { x: 88, y: 32 }, // Node 5 (Boost)
  { x: 70, y: 38 }, // Node 6
  { x: 50, y: 34 }, // Node 7 (Trap)
  { x: 30, y: 38 }, // Node 8
  { x: 12, y: 44 }, // Node 9
  { x: 14, y: 60 }, // Node 10 (Boost)
  { x: 32, y: 64 }, // Node 11 (Dare)
  { x: 52, y: 60 }, // Node 12
  { x: 72, y: 64 }, // Node 13
  { x: 88, y: 72 }, // Node 14 (Trap)
  { x: 74, y: 86 }, // Node 15 (Boost)
  { x: 54, y: 84 }, // Node 16
  { x: 34, y: 88 }, // Node 17 (Dare)
  { x: 20, y: 82 }, // Node 18
  { x: 8,  y: 86 }, // Node 19 (Finish Line)
];

// SVG Bezier path string intersecting nodes 0 through 19
const ROAD_SVG_PATH = `
  M 10 12
  C 20 8, 38 8, 48 14
  C 58 20, 78 8, 86 16
  C 94 24, 94 28, 88 32
  C 80 36, 60 36, 50 34
  C 40 32, 20 36, 12 44
  C 4 52, 6 56, 14 60
  C 22 64, 42 58, 52 60
  C 62 62, 80 60, 88 72
  C 94 80, 82 86, 74 86
  C 64 86, 44 82, 34 88
  C 24 92, 14 84, 8 86
`;

export default function MapRenderer({ theme, players, activePlayerId, totalTiles = TOTAL_TILES }: MapRendererProps) {
  const themeConfig = THEMES[theme] || THEMES.forest;

  return (
    <div
      className={`relative w-full rounded-3xl p-6 sm:p-8 border border-white/20 shadow-2xl overflow-hidden backdrop-blur-xl bg-gradient-to-br ${themeConfig.bgGradient} transition-all duration-700 min-h-[580px] sm:min-h-[640px] flex flex-col justify-between`}
    >
      {/* Background Theme Landscapes & Floating Landmarks */}
      <div className="absolute inset-0 pointer-events-none opacity-20 flex justify-between p-6 text-5xl">
        <span>{themeConfig.landmarks.trees}</span>
        <span>{themeConfig.landmarks.water}</span>
        <span>{themeConfig.landmarks.hills}</span>
        <span>{themeConfig.landmarks.special}</span>
      </div>

      {/* Map Header */}
      <div className="flex items-center justify-between z-10">
        <div className="glass-pill px-4 py-1.5 rounded-full border border-white/20 text-xs font-black text-white flex items-center gap-2 shadow-lg">
          <span>{themeConfig.icon}</span>
          <span>{themeConfig.name.toUpperCase()} ROADMAP</span>
        </div>
        <span className="text-[10px] font-mono font-bold text-gray-300">20 ADVENTURE NODES</span>
      </div>

      {/* SVG Winding Road Path Track Intersecting Nodes 0..19 */}
      <div className="relative w-full h-[460px] sm:h-[500px] my-2">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
        >
          {/* Outer Road Stroke Shadow */}
          <path
            d={ROAD_SVG_PATH}
            stroke="#000"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.5"
          />
          {/* Primary Theme Road Surface */}
          <path
            d={ROAD_SVG_PATH}
            stroke={themeConfig.roadColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Dashed Center Lane Line */}
          <path
            d={ROAD_SVG_PATH}
            stroke={themeConfig.roadStroke}
            strokeWidth="2.5"
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>

        {/* Circular Nodes Placed Exactly at (x%, y%) Coordinates */}
        {Array.from({ length: totalTiles }).map((_, idx) => {
          const coords = NODE_COORDINATES[idx] || { x: 50, y: 50 };
          const nodeType = NODE_TYPES[idx % NODE_TYPES.length];
          const isFinish = idx === totalTiles - 1;

          return (
            <div
              key={idx}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
              style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
            >
              <TileNode index={idx} nodeType={nodeType} theme={theme} isFinish={isFinish} />
            </div>
          );
        })}

        {/* Animated Sliding Avatar Tokens — the only place players are drawn */}
        {players.map((player) => {
          const currentTileIndex = Math.min(totalTiles - 1, Math.max(0, player.boardPosition));
          const coords = NODE_COORDINATES[currentTileIndex] || { x: 10, y: 12 };
          const isTurn = player.id === activePlayerId;

          // Everyone starts on tile 1 and players bunch up all game. Without a
          // fan-out they land on identical coordinates and read as one token.
          const sharing = players.filter((p) => p.boardPosition === player.boardPosition);
          const slot = sharing.findIndex((p) => p.id === player.id);
          const spreadX = sharing.length > 1 ? (slot - (sharing.length - 1) / 2) * 4.5 : 0;
          const spreadY = sharing.length > 1 ? (slot % 2 === 0 ? -1.5 : 1.5) : 0;

          return (
            <motion.div
              key={player.id}
              initial={false}
              animate={{ left: `${coords.x + spreadX}%`, top: `${coords.y + spreadY}%` }}
              transition={{ type: 'spring', stiffness: 180, damping: 22 }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none ${
                isTurn ? 'z-40' : 'z-30'
              }`}
            >
              <div className="relative">
                {isTurn && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-partyYellow text-partyDark font-black text-[8px] px-1.5 py-0.2 rounded-full uppercase shadow animate-bounce">
                    TURN
                  </div>
                )}
                <AvatarIllustration
                  avatar={player.avatar}
                  size={isTurn ? 'md' : 'sm'}
                  isSpeaking={isTurn}
                  className="shadow-2xl border-2 border-partyYellow"
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom Landmark Track Decoration */}
      <div className="flex justify-between items-center z-10 pt-2 border-t border-white/10 text-xs font-bold text-gray-300">
        <span className="flex items-center gap-1">{themeConfig.landmarks.trees} START (TILE #1)</span>
        <span className="flex items-center gap-1">{themeConfig.landmarks.special} FINISH CASTLE (TILE #20) 🏆</span>
      </div>
    </div>
  );
}
