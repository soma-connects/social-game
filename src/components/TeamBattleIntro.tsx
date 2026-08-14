'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Swords, Play } from 'lucide-react';
import { RoomState, Player } from '@/lib/types';
import { MINIGAME_ICONS, MINIGAME_LABELS, TEAMS, getTeam } from '@/lib/gameRules';
import { roomStore } from '@/lib/roomStore';
import AvatarIllustration from './AvatarIllustration';

interface TeamBattleIntroProps {
  room: RoomState;
  myPlayer: Player;
}

/**
 * The card between games in a Team Battle series.
 *
 * This phase existed in the state machine but had no screen at all — starting a
 * series dropped the room onto a blank page with no way forward. It is also the
 * only moment the two crews are shown side by side, which is the whole point of
 * the mode.
 */
export default function TeamBattleIntro({ room, myPlayer }: TeamBattleIntroProps) {
  const state = room.teamBattleState;
  const isHost = room.hostId === myPlayer.id;
  if (!state) return null;

  const game = state.selectedGames[state.currentGameIndex];
  const scores = room.teamScores ?? { red: 0, blue: 0 };
  const myTeam = myPlayer.teamId ? getTeam(myPlayer.teamId) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-3xl mx-auto space-y-6"
    >
      <div className="text-center space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-partyYellow">
          Game {state.currentGameIndex + 1} of {state.seriesLength}
        </p>
        <div className="text-6xl sm:text-7xl">{MINIGAME_ICONS[game]}</div>
        <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-wider">
          {MINIGAME_LABELS[game]}
        </h2>
        <p className="text-sm text-gray-300">
          Everyone performs once. Your points go to your crew.
        </p>
      </div>

      {/* The two crews, with the running series score. */}
      <div className="grid grid-cols-2 gap-3">
        {TEAMS.map((team) => {
          const crew = room.players.filter((p) => p.teamId === team.id);
          const mine = myPlayer.teamId === team.id;
          return (
            <div
              key={team.id}
              className={`rounded-2xl border p-4 space-y-3 transition-all ${
                mine ? 'bg-white/10 shadow-lg' : 'bg-black/30 border-white/10'
              }`}
              style={{ borderColor: mine ? team.color : undefined }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-black text-sm uppercase tracking-wider" style={{ color: team.color }}>
                  {team.icon} {team.name}
                </h3>
                <span className="text-2xl font-black text-white tabular-nums">{scores[team.id]}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {crew.length === 0 ? (
                  <p className="text-[11px] text-gray-500">Nobody on this crew yet</p>
                ) : (
                  crew.map((member) => (
                    <div key={member.id} className="flex flex-col items-center gap-1 w-14">
                      <AvatarIllustration avatar={member.avatar} size="sm" />
                      <span className="text-[9px] font-bold text-gray-300 truncate w-full text-center">
                        {member.name}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3 pt-2">
        {myTeam && (
          <p className="text-xs font-bold" style={{ color: myTeam.color }}>
            You are performing for {myTeam.name}
          </p>
        )}

        {isHost ? (
          <button
            onClick={() => roomStore.teamBattleBeginGame(room.roomId)}
            className="px-10 py-4 bg-partyYellow text-partyDark font-black text-lg rounded-full hover:bg-yellow-400 hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-3"
          >
            <Play className="w-5 h-5" />
            START {MINIGAME_LABELS[game].toUpperCase()}
          </button>
        ) : (
          <div className="glass-pill px-6 py-3 text-sm text-gray-300 animate-pulse flex items-center gap-2">
            <Swords className="w-4 h-4" /> Waiting for the host to start…
          </div>
        )}
      </div>
    </motion.div>
  );
}
