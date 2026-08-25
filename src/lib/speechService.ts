// Microphone access + speech recognition for the voice arena.
//
// Two independent audio paths are involved and it matters which is which:
//
//   1. A MediaStream from getUserMedia, owned by this service, used only to draw
//      the live volume meter. We can mute this by disabling its tracks.
//   2. The Web Speech API, which opens its own capture internally and cannot be
//      fed our MediaStream. "Muting" recognition therefore means stopping it.
//
// Nothing here fakes a result. If the mic is blocked, or the browser has no
// speech recognition, callers get an error and the UI has to say so.

import { isMobileAudioPlatform, micStream } from './micStream';

export type STTStatus = 'idle' | 'listening' | 'processing' | 'matched' | 'failed' | 'error';

export type SpeechErrorCode =
  | 'unsupported-browser'
  | 'insecure-context'
  | 'permission-denied'
  | 'no-microphone'
  | 'no-speech'
  | 'network'
  | 'language-unsupported'
  | 'aborted'
  | 'unknown';

export interface SpeechError {
  code: SpeechErrorCode;
  /** Player-facing sentence. Safe to render directly. */
  message: string;
  /** Whether retrying the same action could plausibly succeed. */
  recoverable: boolean;
}

export interface SpeechMatchResult {
  transcript: string;
  isMatch: boolean;
  confidence: number;
  isFinal: boolean;
}

export interface ListenOptions {
  targetWord: string;
  language: string;
  onResult: (res: SpeechMatchResult) => void;
  onError: (err: SpeechError) => void;
  /** Fired when recognition stops for good and no match was reported. */
  onEnd?: () => void;
}

export interface ListenSession {
  stop: () => void;
}

export interface MicCapabilities {
  secureContext: boolean;
  hasMediaDevices: boolean;
  hasSpeechRecognition: boolean;
}

const ERROR_MESSAGES: Record<SpeechErrorCode, string> = {
  'unsupported-browser':
    'This browser cannot do live speech recognition. Use Chrome, Edge, or Safari to play the voice rounds.',
  'insecure-context': 'The microphone only works over HTTPS. Open the game on its https:// link.',
  'permission-denied':
    'Microphone blocked. Tap the padlock in the address bar, allow the microphone, then try again.',
  'no-microphone': 'No microphone found. Plug one in or check your device audio settings.',
  'no-speech': 'Nothing was heard. Speak up and try again.',
  network: 'Speech recognition lost its network connection. Check your data and try again.',
  'language-unsupported': 'That language is not available for speech recognition in this browser.',
  aborted: 'Listening was interrupted.',
  unknown: 'The microphone could not start. Try again.',
};

function makeError(code: SpeechErrorCode, recoverable = true): SpeechError {
  return { code, message: ERROR_MESSAGES[code], recoverable };
}

// Chrome's speech backend has no models for the Nigerian languages this game is
// built around. Asking for ha-NG / ig-NG / yo-NG returns language-not-supported
// and the round dies. Recognising them as Nigerian English still produces a
// usable transcript for the fuzzy matcher below, which is what actually scores.
const LOCALE_MAP: Record<string, string> = {
  hausa: 'en-NG',
  igbo: 'en-NG',
  yoruba: 'en-NG',
  pidgin: 'en-NG',
  trap: 'en-NG',
  math: 'en-NG',
  spanish: 'es-ES',
  french: 'fr-FR',
  german: 'de-DE',
  japanese: 'ja-JP',
  korean: 'ko-KR',
  chinese: 'zh-CN',
};

/**
 * Pause before restarting a recogniser that just ended.
 *
 * Android has not released the previous instance when `onend` fires, so an
 * immediate `start()` throws InvalidStateError. A short gap is the difference
 * between a mic that keeps listening for the whole round and one that quietly
 * dies after the first word.
 */
const RESTART_DELAY_MS = 250;

/** Guard against a recogniser that ends instantly, forever, in a tight loop. */
const MAX_RESTARTS = 60;

/** Languages we ask the browser for phonetically rather than natively. */
export const PHONETIC_FALLBACK_LANGUAGES = new Set(['hausa', 'igbo', 'yoruba', 'pidgin']);

