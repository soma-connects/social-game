'use client';

import React from 'react';
import { Mic, Users, Trophy, MapPin, UserMinus, WifiOff } from 'lucide-react';
import { Player } from '@/lib/types';
import { BOARD_LENGTH, MAX_PLAYERS, TEAMS, boardProgress, getTeam } from '@/lib/gameRules';
import AvatarIllustration from './AvatarIllustration';

interface LeftSidebarProps {
  roomId: string;
  players: Player[];
  activePlayerId: string;
  leaderId: string;
  myPlayerId: string;
  /** Only the host gets the remove control. */
  canManage?: boolean;
  onKickPlayer?: (player: Player) => void;
  roomType?: 'board_game' | 'team_battle';
}

export default function LeftSidebar({
  roomId,
  players,
  activePlayerId,
  leaderId,
  myPlayerId,
  canManage = false,
  onKickPlayer,
  roomType = 'board_game',
}: LeftSidebarProps) {
  return (
    <aside className="hidden lg:flex w-64 glass-card rounded-3xl p-5 border border-white/15 space-y-6 backdrop-blur-xl bg-slate-900/70 shadow-2xl flex-col justify-between shrink-0">
      <div className="space-y-5">
        <div className="space-y-2 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-partyCyan tracking-wider uppercase">ROOM CODE</span>
            <span className="text-xs font-mono font-bold text-partyYellow bg-partyYellow/20 px-2.5 py-0.5 rounded-full border border-partyYellow/30">
              {roomId}
            </span>
          </div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-partyYellow" /> PLAYERS ({players.length}/{MAX_PLAYERS})
          </h2>

          {/* Crew scoreboard — the number that actually matters in team mode */}
          {roomType === 'team_battle' && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {TEAMS.map((team) => {
                const members = players.filter((p) => p.teamId === team.id);
                return (
                  <div
                    key={team.id}
                    className="rounded-xl px-2 py-1.5 border text-center"
                    style={{ borderColor: `${team.color}66`, backgroundColor: `${team.color}1A` }}
                  >
                    <p className="text-[9px] font-black tracking-wider" style={{ color: team.color }}>
                      {team.icon} {team.name.toUpperCase()}
                    </p>
                    <p className="text-sm font-black text-white leading-tight">
                      {members.reduce((sum, m) => sum + m.score, 0)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {players.map((player) => {
            const isTurn = player.id === activePlayerId;
            const isLeader = player.id === leaderId && player.score > 0;
            const isMe = player.id === myPlayerId;

            return (
              <div
                key={player.id}
                className={`p-3 rounded-2xl border transition-all relative flex items-center justify-between gap-2 ${
                  isTurn
                    ? 'bg-partyPurple/40 border-partyCyan shadow-lg glow-purple'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}
              >
                {isLeader && (
                  <div className="absolute -top-3 right-3 text-lg animate-bounce" title="Current leader">
                    👑
                  </div>
                )}

                <div className="flex items-center gap-3 min-w-0">
                  <AvatarIllustration avatar={player.avatar} size="sm" isSpeaking={isTurn} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-extrabold text-xs text-white max-w-[80px] truncate">{player.name}</h4>
                      {isMe && (
                        <span className="bg-partyCyan text-partyDark text-[8px] px-1 py-px rounded font-black">YOU</span>
                      )}
                      {player.isHost && (
                        <span className="bg-partyYellow text-partyDark text-[8px] px-1 py-px rounded font-black">
                          HOST
                        </span>
                      )}
                      {roomType === 'team_battle' && player.teamId && (
                        <span
                          className="text-[8px] px-1 py-px rounded font-black text-white"
                          style={{ backgroundColor: getTeam(player.teamId).color }}
                        >
                          {getTeam(player.teamId).icon}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-partyCyan font-bold flex items-center gap-1">
                      <Trophy className="w-2.5 h-2.5" /> {player.score} pts
                    </p>
                    <p className="text-[9px] text-gray-400 font-bold truncate">
                      LVL {player.level ?? 1} · VIBE {player.vibeScore ?? 0}
                    </p>
                    {(player.badges ?? []).length > 0 && (
                      <p className="text-[9px] text-partyYellow font-black truncate">
                        {(player.badges ?? []).slice(-1)[0]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  {isTurn && <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />}
                  <span className="text-[9px] font-mono text-gray-400 flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" /> {boardProgress(player.boardPosition)}/{BOARD_LENGTH}
                  </span>

                  {/* Presence — a dropped player is why a round would otherwise hang */}
                  {player.connected === false && (
                    <span className="text-[8px] font-black text-amber-300 bg-amber-500/20 border border-amber-500/40 px-1 rounded flex items-center gap-0.5">
                      <WifiOff className="w-2 h-2" /> GONE
                    </span>
                  )}

                  {canManage && !player.isHost && !isMe && (
                    <button
                      onClick={() => onKickPlayer?.(player)}
                      title={`Remove ${player.name}`}
                      className="text-gray-500 hover:text-red-400 transition-colors p-0.5 rounded"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 text-center">
        <p className="text-[10px] text-gray-400 font-mono">MARIO PARTY + JACKBOX VIBES</p>
      </div>
    </aside>
  );
}
