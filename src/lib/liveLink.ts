'use client';

// Watching somebody else play, as it happens.
//
// The room already knew what a performer was doing, but only roughly: a summary
// written into the room document at most once every 1.5 seconds, which is a
// scoreboard, not a game. This carries the same information sixty times faster,
// and the actual picture alongside it.
//
// Two paths, because they fail in different places:
//
//   1. The peer mesh. Voice already holds a connection to everyone in the room,
//      so live state rides a data channel on it and the performer's canvas
//      rides a video track. No server, no writes, no polling — and no cost.
//   2. The room document, unchanged, at its old slow rate.
//
// The second is the floor, not the plan. Somebody who never joined the voice
// call has no data channel to receive on, and they still deserve to see what is
// happening — just less of it, less often.

import { MiniGameId } from './types';
import { voiceChat } from './voiceChat';

/** Bumped if the shape below ever changes, so old senders can be ignored. */
const FRAME_VERSION = 1;

/** What the performer is doing, as of one moment. */
export type LiveFrame = {
  v: number;
  /** Player id of whoever is performing. */
  from: string;
  /** Which game, so a spectator can label and lay it out. */
  game: MiniGameId | 'karaoke' | 'other';
  /** Sender's clock. Used only to drop frames that arrive out of order. */
  t: number;
  /** The challenge itself — the word, the note, the question. */
  prompt?: string;
  /** Secondary line: phonetic, translation, instruction. */
  detail?: string;
  /** What is happening right now — transcript, "GO HIGHER", "CRASHED". */
  status?: string;
  /** Running score during the attempt. */
  score?: number;
  /** 0..1 through the attempt. */
  progress?: number;
  /** Whether it is currently going well, for colour. */
  good?: boolean;
  /** Lives, shields, wave — whatever this game counts down. */
  meter?: { label: string; value: number; max: number };
};

/** What a game hands to `send`. Identity and timing are added on the way out. */
export type LiveOutgoing = Omit<LiveFrame, 'v' | 't' | 'from'>;

export type LiveSnapshot = {
  frame: LiveFrame;
  /** Epoch ms this client received it. */
  at: number;
  /** How it arrived, so the UI can be honest about what it is showing. */
  via: 'mesh' | 'room';
};

/**
 * Frames older than this are not shown.
 *
 * Generous relative to the send rate — a performer sending ten a second can
 * miss twenty in a row and still not be declared stalled. It is here to catch
 * somebody closing their tab mid-turn, not to police jitter.
 */
export const LIVE_STALE_MS = 2500;

/** Ten a second. Fast enough to read as live, slow enough to cost nothing. */
export const LIVE_SEND_INTERVAL_MS = 100;

type Listener = (snapshot: LiveSnapshot | null) => void;

class LiveLinkManager {
  private snapshot: LiveSnapshot | null = null;
  private listeners = new Set<Listener>();
  private unsubscribeMesh: (() => void) | null = null;

  /** Last frame sent, so an unchanged one is never sent twice. */
  private lastSentBody = '';
  private lastSentAt = 0;

  /** The canvas being broadcast, and the stream captured from it. */
  private captured: MediaStream | null = null;
  private capturedFrom: HTMLCanvasElement | null = null;

  // ── receiving ─────────────────────────────────────────────────────────────

  private start(): void {
    if (this.unsubscribeMesh) return;
    this.unsubscribeMesh = voiceChat.onLiveData((raw, from) => this.ingest(raw, from));
  }

  private stop(): void {
    this.unsubscribeMesh?.();
    this.unsubscribeMesh = null;
  }

  private ingest(raw: string, from: string): void {
    let frame: LiveFrame;
    try {
      frame = JSON.parse(raw) as LiveFrame;
    } catch {
      return;
    }
    if (frame?.v !== FRAME_VERSION) return;

    // The channel is unordered, so frames genuinely do arrive out of sequence.
    // Showing an older one after a newer one makes a smooth game look like it
    // is stuttering backwards.
    if (this.snapshot && this.snapshot.frame.from === frame.from && frame.t <= this.snapshot.frame.t) {
      return;
    }

    // Trust the connection for identity rather than the payload: `from` is the
    // peer the message actually arrived on, and a client claiming to be
    // somebody else should not be able to take over the stage.
    this.publish({ frame: { ...frame, from }, at: Date.now(), via: 'mesh' });
  }