function getSpeechRecognitionCtor(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

function mapRecognitionError(raw: string): SpeechErrorCode {
  switch (raw) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission-denied';
    case 'audio-capture':
      return 'no-microphone';
    case 'no-speech':
      return 'no-speech';
    case 'network':
      return 'network';
    case 'language-not-supported':
      return 'language-unsupported';
    case 'aborted':
      return 'aborted';
    default:
      return 'unknown';
  }
}

function mapGetUserMediaError(err: unknown): SpeechErrorCode {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no-microphone';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'no-microphone';
  return 'unknown';
}

/**
 * What the recogniser has actually been doing.
 *
 * Speech failures on a phone are invisible from the outside — the mic looks
 * live, nothing happens, and there is no way to tell a missing language model
 * from a device the recogniser never got hold of. This records enough to tell
 * those apart from a device we cannot plug a debugger into.
 */
export interface SpeechDiagnostics {
  supported: boolean;
  /** The BCP-47 tag actually handed to the recogniser. */
  locale: string;
  /** Whether the shared mic was put down for this session (the mobile path). */
  suspendedMic: boolean;
  /** Results received since the session started, interim included. */
  results: number;
  /** Times the recogniser ended and had to be restarted. */
  restarts: number;
  /** Raw error string from the last onerror, before it was mapped. */
  lastError: string | null;
  startedAt: number | null;
}

class SpeechRecognitionService {
  private diagnostics: SpeechDiagnostics = {
    supported: false,
    locale: '',
    suspendedMic: false,
    results: 0,
    restarts: 0,
    lastError: null,
    startedAt: null,
  };

  public getDiagnostics(): SpeechDiagnostics {
    return { ...this.diagnostics, supported: this.getCapabilities().hasSpeechRecognition };
  }

  private micStream: MediaStream | null = null;
  /** Whether we currently hold a reference on the shared mic stream. */
  private holdsMicRef = false;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private meterFrame: number | null = null;

  private recognition: any = null;
  private isMuted = false;
  /** Set while a round is live, so onend can distinguish a silence stall from a real stop. */
  private wantsToListen = false;

  public getCapabilities(): MicCapabilities {
    if (typeof window === 'undefined') {
      return { secureContext: false, hasMediaDevices: false, hasSpeechRecognition: false };
    }
    return {
      secureContext: window.isSecureContext,
      hasMediaDevices: !!navigator.mediaDevices?.getUserMedia,
      hasSpeechRecognition: !!getSpeechRecognitionCtor(),
    };
  }

  public hasNativeSupport(): boolean {
    return this.getCapabilities().hasSpeechRecognition;
  }

  public getIsMicMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Prompts for microphone access via the shared owner, so the level meter and
   * the voice call use one device grab rather than competing for it.
   * Resolves with an error instead of throwing so callers can render it.
   */
  public async requestMicAccess(): Promise<SpeechError | null> {
    const caps = this.getCapabilities();
    if (!caps.secureContext) return makeError('insecure-context', false);
    if (!caps.hasMediaDevices) return makeError('unsupported-browser', false);

    if (this.micStream && this.micStream.getAudioTracks().some((t) => t.readyState === 'live')) {
      return null;
    }

    const { stream, error } = await micStream.acquire();
    if (error || !stream) {
      this.micStream = null;
      return makeError((error?.code as SpeechErrorCode) ?? 'unknown', false);
    }

    this.micStream = stream;
    this.holdsMicRef = true;
    return null;
  }

  /**
   * Confirms microphone permission without holding on to the device.
   *
   * For a speech-recognition round this is what you want instead of
   * `requestMicAccess`: it surfaces a blocked or missing mic up front, then
   * puts the device straight back down so the recogniser — which opens its own
   * capture and cannot be handed our stream — can have it. Holding the stream
   * here is what made these rounds work on a laptop and hear nothing on a phone.
   */
  public async probeMicPermission(): Promise<SpeechError | null> {
    const error = await this.requestMicAccess();
    if (error) return error;

    // Only let go of the device when nothing else needs it. Releasing while a
    // call is live can drop the refcount to zero and stop the tracks, taking
    // the player off the air.
    if (isMobileAudioPlatform() && this.holdsMicRef && micStream.canSuspendForSpeech()) {
      micStream.release();
      this.holdsMicRef = false;
      this.micStream = null;
    }
    return null;
  }

  /** Returns the new muted state. Muting also stops any live recognition. */
  public setMuted(muted: boolean): boolean {
    this.isMuted = muted;
    micStream.setMuted(muted);
    if (muted) this.stopListening();
    return this.isMuted;
  }

