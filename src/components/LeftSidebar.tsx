'use client';

import React from 'react';
import { Mic, Users, Trophy, MapPin } from 'lucide-react';
import { Player } from '@/lib/types';
import { MAX_PLAYERS, TOTAL_TILES } from '@/lib/gameRules';
import AvatarIllustration from './AvatarIllustration';

interface LeftSidebarProps {
  roomId: string;
  players: Player[];
  activePlayerId: string;
  leaderId: string;
  myPlayerId: string;
}

export default function LeftSidebar({ roomId, players, activePlayerId, leaderId, myPlayerId }: LeftSidebarProps) {
  return (
    <aside className="w-full lg:w-64 glass-card rounded-3xl p-5 border border-white/15 space-y-6 backdrop-blur-xl bg-slate-900/70 shadow-2xl flex flex-col justify-between shrink-0">
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
                    <MapPin className="w-2.5 h-2.5" /> {player.boardPosition + 1}/{TOTAL_TILES}
                  </span>
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
