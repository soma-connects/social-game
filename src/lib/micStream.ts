// Single owner of the microphone.
//
// Two features want the mic at once: the voice call sends it to peers, and the
// voice arena draws a level meter from it. Calling getUserMedia twice works on
// desktop Chrome but is unreliable on mobile, where the second call can fail or
// take the device from the first. So everything shares one stream, ref-counted.
//
// The Web Speech API is the exception — it opens its own capture internally and
// cannot be handed a MediaStream. That is a platform limitation, not a choice.

export type MicErrorCode =
  | 'insecure-context'
  | 'unsupported-browser'
  | 'permission-denied'
  | 'no-microphone'
  | 'unknown';

export interface MicError {
  code: MicErrorCode;
  message: string;
}

const MIC_ERROR_MESSAGES: Record<MicErrorCode, string> = {
  'insecure-context': 'The microphone only works over HTTPS. Open the game on its https:// link.',
  'unsupported-browser': 'This browser cannot capture microphone audio.',
  'permission-denied':
    'Microphone blocked. Tap the padlock in the address bar, allow the microphone, then try again.',
  'no-microphone': 'No microphone found. Plug one in or check your device audio settings.',
  unknown: 'The microphone could not start. Try again.',
};

export function micError(code: MicErrorCode): MicError {
  return { code, message: MIC_ERROR_MESSAGES[code] };
}

function classify(err: unknown): MicErrorCode {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no-microphone';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'no-microphone';
  return 'unknown';
}

/**
 * Phones hand the microphone to one consumer at a time.
 *
 * Desktop Chrome lets a getUserMedia stream and the Web Speech recogniser run
 * off the same device simultaneously. Android does not: whichever asked second
 * gets silence. Since the recogniser opens its own capture internally and
 * cannot be handed our MediaStream, the only way for both to work on a phone is
 * to put ours down while the recogniser is listening.
 *
 * Detected from the user agent rather than screen size — this is about the
 * platform's audio stack, not the size of the window.
 */
export function isMobileAudioPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

class MicStreamManager {
  private stream: MediaStream | null = null;
  private pending: Promise<MediaStream> | null = null;
  private refCount = 0;
  private muted = false;
  private listeners = new Set<(muted: boolean) => void>();
  /** Notified whenever the underlying track is swapped or dropped. */
  private streamListeners = new Set<(stream: MediaStream | null) => void>();
  /** True while the device is deliberately handed to the speech recogniser. */
  private suspended = false;
  /**
   * True while a live voice call is using the microphone.
   *
   * Handing the device to the speech recogniser is only safe when nobody else
   * needs it. With a call up, suspending takes this player off the air for the
   * length of the round and starves the attempt recorder at the same time —
   * which is exactly what happened in real play: the room could not hear each
   * other, and nothing got recorded.
   */
  private callActive = false;

  public setCallActive(active: boolean): void {
    this.callActive = active;
  }

  /** Whether it is safe to hand the device to the speech recogniser. */
  public canSuspendForSpeech(): boolean {
    return !this.callActive;
  }

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
    );
  }

  public getStream(): MediaStream | null {
    if (this.stream && this.stream.getAudioTracks().every((t) => t.readyState === 'ended')) {
      return null;
    }
    return this.stream;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public onMuteChange(cb: (muted: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Subscribes to the stream itself being replaced or dropped.
   *
   * The voice call needs this: when the device is suspended for the recogniser
   * its peer connections must detach the sender's track, and re-attach the new
   * one afterwards. Without it the call would keep a dead track and every peer
   * would hear silence for the rest of the session.
   */
  public onStreamChange(cb: (stream: MediaStream | null) => void): () => void {
    this.streamListeners.add(cb);
    return () => {
      this.streamListeners.delete(cb);
    };
  }

  private notifyStream(stream: MediaStream | null): void {
    this.streamListeners.forEach((cb) => cb(stream));
  }

  public isSuspended(): boolean {
    return this.suspended;
  }

  /**
   * Puts the microphone down so the speech recogniser can have it, keeping the
   * ref count intact so `resume` knows to pick it back up.
   *
   * Synchronous on purpose. iOS only allows speech recognition to start inside
   * a user gesture, and awaiting anything here would push the subsequent
   * `recognition.start()` out of that gesture and get it rejected.
   */
  public suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    // Release the track so mobile OS hands the hardware mic to speech recognition
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.notifyStream(null);
  }

  /** Picks the microphone back up after the recogniser is done with it. */
  public async resume(): Promise<void> {
    if (!this.suspended) return;
    this.suspended = false;
    if (this.refCount === 0) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.attachTrackListeners(stream);
      this.stream = stream;
      this.applyMute();
      this.notifyStream(stream);
    } catch {
      // The device did not come back. The call stays silent rather than broken,
      // and the next acquire will try again.
      this.stream = null;
    }
  }

  /**
   * Hands back the shared stream, prompting for permission on first use.
   * Every successful acquire must be paired with a release.
   */
  public async acquire(): Promise<{ stream: MediaStream | null; error: MicError | null }> {
    if (typeof window === 'undefined') return { stream: null, error: micError('unsupported-browser') };
    if (!window.isSecureContext) return { stream: null, error: micError('insecure-context') };
    if (!navigator.mediaDevices?.getUserMedia) {
      return { stream: null, error: micError('unsupported-browser') };
    }

    // A caller asking for the mic outranks a suspension: whatever wanted it for
    // speech has either finished or is about to be told the device moved.
    this.suspended = false;

    if (this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live')) {
      this.refCount++;
      return { stream: this.stream, error: null };
    }

    // Collapse concurrent callers onto one permission prompt.
    if (!this.pending) {
      this.pending = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    }

    try {
      const stream = await this.pending;
      this.pending = null;
      this.attachTrackListeners(stream);
      this.stream = stream;
      this.applyMute();
      this.refCount++;
      this.notifyStream(stream);
      return { stream, error: null };
    } catch (err) {
      this.pending = null;
      this.stream = null;
      return { stream: null, error: micError(classify(err)) };
    }
  }

  private attachTrackListeners(stream: MediaStream): void {
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        // Track was killed by mobile OS or external interruption
        if (this.callActive || this.refCount > 0) {
          void this.recoverDeadTrack();
        }
      };
      track.onmute = () => {
        // On iOS Safari, track may mute temporarily on backgrounding
      };
      track.onunmute = () => {
        this.applyMute();
      };
    });
  }

  private async recoverDeadTrack(): Promise<void> {
    if (this.suspended) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.attachTrackListeners(stream);
      this.stream = stream;
      this.applyMute();
      this.notifyStream(stream);
    } catch {
      /* could not auto-recover */
    }
  }

  public release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) this.stop();
  }

  /** Drops the device regardless of ref count. For leaving the game entirely. */
  public stop(): void {
    this.refCount = 0;
    this.suspended = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.notifyStream(null);
  }

  public setMuted(muted: boolean): boolean {
    this.muted = muted;
    this.applyMute();
    this.listeners.forEach((cb) => cb(this.muted));
    return this.muted;
  }

  public toggleMuted(): boolean {
    return this.setMuted(!this.muted);
  }

  private applyMute(): void {
    // Disabling the track keeps the peer connection alive but sends silence,
    // which is what a mute button should do on a call.
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !this.muted;
    });
  }
}

export const micStream = new MicStreamManager();
