'use client';

import React, { useEffect, useState } from 'react';
import { Mic, MicOff, PhoneCall, PhoneOff, Loader2, AlertTriangle, Volume2 } from 'lucide-react';
import { Player } from '@/lib/types';
import { voiceChat, VoiceState } from '@/lib/voiceChat';
import AvatarIllustration from './AvatarIllustration';

interface VoiceCallBarProps {
  roomId: string;
  players: Player[];
  myPlayer: Player;
  /** Ducks everyone else while the local player is being scored. */
  duckRemote: boolean;
  /** Closes this player's mic while somebody else is performing. */
  autoMute: boolean;
  /** Shrinks to a status line so it stops competing with the live round. */
  compact?: boolean;
  /** Connects the call without waiting for a tap, once the match is running. */
  autoJoin?: boolean;
}

/**
 * Collapses to a single status line while a round is being scored. Joining or
 * leaving the call mid-attempt is not something anyone does, and the full bar
 * was ~106px of the phone screen competing with the challenge itself.
 */
export default function VoiceCallBar({
  roomId,
  players,
  myPlayer,
  duckRemote,
  autoMute,
  compact = false,
  autoJoin = false,
}: VoiceCallBarProps) {
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
  // Delegated to voiceChat rather than tracked here: this component can
  // remount mid-call, and "the app muted this, not the player" has to survive
  // that or an auto-mute can get stuck with nothing left able to clear it.
  useEffect(() => {
    voiceChat.applyAutoMute(autoMute);
  }, [autoMute, state.status]);

  const handleJoin = async () => {
    setJoining(true);
    voiceChat.resumeAudio();
    await voiceChat.join(roomId, myPlayer.id, players.map((p) => p.id));
    setJoining(false);
  };

  /**
   * Prompt to join, rather than joining silently.
   *
   * Auto-join looked like the right call for a voice game — hearing each other
   * is the point. In practice it was the cause of the "I had to leave and
   * rejoin before I could hear anyone" bug: joining from an effect is not a
   * user gesture, so the browser refused to play any incoming audio and the
   * player sat on a healthy call in silence.
   *
   * A button press is a gesture. Making the join deliberate both answers the
   * request for a prompt and removes the condition that broke playback, which
   * is why this is a fix and not just a preference.
   */
  const shouldPrompt = autoJoin && state.status === 'off' && !joining;

  // A failed join must not lock the feature out for the session — a permission
  // prompt gets dismissed by accident all the time.
  const retry = () => {
    void handleJoin();
  };

  const isLive = state.status === 'live';
  const speakingIds = new Set(state.peers.filter((p) => p.speaking).map((p) => p.playerId));
  const connectedIds = new Set(
    state.peers.filter((p) => p.connection === 'connected').map((p) => p.playerId)
  );

  // Connected, unmuted, and still not a single byte leaving this device for
  // anyone. That combination cannot be explained by "still connecting" or
  // "muted" — both of those already have their own banners — so once every
  // connected peer has actually been measured, it is safe to say so plainly
  // instead of leaving a player to guess why the room cannot hear them.
  const connectedPeers = state.peers.filter((p) => p.connection === 'connected');
  const measuredPeers = connectedPeers.filter((p) => p.sendingAudio !== undefined);
  const notReachingAnyone =
    isLive &&
    !state.muted &&
    connectedPeers.length > 0 &&
    measuredPeers.length === connectedPeers.length &&
    measuredPeers.every((p) => !p.sendingAudio);

  // Mid-attempt: one status line, not the full bar.
  if (compact) {
    return (
      <div className="glass-card rounded-xl px-3 py-1.5 border border-white/10 bg-slate-900/70 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5 truncate">
          <PhoneCall className={`w-3 h-3 ${isLive ? 'text-emerald-400' : 'text-gray-500'}`} />
          {isLive ? 'Group voice live' : 'Group voice off'}
        </span>
        <span className="text-[11px] font-black flex items-center gap-1 shrink-0">
          {state.muted ? (
            <span className="text-amber-300 flex items-center gap-1">
              <MicOff className="w-3 h-3" /> MUTED
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-1">
              <Mic className="w-3 h-3" /> OPEN
            </span>
          )}
        </span>
      </div>
    );
  }

  // Everyone is here but nobody is on the call yet. This is deliberately loud:
  // it is the difference between a voice party game and a silent one.
  if (shouldPrompt) {
    return (
      <div className="glass-card rounded-2xl px-4 py-3.5 border border-emerald-400/50 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-3 animate-pulse-slow">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/25 text-emerald-300 flex items-center justify-center shrink-0">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-white">JOIN THE VOICE CALL</p>
            <p className="text-[11px] text-emerald-200/80">
              {players.length} in the room. Tap to talk and hear everyone.
            </p>
          </div>
        </div>
        <button
          onClick={handleJoin}
          className="bg-emerald-500 hover:bg-emerald-400 text-partyDark font-black text-sm px-6 py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shrink-0"
        >
          JOIN CALL
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl px-4 py-3 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 bg-slate-900/70">
      {/* The call is up but the browser refused to play incoming audio. Without
          this the player just hears nothing and has no idea why. */}
      {state.audioBlocked && (
        <button
          onClick={() => voiceChat.resumeAudio()}
          className="w-full mb-1 rounded-xl bg-amber-500/20 border border-amber-400/60 text-amber-100 text-xs font-black px-3 py-2 flex items-center justify-center gap-2 active:scale-95 transition"
        >
          <Volume2 className="w-4 h-4" /> TAP TO HEAR EVERYONE
        </button>
      )}

      {/* Connected and unmuted, but measured zero bytes actually leaving the
          device for every peer — the exact "they can't hear me" report that
          every other signal here reads as healthy. */}
      {notReachingAnyone && (
        <div className="w-full mb-1 rounded-xl bg-red-500/15 border border-red-400/50 text-red-100 text-xs font-bold px-3 py-2 flex items-start gap-2">
          <MicOff className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Nobody is receiving your audio. Check the mic permission for this site, make sure no other
            app has it, then leave and rejoin the call.
          </span>
        </div>
      )}
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
            onClick={retry}
            disabled={joining || players.length < 2}
            title={players.length < 2 ? 'Wait for another player to join the room' : undefined}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-partyDark font-black text-xs flex items-center gap-1.5 transition-all shadow"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>{state.status === 'error' ? 'RETRY VOICE' : 'JOIN VOICE'}</span>
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
