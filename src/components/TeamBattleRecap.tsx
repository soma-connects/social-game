'use client';

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Trophy, Handshake, Home } from 'lucide-react';
import { RoomState, Player } from '@/lib/types';
import { MINIGAME_ICONS, MINIGAME_LABELS, TEAMS, getTeam } from '@/lib/gameRules';
import AvatarIllustration from './AvatarIllustration';

interface TeamBattleRecapProps {
  room: RoomState;
  myPlayer: Player;
  onGoHome: () => void;
}

/**
 * End of a Team Battle series.
 *
 * The phase existed with no screen behind it, so a finished series showed
 * nothing at all. A draw is a real outcome here — the series is won on points,
 * not on a finish line — so it gets its own treatment rather than being forced
 * into a winner shape.
 */
export default function TeamBattleRecap({ room, myPlayer, onGoHome }: TeamBattleRecapProps) {
  const scores = room.teamScores ?? { red: 0, blue: 0 };
  const winningTeam = room.winningTeam ? getTeam(room.winningTeam) : null;
  const iWon = !!room.winningTeam && myPlayer.teamId === room.winningTeam;

  useEffect(() => {
    if (!winningTeam) return;
    confetti({
      particleCount: 180,
      spread: 100,
      origin: { y: 0.6 },
      colors: [winningTeam.color, '#FFD000', '#ffffff'],
    });
  }, [winningTeam?.id]);

  // Top scorer overall — the mode is won by a crew, but somebody carried it.
  const mvp = [...room.players].sort((a, b) => b.score - a.score)[0] ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-3xl mx-auto space-y-6"
    >
      <div className="text-center space-y-3">
        {winningTeam ? (
          <>
            <Trophy className="w-16 h-16 mx-auto animate-bounce" style={{ color: winningTeam.color }} />
            <h2 className="text-4xl font-black text-white uppercase tracking-wider">
              {winningTeam.icon} {winningTeam.name} wins!
            </h2>
            <p className="text-sm font-bold" style={{ color: winningTeam.color }}>
              {iWon ? 'That is your crew.' : 'Better luck next series.'}
            </p>
          </>
        ) : (
          <>
            <Handshake className="w-16 h-16 mx-auto text-partyYellow" />
            <h2 className="text-4xl font-black text-white uppercase tracking-wider">Dead heat</h2>
            <p className="text-sm text-gray-300">Both crews finished level. Nobody is living that down.</p>
          </>
        )}
      </div>

      {/* Final score */}
      <div className="grid grid-cols-2 gap-3">
        {TEAMS.map((team) => {
          const crew = room.players.filter((p) => p.teamId === team.id);
          const won = room.winningTeam === team.id;
          return (
            <div
              key={team.id}
              className={`rounded-2xl border p-4 space-y-3 ${won ? 'bg-white/10' : 'bg-black/30 border-white/10'}`}
              style={{ borderColor: won ? team.color : undefined }}
            >
              <h3 className="font-black text-xs uppercase tracking-wider" style={{ color: team.color }}>
                {team.icon} {team.name}
              </h3>
              <p className="text-4xl font-black text-white tabular-nums">{scores[team.id]}</p>
              <div className="flex flex-wrap gap-2">
                {crew.map((member) => (
                  <div key={member.id} className="flex flex-col items-center gap-1 w-14">
                    <AvatarIllustration avatar={member.avatar} size="sm" />
                    <span className="text-[9px] font-bold text-gray-300 truncate w-full text-center">
                      {member.name}
                    </span>
                    <span className="text-[9px] font-mono text-gray-500">{member.score}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* What was actually played */}
      {room.teamBattleState && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">The series</p>
          <div className="flex flex-wrap gap-2">
            {room.teamBattleState.selectedGames.map((g, i) => (
              <span
                key={`${g}-${i}`}
                className="text-[11px] font-bold text-gray-200 bg-white/5 border border-white/10 rounded-full px-3 py-1"
              >
                {MINIGAME_ICONS[g]} {MINIGAME_LABELS[g]}
              </span>
            ))}
          </div>
        </div>
      )}

      {mvp && (
        <p className="text-center text-xs text-gray-400">
          Top scorer: <span className="text-partyYellow font-black">{mvp.name}</span> with {mvp.score} coins
        </p>
      )}

      <div className="flex justify-center pt-2">
        <button
          onClick={onGoHome}
          className="bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-base px-8 py-3.5 rounded-2xl transition-all flex items-center gap-2"
        >
          <Home className="w-5 h-5" />
          BACK TO HOME
        </button>
      </div>
    </motion.div>
  );
}
