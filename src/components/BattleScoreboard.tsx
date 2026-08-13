'use client';

import React from 'react';
import { RoomState } from '@/lib/types';
import { Trophy, Swords } from 'lucide-react';
import { motion } from 'framer-motion';

interface BattleScoreboardProps {
  room: RoomState;
}

export default function BattleScoreboard({ room }: BattleScoreboardProps) {
  const scores = room.teamScores || { red: 0, blue: 0 };
  const teamState = room.teamBattleState;

  return (
    <div className="w-full glass-card border border-white/10 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-2xl relative overflow-hidden bg-black/40">
      
      {/* Background accents */}
      <div className="absolute top-0 bottom-0 left-0 w-1/3 bg-gradient-to-r from-orange-500/10 to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-1/3 bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none" />

      {/* Team Red/Orange */}
      <div className="flex flex-col items-start gap-1 z-10 w-1/3">
        <h3 className="text-orange-400 font-black text-xs sm:text-sm uppercase tracking-widest flex items-center gap-2">
          Team Orange
        </h3>
        <motion.div 
          key={scores.red}
          initial={{ scale: 1.2, color: '#f97316' }}
          animate={{ scale: 1, color: '#ffffff' }}
          className="text-3xl sm:text-4xl font-black text-white tabular-nums drop-shadow-md"
        >
          {scores.red}
        </motion.div>
      </div>

      {/* Center status */}
      <div className="flex flex-col items-center justify-center gap-2 z-10 w-1/3 text-center">
        <div className="flex items-center gap-2 text-partyYellow drop-shadow-[0_0_8px_rgba(255,236,72,0.5)]">
          <Swords className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        {teamState && (
          <div className="glass-pill px-3 py-1 text-xs font-bold text-gray-200">
            ROUND {teamState.currentRound} / {teamState.seriesLength}
          </div>
        )}
      </div>

      {/* Team Blue */}
      <div className="flex flex-col items-end gap-1 z-10 w-1/3">
        <h3 className="text-blue-400 font-black text-xs sm:text-sm uppercase tracking-widest flex items-center gap-2">
          Team Blue
        </h3>
        <motion.div 
          key={scores.blue}
          initial={{ scale: 1.2, color: '#60a5fa' }}
          animate={{ scale: 1, color: '#ffffff' }}
          className="text-3xl sm:text-4xl font-black text-white tabular-nums drop-shadow-md"
        >
          {scores.blue}
        </motion.div>
      </div>

    </div>
  );
}