  public toggleMicMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  /**
   * Starts the live volume meter. Reports an error rather than inventing levels,
   * so a blocked mic never looks like a working one.
   */
  public async startAudioAnalyser(
    onVolumeUpdate: (level: number) => void,
    onError?: (err: SpeechError) => void
  ): Promise<void> {
    const accessError = await this.requestMicAccess();
    if (accessError || !this.micStream) {
      onVolumeUpdate(0);
      onError?.(accessError ?? makeError('unknown'));
      return;
    }

    this.stopAudioAnalyser({ keepStream: true });

    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();

      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.7;
      source.connect(this.analyser);

      const data = new Uint8Array(this.analyser.frequencyBinCount);

      const tick = () => {
        if (!this.analyser) return;
        if (this.isMuted) {
          onVolumeUpdate(0);
        } else {
          this.analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const average = sum / data.length;
          // Speech sits low in this range, so scale it up to make the meter readable.
          onVolumeUpdate(Math.min(100, Math.round((average / 90) * 100)));
        }
        this.meterFrame = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      onVolumeUpdate(0);
      onError?.(makeError('unknown'));
    }
  }

  public stopAudioAnalyser(opts: { keepStream?: boolean } = {}): void {
    if (this.meterFrame !== null) {
      cancelAnimationFrame(this.meterFrame);
      this.meterFrame = null;
    }
    this.analyser = null;

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    if (!opts.keepStream && this.holdsMicRef) {
      // Hand the shared stream back rather than stopping its tracks — the voice
      // call may still be using the same device.
      micStream.release();
      this.holdsMicRef = false;
      this.micStream = null;
    }
  }

  /** Releases the microphone entirely. Call when leaving the game. */
  public release(): void {
    this.stopListening();
    this.stopAudioAnalyser();
  }

  public listenForSpeech(options: ListenOptions): ListenSession {
    const { targetWord, language, onResult, onError, onEnd } = options;

    const caps = this.getCapabilities();
    if (!caps.secureContext) {
      onError(makeError('insecure-context', false));
      return { stop: () => {} };
    }
    if (!caps.hasSpeechRecognition) {
      onError(makeError('unsupported-browser', false));
      return { stop: () => {} };
    }
    if (this.isMuted) {
      onError(makeError('permission-denied', true));
      return { stop: () => {} };
    }

    // Always tear down any previous session first; calling start() on a running
    // instance throws InvalidStateError and kills the round.
    this.stopListening();

    const Ctor = getSpeechRecognitionCtor();
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = this.getLocale(language);

    this.recognition = recognition;
    this.wantsToListen = true;

    // Hand the device to the recogniser on phones — when nothing else is using
    // it, or when the player has explicitly asked for it.
    //
    // A live getUserMedia stream and a running recogniser cannot share a mobile
    // microphone, so suspending helps when the player is on their own. With a
    // voice call up it does the opposite: it drops them off the call for the
    // whole round and leaves the attempt recorder with a dead stream. Both
    // happened in real play, which is why the call wins by default — but that
    // leaves an Android player on a call unable to be heard by the game at all,
    // so `setSpeechPriority` lets them make the trade deliberately.
    //
    // Synchronous, so the start() below stays inside the user gesture iOS needs.
    const suspendedMic = isMobileAudioPlatform() && micStream.canSuspendForSpeech();
    if (suspendedMic) micStream.suspend();

    this.diagnostics = {
      supported: true,
      locale: recognition.lang,
      suspendedMic,
      results: 0,
      restarts: 0,
      lastError: null,
      startedAt: Date.now(),
    };

    let settled = false;
    let restarts = 0;
    let restartTimer: number | null = null;
    const finish = (fn?: () => void) => {
      if (settled) return;
      settled = true;
      this.wantsToListen = false;
      if (restartTimer !== null) window.clearTimeout(restartTimer);
      if (suspendedMic) void micStream.resume();
      fn?.();
    };

    recognition.onresult = (event: any) => {
      this.diagnostics.results++;
      let transcript = '';
      let isFinal = false;
      // Check every alternative; the top pick often misses non-English words.
      let best = { isMatch: false, score: 0 };

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) isFinal = true;
        transcript += result[0].transcript;

        for (let alt = 0; alt < result.length; alt++) {
          const candidate = this.evaluateMatch(result[alt].transcript, targetWord);
          if (candidate.score > best.score) best = candidate;
        }
      }

