// Captures a player's voice attempt so the room can hear it again.
//
// The whole point of the Roast Lounge is laughing at how someone said a word,
// and a flaw you cannot replay is a flaw nobody gets to enjoy. This records the
// attempt to a local Blob and hands back an object URL.
//
// Nothing is uploaded. The clip lives in the tab's memory, is revoked when it is
// replaced, and dies with the page. That keeps it free, private, and instant —
// no storage, no bandwidth, no consent problem beyond the mic already being open
// for the group call.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceClip {
  /** Object URL for an <audio> element. Revoked when replaced. */
  url: string;
  blob: Blob;
  durationMs: number;
}

export type RecorderErrorCode = 'unsupported' | 'no-stream' | 'failed';

interface Options {
  /** The stream to capture. Usually the shared mic, or a peer's remote audio. */
  stream: MediaStream | null;
  /** Recording runs while this is true. */
  active: boolean;
  /** Hard cap so a long turn cannot grow the buffer without bound. */
  maxMs?: number;
}

/** Picks a container the browser can actually produce. Safari differs from Chrome. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

export function useVoiceRecorder({ stream, active, maxMs = 15000 }: Options) {
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<RecorderErrorCode | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref so the cleanup path can revoke without re-running on clip change.
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    revoke();
    setClip(null);
    setError(null);
  }, [revoke]);

  const stop = useCallback(() => {
    if (capTimerRef.current) {
      clearTimeout(capTimerRef.current);
      capTimerRef.current = null;
    }
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop(); // onstop assembles the blob
      } catch {
        /* already torn down */
      }
    }
    setIsRecording(false);
  }, []);

  const start = useCallback(() => {
    if (recorderRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      setError('unsupported');
      return;
    }
    if (!stream || !stream.getAudioTracks().some((t) => t.readyState === 'live')) {
      setError('no-stream');
      return;
    }

    try {
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      rec.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      rec.onstop = () => {
        const parts = chunksRef.current;
        chunksRef.current = [];
        if (parts.length === 0) return;

        const blob = new Blob(parts, { type: mimeType || 'audio/webm' });
        // Silence still produces a container header, so ignore tiny blobs
        // rather than showing the room a replay button that plays nothing.
        if (blob.size < 1200) return;

        revoke();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setClip({ url, blob, durationMs: Date.now() - startedAtRef.current });
      };

      rec.onerror = () => setError('failed');

      // Timeslice keeps chunks flowing, so a tab suspend mid-turn still leaves
      // us with usable audio instead of one lost buffer.
      rec.start(500);
      recorderRef.current = rec;
      setIsRecording(true);
      setError(null);

      capTimerRef.current = setTimeout(stop, maxMs);
    } catch {
      setError('failed');
      recorderRef.current = null;
      setIsRecording(false);
    }
  }, [stream, maxMs, revoke, stop]);

  useEffect(() => {
    if (active) start();
    else stop();
  }, [active, start, stop]);

  // Tear down on unmount: stop the recorder and release the blob URL.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      recorderRef.current = null;
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
      if (capTimerRef.current) clearTimeout(capTimerRef.current);
      revoke();
    };
  }, [revoke]);

  return { clip, isRecording, error, reset, stop };
}
