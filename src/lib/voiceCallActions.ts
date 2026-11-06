import { useEffect, useState } from 'react';
import { voiceChat, VoiceState } from './voiceChat';

/**
 * The two things every voice control does: join the call, and mute.
 *
 * The full call bar was the only control, and it collapses to a status line
 * during a round and is hidden on the phone board, so a player who missed the
 * lobby prompt had no way onto the call for the rest of the match. The smaller
 * controls added for that reason share these rather than copying them.
 */

/** Joins from a tap. Must run from a gesture, or the browser blocks the incoming audio. */
export async function joinVoiceCall(
  roomId: string,
  myPlayerId: string,
  playerIds: string[],
  micLive: boolean
): Promise<void> {
  voiceChat.resumeAudio();
  await voiceChat.join(roomId, myPlayerId, playerIds);
  // Joining a stranger room connects you so you can hear the others. It does
  // not open your microphone; that takes a separate, deliberate tap.
  voiceChat.setMicConsent(micLive);
}

/**
 * Mute or unmute by hand.
 *
 * In a public room the button carries consent both ways: an explicit un-mute
 * is an opt-in rather than a way around the default, and an explicit mute
 * cannot be undone by the end of the next round. In a private room it is just
 * a local toggle. Returns whether the mic is now muted.
 */
export function toggleVoiceMute(options: {
  isStranger: boolean;
  micLive: boolean;
  onMicOptIn?: (optIn: boolean) => void;
}): boolean {
  const nowMuted = voiceChat.toggleMuted();
  if (!options.isStranger) return nowMuted;
  if (!nowMuted && !options.micLive) options.onMicOptIn?.(true);
  if (nowMuted && options.micLive) options.onMicOptIn?.(false);
  return nowMuted;
}

/** The call's live state, for any component that shows it. */
export function useVoiceState(): VoiceState {
  const [state, setState] = useState<VoiceState>(() => voiceChat.getState());
  useEffect(() => voiceChat.subscribe(setState), []);
  return state;
}
