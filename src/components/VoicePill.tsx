'use client';

import React, { useState } from 'react';
import { Loader2, Mic, MicOff, PhoneCall } from 'lucide-react';
import { Player } from '@/lib/types';
import { joinVoiceCall, toggleVoiceMute, useVoiceState } from '@/lib/voiceCallActions';

interface VoicePillProps {
  roomId: string;
  players: Player[];
  myPlayer: Player;
  micLive: boolean;
  isStranger: boolean;
  onMicOptIn?: (optIn: boolean) => void;
}

/**
 * The voice call in one small button, for screens with no room for the bar.
 *
 * On a phone the board fills the screen and the call bar is hidden, so anyone
 * not already on the call could not get on it until the next mini-game. Off
 * the call this is a JOIN CALL button; on it, a mute switch.
 *
 * Only ever an extra control: the full VoiceCallBar stays mounted underneath,
 * because unmounting it is what hangs up.
 */
export default function VoicePill({ roomId, players, myPlayer, micLive, isStranger, onMicOptIn }: VoicePillProps) {
  const state = useVoiceState();
  const [joining, setJoining] = useState(false);
  const alone = players.length < 2;

  const base =
    'flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-black shadow-xl backdrop-blur active:scale-95 transition';

  if (state.status === 'connecting' || joining) {
    return (
      <span className={`${base} border-white/20 bg-slate-950/85 text-gray-200`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> CONNECTING
      </span>
    );
  }

  if (state.status !== 'live') {
    return (
      <button
        type="button"
        disabled={alone}
        onClick={async () => {
          setJoining(true);
          try {
            await joinVoiceCall(roomId, myPlayer.id, players.map((p) => p.id), micLive);
          } finally {
            setJoining(false);
          }
        }}
        title={alone ? 'Opens once someone else is in the room' : 'Talk and hear everyone'}
        className={`${base} border-emerald-300 bg-emerald-500 text-partyDark disabled:opacity-50`}
      >
        <PhoneCall className="h-3.5 w-3.5" />
        {state.status === 'error' ? 'RETRY CALL' : 'JOIN CALL'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggleVoiceMute({ isStranger, micLive, onMicOptIn })}
      aria-label={state.muted ? 'Unmute your mic on the call' : 'Mute your mic on the call'}
      className={`${base} ${
        state.muted
          ? 'border-red-400/60 bg-red-500/80 text-white'
          : 'border-emerald-400/60 bg-slate-950/85 text-emerald-300'
      }`}
    >
      {state.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
      {state.muted ? 'MUTED' : 'ON CALL'}
    </button>
  );
}
