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

class MicStreamManager {
  private stream: MediaStream | null = null;
  private pending: Promise<MediaStream> | null = null;
  private refCount = 0;
  private muted = false;
  private listeners = new Set<(muted: boolean) => void>();

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
    );
  }

  public getStream(): MediaStream | null {
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
   * Hands back the shared stream, prompting for permission on first use.
   * Every successful acquire must be paired with a release.
   */
  public async acquire(): Promise<{ stream: MediaStream | null; error: MicError | null }> {
    if (typeof window === 'undefined') return { stream: null, error: micError('unsupported-browser') };
    if (!window.isSecureContext) return { stream: null, error: micError('insecure-context') };
    if (!navigator.mediaDevices?.getUserMedia) {
      return { stream: null, error: micError('unsupported-browser') };
    }

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
      this.stream = stream;
      this.applyMute();
      this.refCount++;
      return { stream, error: null };
    } catch (err) {
      this.pending = null;
      this.stream = null;
      return { stream: null, error: micError(classify(err)) };
    }
  }

  public release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) this.stop();
  }

  /** Drops the device regardless of ref count. For leaving the game entirely. */
  public stop(): void {
    this.refCount = 0;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
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
