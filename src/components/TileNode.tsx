'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapTheme, TileNodeType } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';
import { journeyArt, tileArt } from '@/lib/gameIcons';
import GameIcon from './GameIcon';

interface TileNodeProps {
  index: number;
  nodeType: TileNodeType;
  theme: MapTheme;
  isFinish?: boolean;
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
  empty: ''
};

export default function TileNode({ index, nodeType, theme, isFinish = false, onClick }: TileNodeProps) {
  const themeConfig = THEMES[theme] || THEMES.forest;
  const nodeStyle = themeConfig.nodeColors[nodeType] || themeConfig.nodeColors.normal;

  return (
    <motion.div
      whileHover={{ scale: 1.25, translateY: -8, zIndex: 50 }}
      whileTap={{ scale: 0.95, translateY: 0 }}
      onClick={onClick}
      style={{
        transformStyle: 'preserve-3d',
        transform: 'perspective(800px) rotateX(45deg) rotateZ(0deg)',
      }}
      className={`relative w-12 h-12 sm:w-14 sm:h-14 flex flex-col items-center justify-center cursor-pointer group transition-all`}
    >
      {/* Tooltip (Hover Detail) */}
      <div 
        className="absolute -top-16 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-50 w-max max-w-[130px] text-center"
        style={{ transform: 'translateZ(50px) rotateX(-45deg)' }}
      >
        <div className="bg-slate-900/95 backdrop-blur-xl border border-white/20 text-white text-[10px] font-bold px-3 py-2 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] leading-tight">
          <GameIcon
            src={isFinish ? journeyArt('finish') : tileArt(nodeType)}
            emoji={isFinish ? '🏆' : nodeStyle.icon}
            className="w-4 h-4 text-[12px] mb-0.5 mx-auto"
          />
          {isFinish ? 'The Final Station!' : TILE_DESCRIPTIONS[nodeType]}
        </div>
      </div>

      {/* Outer Energy Field (Glow) */}
      <div className={`absolute inset-[-12px] rounded-full border border-white/10 blur-md ${nodeStyle.glow} opacity-60 group-hover:opacity-100 transition-opacity`} />
      
      {/* Base Platform (3D Depth) */}
      <div className={`absolute inset-0 rounded-full border-b-[8px] border-black/70 shadow-[0_20px_30px_rgba(0,0,0,0.9)] ${nodeStyle.bg}`} style={{ transform: 'translateZ(0px)' }} />

      {/* Inner Glowing Core */}
      <div 
        className={`absolute inset-[6px] rounded-full border-2 ${nodeStyle.border} bg-black/50 backdrop-blur-xl shadow-[inset_0_0_20px_rgba(255,255,255,0.4)] flex items-center justify-center overflow-hidden`}
        style={{ transform: 'translateZ(6px)', transformStyle: 'preserve-3d' }}
      >
        {/* Core grid lines */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:10px_10px] opacity-30" />
      </div>

      {/* Billboarded Icon (Stands up straight facing camera) */}
      <div 
        className="absolute z-10 pointer-events-none drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]"
        style={{ transform: 'translateZ(25px) rotateX(-45deg)' }}
      >
        <GameIcon
          src={isFinish ? journeyArt('finish') : tileArt(nodeType)}
          emoji={isFinish ? '🏆' : nodeStyle.icon}
          className="w-6 h-6 sm:w-7 sm:h-7 text-xl sm:text-2xl filter drop-shadow-xl"
        />
      </div>

      {/* Billboarded Node Index Badge */}
      <span 
        className="absolute -top-6 bg-slate-950/80 backdrop-blur-md text-cyan-100 border border-cyan-400/50 font-mono text-[10px] font-black px-2 py-0.5 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.6)] group-hover:-top-4 transition-all duration-300 opacity-100 group-hover:opacity-0"
        style={{ transform: 'translateZ(30px) rotateX(-45deg)' }}
      >
        #{index}
      </span>
      
      {isFinish && (
        <div className="absolute inset-[-20px] rounded-full border-2 border-partyYellow/50 border-dashed animate-[spin_10s_linear_infinite]" style={{ transform: 'translateZ(0px)' }} />
      )}
    </motion.div>
  );
}
