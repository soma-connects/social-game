'use client';

import { useEffect, useState } from 'react';
import { voiceChat } from './voiceChat';
import type { MiniGameId } from './types';

/**
 * Live gameplay frames, so the room watches the attempt rather than a number.
 *
 * The room already broadcasts a `liveState` through the server, but that is a
 * Firestore round trip throttled to one update every 1.5 seconds — fine for
 * "she is on the word ACCOMMODATE", useless for watching a bird rise and fall.
 * These frames go peer to peer over the data channel on the voice connection,
 * which costs nothing per frame and arrives in milliseconds.
 *
 * The two are complements, not rivals. This is the smooth picture for people on
 * the call; `liveState` remains the durable one, and is what a player with no
 * microphone, a spectator, or someone whose connection has not finished
 * negotiating still sees.
 */

/** Roughly 20fps. Below this the motion stops reading as motion. */
const FRAME_INTERVAL_MS = 50;

export type LiveFrame = {
  playerId: string;
  game: MiniGameId;
  /**
   * Whatever the game needs to mirror itself, kept small — this ships twenty
   * times a second to every player in the room.
   */
  data: Record<string, number | string | boolean>;
  at: number;
};

let lastSentAt = 0;

/**
 * Broadcasts one frame of the current attempt, rate-limited.
 *
 * Safe to call from inside a render loop: calls that arrive too soon after the
 * last one are dropped rather than queued, because a frame of a moving bird is
 * worthless a moment later.
 */
export function publishFrame(
  playerId: string,
  game: MiniGameId,
  data: LiveFrame['data'],
): void {
  const now = Date.now();
  if (now - lastSentAt < FRAME_INTERVAL_MS) return;
  lastSentAt = now;

  try {
    voiceChat.broadcastFrame(JSON.stringify({ playerId, game, data, at: now } satisfies LiveFrame));
  } catch {
    // Nothing here is worth interrupting a game loop for.
  }
}

/** Raw subscription. Prefer `useLiveFrame` inside a component. */
export function subscribeFrames(handler: (frame: LiveFrame) => void): () => void {
  return voiceChat.onFrame((payload) => {
    try {
      const frame = JSON.parse(payload) as LiveFrame;
      if (frame && typeof frame.playerId === 'string' && frame.data) handler(frame);
    } catch {
      // Malformed frame from a peer running a different build. Ignore it.
    }
  });
}

/** How long a frame stays on screen before the view admits it went quiet. */
const STALE_MS = 1200;

/**
 * The latest frame from `playerId`, or null when nothing recent has arrived.
 *
 * Goes null rather than freezing on the last frame, so a spectator sees the
 * mirror stop instead of watching a bird hang mid-air after somebody's
 * connection dropped.
 */
export function useLiveFrame(playerId: string | undefined): LiveFrame | null {
  const [frame, setFrame] = useState<LiveFrame | null>(null);

  useEffect(() => {
    if (!playerId) {
      setFrame(null);
      return;
    }

    let latest: LiveFrame | null = null;
    const stop = subscribeFrames((incoming) => {
      if (incoming.playerId !== playerId) return;
      latest = incoming;
      setFrame(incoming);
    });

    const sweep = setInterval(() => {
      if (latest && Date.now() - latest.at > STALE_MS) {
        latest = null;
        setFrame(null);
      }
    }, 400);

    return () => {
      stop();
      clearInterval(sweep);
    };
  }, [playerId]);

  return frame;
}
