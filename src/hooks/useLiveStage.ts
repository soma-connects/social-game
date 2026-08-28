'use client';

// The two ends of the live stage, as hooks.
//
// `useLiveBroadcast` is what a mini-game calls to put itself on the room's
// screens. `useLiveStage` is what the spectator view calls to watch. Neither
// knows about peer connections — that is liveLink's job — so a game only ever
// says what is happening and a spectator only ever asks what is.

import { useEffect, useRef, useState } from 'react';
import { LiveFrame, LiveOutgoing, LiveSnapshot, LIVE_STALE_MS, liveLink } from '@/lib/liveLink';
import { voiceChat } from '@/lib/voiceChat';

/**
 * Broadcasts this player's game to the room.
 *
 * `active` is what turns it on and off, and turning it off matters as much as
 * turning it on: a canvas left publishing after the turn ends keeps a video
 * encoder running on somebody's phone for the rest of the night.
 */
export function useLiveBroadcast(active: boolean): {
  send: (frame: LiveOutgoing) => void;
  publishCanvas: (canvas: HTMLCanvasElement | null) => void;
} {
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (active) return;
    liveLink.stopPublishing();
  }, [active]);

  // Whatever happens — turn over, navigation, a crash in the game above — the
  // broadcast must not outlive the component that started it.
  useEffect(() => () => liveLink.stopPublishing(), []);

  const send = useRef((frame: LiveOutgoing) => {
    if (!activeRef.current) return;
    liveLink.send(frame);
  }).current;

  const publishCanvas = useRef((canvas: HTMLCanvasElement | null) => {
    if (!activeRef.current) {
      liveLink.stopPublishing();
      return;
    }
    liveLink.publishCanvas(canvas);
  }).current;

  return { send, publishCanvas };
}

/**
 * Watches whoever is performing.
 *
 * Returns the latest frame, the video stream if one is arriving, and whether
 * what is on screen is current. Staleness is exposed rather than hidden: a
 * frozen picture with no explanation reads as the app being broken, where
 * "lost their signal" reads as the network being the network.
 */
export function useLiveStage(performerId: string | null): {
  frame: LiveFrame | null;
  via: 'mesh' | 'room' | null;
  fresh: boolean;
  video: MediaStream | null;
} {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(() => liveLink.getSnapshot());
  const [video, setVideo] = useState<MediaStream | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => liveLink.subscribe(setSnapshot), []);

  // Video arrives on its own schedule, unrelated to the state frames.
  useEffect(() => {
    if (!performerId) {
      setVideo(null);
      return;
    }
    const sync = () => setVideo(voiceChat.getRemoteVideo(performerId));
    sync();
    return voiceChat.onVideoChange(sync);
  }, [performerId]);

  // Freshness is a function of time, not of new data — nothing arriving is
  // exactly the case that has to re-render.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, []);

  const belongsToPerformer = !!snapshot && (!performerId || snapshot.frame.from === performerId);
  const fresh = belongsToPerformer && Date.now() - snapshot!.at < LIVE_STALE_MS;

  return {
    frame: belongsToPerformer ? snapshot!.frame : null,
    via: belongsToPerformer ? snapshot!.via : null,
    fresh,
    video,
  };
}