  /**
   * Feeds in the room document's slower copy.
   *
   * Ignored while the mesh is delivering, so a 1.5-second-old summary never
   * overwrites a 100-millisecond-old frame.
   */
  public ingestRoomState(state: {
    playerId: string;
    game?: MiniGameId;
    at?: number;
    prompt?: string;
    detail?: string;
    status?: string;
    score?: number;
    progress?: number;
    good?: boolean;
  } | null): void {
    if (!state) return;
    if (this.snapshot?.via === 'mesh' && Date.now() - this.snapshot.at < LIVE_STALE_MS) return;
    if (this.snapshot?.at && (state.at ?? 0) <= this.snapshot.frame.t) return;

    this.publish({
      frame: {
        v: FRAME_VERSION,
        from: state.playerId,
        game: state.game ?? 'other',
        t: state.at ?? Date.now(),
        prompt: state.prompt,
        detail: state.detail,
        status: state.status,
        score: state.score,
        progress: state.progress,
        good: state.good,
      },
      at: Date.now(),
      via: 'room',
    });
  }

  private publish(snapshot: LiveSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((cb) => cb(snapshot));
  }

  public getSnapshot(): LiveSnapshot | null {
    return this.snapshot;
  }

  public subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    this.start();
    cb(this.snapshot);
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) this.stop();
    };
  }

  /** Drops whatever is on the stage. Called when a turn ends. */
  public clear(): void {
    this.snapshot = null;
    this.listeners.forEach((cb) => cb(null));
  }

  // ── sending ───────────────────────────────────────────────────────────────

  /**
   * Broadcasts what this player is doing.
   *
   * Throttled and deduplicated: a game loop calls this every frame, and most
   * frames say exactly what the last one did.
   */
  public send(frame: LiveOutgoing): void {
    const now = Date.now();
    if (now - this.lastSentAt < LIVE_SEND_INTERVAL_MS) return;

    const body = JSON.stringify(frame);
    if (body === this.lastSentBody) return;

    this.lastSentAt = now;
    this.lastSentBody = body;
    // `from` is filled in by the receiver from the connection the frame arrived
    // on, so the sender never has to name itself — and cannot name somebody
    // else.
    voiceChat.sendLiveData(JSON.stringify({ ...frame, from: '', v: FRAME_VERSION, t: now }));
  }

  /**
   * Starts sending a canvas to the room as video.
   *
   * Capped hard on frame rate. The point is that the room can follow the game,
   * not that they get a perfect copy — and the sender is a phone that is also
   * running the game, holding a voice call and listening to a microphone.
   */
  public publishCanvas(canvas: HTMLCanvasElement | null, fps = 12): void {
    if (!canvas) {
      this.stopPublishing();
      return;
    }
    if (this.capturedFrom === canvas && this.captured) return;

    this.stopPublishing();
    try {
      // Not every browser has it, and a missing capture must degrade to the
      // state-only mirror rather than throwing inside a game loop.
      const stream = (canvas as HTMLCanvasElement & {
        captureStream?: (rate?: number) => MediaStream;
      }).captureStream?.(fps);
      if (!stream) return;

      this.captured = stream;
      this.capturedFrom = canvas;
      voiceChat.publishVideo(stream);
    } catch {
      this.captured = null;
      this.capturedFrom = null;
    }
  }

  public stopPublishing(): void {
    if (this.captured) {
      this.captured.getTracks().forEach((track) => track.stop());
      this.captured = null;
    }
    this.capturedFrom = null;
    this.lastSentBody = '';
    voiceChat.publishVideo(null);
  }
}

export const liveLink = new LiveLinkManager();