      onResult({
        transcript: transcript.trim(),
        isMatch: best.isMatch,
        confidence: best.score,
        isFinal,
      });

      if (best.isMatch) finish(() => this.stopListening());
    };

    recognition.onerror = (event: any) => {
      this.diagnostics.lastError = String(event?.error ?? 'unknown');
      const code = mapRecognitionError(event?.error);
      // Chrome fires no-speech on every silent gap; onend restarts us, so it is
      // only worth reporting once the round has actually given up.
      if (code === 'no-speech' || code === 'aborted') return;
      finish(() => {
        this.wantsToListen = false;
        onError(makeError(code, code !== 'unsupported-browser'));
      });
    };

    recognition.onend = () => {
      // Chrome ends the session after a few seconds of silence, and Android ends
      // it after every single utterance regardless of `continuous`. Restart
      // while the round is still running, otherwise the mic dies halfway
      // through the timer.
      const shouldRestart =
        this.wantsToListen && !settled && !this.isMuted && this.recognition === recognition;

      if (shouldRestart && restarts < MAX_RESTARTS) {
        restarts++;
        this.diagnostics.restarts = restarts;
        // Never restart synchronously. Android has not released the previous
        // instance by the time onend fires, so an immediate start() throws
        // InvalidStateError and the round silently loses its microphone.
        restartTimer = window.setTimeout(() => {
          if (!this.wantsToListen || settled || this.recognition !== recognition) return;
          try {
            recognition.start();
          } catch {
            finish(onEnd);
          }
        }, RESTART_DELAY_MS);
        return;
      }

      finish(onEnd);
    };

    // Starting is deferred by a beat only when the mic had to be suspended, to
    // give the platform a moment to actually release the device.
    try {
      recognition.start();
    } catch {
      this.recognition = null;
      finish(() => onError(makeError('unknown')));
    }

    return {
      stop: () => {
        if (restartTimer !== null) window.clearTimeout(restartTimer);
        finish(() => this.stopListening());
      },
    };
  }

  public stopListening(): void {
    this.wantsToListen = false;
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      /* already stopped */
    }
  }

  public getLocale(lang: string): string {
    if (!lang) return 'en-NG';
    // An explicit BCP-47 tag is honoured as given. This used to fall through to
    // the map, miss, and silently return en-NG — so a mini-game asking for
    // 'en-US' was recognised as Nigerian English. Desktop Chrome has a cloud
    // model for en-NG and coped; Android often has no such model on device and
    // simply returned nothing, which is why it looked like the mic was dead on
    // phones but fine on laptops.
    if (lang.includes('-')) return lang;
    return LOCALE_MAP[lang.toLowerCase()] ?? 'en-NG';
  }

  public evaluateMatch(transcript: string, target: string): { isMatch: boolean; score: number } {
    if (!transcript || !target) return { isMatch: false, score: 0 };

    const clean = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip decomposed tone marks, e.g. E ku aale
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const cleanTrans = clean(transcript);
    const cleanTarget = clean(target);
    if (!cleanTrans || !cleanTarget) return { isMatch: false, score: 0 };

    if (cleanTrans === cleanTarget) return { isMatch: true, score: 1 };
    if (cleanTrans.includes(cleanTarget)) return { isMatch: true, score: 0.95 };

    // Short targets (a math answer, a single word) must not be satisfied by a
    // long ramble that happens to contain similar letters, so compare per word.
    const targetWords = cleanTarget.split(' ');
    if (targetWords.length === 1) {
      const best = cleanTrans
        .split(' ')
        .reduce((acc, word) => Math.max(acc, this.similarity(word, cleanTarget)), 0);
      return { isMatch: best >= 0.8, score: Math.round(best * 100) / 100 };
    }

    const score = this.similarity(cleanTrans, cleanTarget);
    return { isMatch: score >= 0.7, score: Math.round(score * 100) / 100 };
  }

  private similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;
    return Math.max(0, 1 - this.levenshteinDistance(a, b) / maxLen);
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
    let curr = new Array<number>(a.length + 1);

    for (let i = 1; i <= b.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= a.length; j++) {
        const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j - 1] + cost, curr[j - 1] + 1, prev[j] + 1);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[a.length];
  }
}

export const speechEngine = new SpeechRecognitionService();
