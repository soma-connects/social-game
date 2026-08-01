'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneCall, PhoneOff, Loader2, AlertTriangle } from 'lucide-react';
import { Player } from '@/lib/types';
import { voiceChat, VoiceState } from '@/lib/voiceChat';
import { micStream } from '@/lib/micStream';
import AvatarIllustration from './AvatarIllustration';

interface VoiceCallBarProps {
  roomId: string;
  players: Player[];
  myPlayer: Player;
  /** Ducks everyone else while the local player is being scored. */
  duckRemote: boolean;
  /** Closes this player's mic while somebody else is performing. */
  autoMute: boolean;
}

export default function VoiceCallBar({ roomId, players, myPlayer, duckRemote, autoMute }: VoiceCallBarProps) {
  const [state, setState] = useState<VoiceState>(voiceChat.getState());
  const [joining, setJoining] = useState(false);

  useEffect(() => voiceChat.subscribe(setState), []);

  // Keep the mesh in step with who is actually in the room.
  useEffect(() => {
    if (voiceChat.isJoined()) {
      voiceChat.syncPeers(players.map((p) => p.id));
    }
  }, [players]);

  // Leave the call when the player leaves the game.
  useEffect(() => () => voiceChat.leave(), []);

  // While the arena is listening, drop everyone else to a murmur so the speech
  // recogniser picks up this player rather than the rest of the room.
  useEffect(() => {
    voiceChat.setRemoteVolume(duckRemote ? 0.15 : 1);
  }, [duckRemote]);

  // Voice-first turn gating.
  //
  // The game is meant to be talked over, but not *while* someone is being
  // scored — a room laughing into their mics is what the recogniser hears
  // instead of the performer. So during an attempt everyone else is closed,
  // and the reaction buttons carry the room for those few seconds. When the
  // roast opens, mics come back and people talk again.
  //
  // Tracked separately from the mute button: if a player muted themselves we
  // must not helpfully unmute them when the roast starts.
  const autoMutedRef = useRef(false);
  useEffect(() => {
    if (!voiceChat.isJoined()) return;

    if (autoMute && !micStream.isMuted()) {
      voiceChat.setMuted(true);
      autoMutedRef.current = true;
    } else if (!autoMute && autoMutedRef.current) {
      voiceChat.setMuted(false);
      autoMutedRef.current = false;
    }
  }, [autoMute, state.status]);

  const handleJoin = async () => {
    setJoining(true);
    await voiceChat.join(roomId, myPlayer.id, players.map((p) => p.id));
    setJoining(false);
  };

  const isLive = state.status === 'live';
  const speakingIds = new Set(state.peers.filter((p) => p.speaking).map((p) => p.playerId));
  const connectedIds = new Set(
    state.peers.filter((p) => p.connection === 'connected').map((p) => p.playerId)
  );

  return (
    <div className="glass-card rounded-2xl px-4 py-3 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 bg-slate-900/70">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isLive ? 'bg-emerald-500/25 text-emerald-400' : 'bg-white/10 text-gray-400'
          }`}
        >
          {state.status === 'connecting' || joining ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PhoneCall className={`w-4 h-4 ${isLive ? 'animate-pulse' : ''}`} />
          )}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-black text-white uppercase tracking-wide">
            {isLive ? 'GROUP VOICE LIVE' : state.status === 'connecting' ? 'CONNECTING…' : 'GROUP VOICE OFF'}
          </p>
          <p className="text-[11px] text-gray-400">
            {isLive
              ? `${connectedIds.size} of ${Math.max(0, players.length - 1)} ${
                  players.length - 1 === 1 ? 'player' : 'players'
                } connected`
              : 'Talk to your crew while you play'}
          </p>
        </div>
      </div>

      {/* Who is talking right now */}
      {isLive && (
        <div className="flex items-center gap-1.5">
          {players.map((player) => {
            const isMe = player.id === myPlayer.id;
            const talking = isMe ? state.speaking : speakingIds.has(player.id);
            const connected = isMe || connectedIds.has(player.id);
            return (
              <div
                key={player.id}
                title={`${player.name}${connected ? '' : ' (connecting)'}`}
                className={`transition-opacity ${connected ? 'opacity-100' : 'opacity-40'}`}
              >
                <AvatarIllustration avatar={player.avatar} size="xs" isSpeaking={talking} />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        {isLive && (
          <button
            onClick={() => voiceChat.toggleMuted()}
            className={`px-3 py-2 rounded-xl border font-black text-xs flex items-center gap-1.5 transition-all ${
              state.muted
                ? 'bg-red-500/25 text-red-300 border-red-500/50'
                : 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50'
            }`}
          >
            {state.muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{state.muted ? 'UNMUTE' : 'MUTE'}</span>
          </button>
        )}

        {isLive ? (
          <button
            onClick={() => voiceChat.leave()}
            className="px-3 py-2 rounded-xl bg-red-500/25 text-red-300 border border-red-500/50 font-black text-xs flex items-center gap-1.5 transition-all hover:bg-red-500/40"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">LEAVE</span>
          </button>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining || players.length < 2}
            title={players.length < 2 ? 'Wait for another player to join the room' : undefined}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-partyDark font-black text-xs flex items-center gap-1.5 transition-all shadow"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>JOIN VOICE</span>
          </button>
        )}
      </div>

      {state.error && (
        <div className="w-full flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{state.error}</span>
        </div>
      )}
    </div>
  );
}
