'use client';

import React from 'react';
import { RoomState } from '@/lib/types';
import { MINIGAME_LABELS, getTeam } from '@/lib/gameRules';
import { Swords } from 'lucide-react';
import { motion } from 'framer-motion';

interface BattleScoreboardProps {
  room: RoomState;
}

export default function BattleScoreboard({ room }: BattleScoreboardProps) {
  const scores = room.teamScores || { red: 0, blue: 0 };
  const teamState = room.teamBattleState;
  const red = getTeam('red');
  const blue = getTeam('blue');

  return (
    <div className="w-full glass-card border border-white/10 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-2xl relative overflow-hidden bg-black/40">
      
      {/* Background accents */}
      <div className="absolute top-0 bottom-0 left-0 w-1/3 bg-gradient-to-r from-orange-500/10 to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 right-0 w-1/3 bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none" />

      {/* Names and colours come from TEAMS so the scoreboard, the lobby roster
          and the event feed all call the same crew the same thing — this used
          to say "Team Orange" for a crew defined everywhere else as Red Crew. */}
      <div className="flex flex-col items-start gap-1 z-10 w-1/3">
        <h3
          className="font-black text-xs sm:text-sm uppercase tracking-widest flex items-center gap-2"
          style={{ color: red.color }}
        >
          {red.icon} {red.name}
        </h3>
        <motion.div
          key={scores.red}
          initial={{ scale: 1.2, color: red.color }}
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
          <div className="flex flex-col items-center gap-1">
            <div className="glass-pill px-3 py-1 text-xs font-bold text-gray-200 whitespace-nowrap">
              GAME {Math.min(teamState.currentGameIndex + 1, teamState.seriesLength)} / {teamState.seriesLength}
            </div>
            {/* Which game, not just which number — the scoreboard is on screen
                during the game itself, so it should say what is being played. */}
            {room.currentMiniGame && (
              <span className="text-[10px] font-bold text-gray-400 truncate max-w-[9rem]">
                {MINIGAME_LABELS[room.currentMiniGame]}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 z-10 w-1/3">
        <h3
          className="font-black text-xs sm:text-sm uppercase tracking-widest flex items-center gap-2"
          style={{ color: blue.color }}
        >
          {blue.icon} {blue.name}
        </h3>
        <motion.div
          key={scores.blue}
          initial={{ scale: 1.2, color: blue.color }}
          animate={{ scale: 1, color: '#ffffff' }}
          className="text-3xl sm:text-4xl font-black text-white tabular-nums drop-shadow-md"
        >
          {scores.blue}
        </motion.div>
      </div>

    </div>
  );
}
