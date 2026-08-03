'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapTheme, TileNodeType } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';

interface TileNodeProps {
  index: number;
  nodeType: TileNodeType;
  theme: MapTheme;
  isFinish?: boolean;
  onClick?: () => void;
}

export default function TileNode({ index, nodeType, theme, isFinish = false, onClick }: TileNodeProps) {
  const themeConfig = THEMES[theme] || THEMES.forest;
  const nodeStyle = themeConfig.nodeColors[nodeType] || themeConfig.nodeColors.normal;

  return (
    <motion.div
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 flex flex-col items-center justify-center cursor-pointer shadow-xl transition-all ${
        nodeStyle.bg
      } ${nodeStyle.border} ${nodeStyle.glow} ${
        isFinish ? 'ring-4 ring-partyYellow animate-pulse scale-110' : ''
      }`}
    >
      {/* Node Index Number Badge */}
      <span className="absolute -top-2 bg-slate-950 text-gray-300 border border-white/20 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow">
        #{index + 1}
      </span>

      {/* Node Type Icon */}
      <span className="text-xl sm:text-2xl drop-shadow-md">
        {isFinish ? '🏆' : nodeStyle.icon}
      </span>

      {/*
        Player avatars are deliberately NOT drawn here. MapRenderer already
        places a sliding token at this node's coordinates — one that springs
        between tiles and carries the TURN badge. Drawing them in both places
        put two copies of every player on the board.
      */}
    </motion.div>
  );
}
