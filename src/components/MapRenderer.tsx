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

// Tile Index 0..23 mapped 1:1 to exact (x%, y%) coordinates on 24-node adventure path
export const NODE_COORDINATES: { x: number; y: number }[] = [
  { x: 8,  y: 10 }, // 0 (Start)
  { x: 22, y: 10 }, // 1
  { x: 38, y: 12 }, // 2
  { x: 54, y: 10 }, // 3 (Split Route 1)
  { x: 70, y: 12 }, // 4
  { x: 86, y: 14 }, // 5
  { x: 92, y: 30 }, // 6
  { x: 76, y: 34 }, // 7
  { x: 58, y: 32 }, // 8
  { x: 40, y: 34 }, // 9
  { x: 22, y: 32 }, // 10
  { x: 8,  y: 44 }, // 11
  { x: 14, y: 60 }, // 12 (Split Route 2)
  { x: 32, y: 62 }, // 13
  { x: 50, y: 58 }, // 14
  { x: 68, y: 62 }, // 15
  { x: 86, y: 68 }, // 16
  { x: 90, y: 84 }, // 17 (Portal)
  { x: 74, y: 88 }, // 18 (Volcano)
  { x: 56, y: 84 }, // 19
  { x: 38, y: 88 }, // 20
  { x: 24, y: 82 }, // 21
  { x: 14, y: 88 }, // 22
  { x: 6,  y: 90 }, // 23 (Finish)
];

// SVG Bezier path string intersecting nodes 0 through 23
const ROAD_SVG_PATH = `
  M 8 10
  C 18 8, 30 8, 38 12
  C 48 16, 62 8, 70 12
  C 80 16, 92 20, 92 30
  C 92 38, 84 32, 76 34
  C 68 36, 48 30, 40 34
  C 30 38, 12 36, 8 44
  C 4 52, 6 56, 14 60
  C 22 64, 42 56, 50 58
  C 60 60, 78 60, 86 68
  C 94 76, 96 82, 90 84
  C 84 86, 64 88, 56 84
  C 48 80, 30 90, 24 82
  C 18 78, 10 88, 6 90
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
