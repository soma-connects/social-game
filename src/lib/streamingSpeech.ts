// Streaming speech-to-text that shares the microphone with the voice call.
//
// The browser's own recogniser (speechService.ts) opens a private capture of
// the mic, and on Android only one thing may hold the mic at a time — so a
// player on the call was either heard by the room or by the game, never both.
// This path instead taps the one shared stream from micStream, resamples it to
// 16 kHz PCM, and streams it to a cloud recogniser over a WebSocket. The call
// keeps its audio the whole time.
//
// Providers are tried in order — Deepgram, then Gemini Live — and a session
// that drops mid-round fails over to the next one. If neither is reachable the
// caller gets null and falls back to the browser recogniser.

import { roomStore } from './roomStore';
import { micStream } from './micStream';

export type StreamingProvider = 'deepgram' | 'gemini';

export interface StreamingSession {
  provider: StreamingProvider;
  stop: () => void;
}

export interface StreamingOptions {
  roomId: string;
  /** Words the recogniser should expect. Deepgram boosts them; Gemini ignores them. */
  keyterms?: string[];
  /** BCP-47-ish language for Deepgram, e.g. 'en'. */
  language?: string;
  /**
   * 'command' ends an utterance on a 100 ms pause — right for shouting single
   * words. 'dictation' waits longer, so a spoken sentence is not cut off at the
   * first breath. Defaults to 'command'.
   */
  mode?: 'command' | 'dictation';
  /**
   * `isFinal` means this stretch of text will not be revised. `speechFinal`
   * means the speaker has paused — the end of an utterance, which is what the
   * browser recogniser's own `isFinal` meant.
   */
  onTranscript: (text: string, isFinal: boolean, speechFinal: boolean) => void;
  /** Fired when the session moves to another provider mid-round. */
  onProviderChange?: (provider: StreamingProvider) => void;
  /** Fired once every provider has failed after the session was running. */
  onFatal?: () => void;
}

type TokenResponse =
  | { provider: 'deepgram'; token: string }
  | { provider: 'gemini'; token: string; model: string };

const PROVIDERS: StreamingProvider[] = ['deepgram', 'gemini'];
const TARGET_SAMPLE_RATE = 16000;
/** 100 ms of audio per message, which both providers recommend. */
const CHUNK_SAMPLES = 1600;
const CONNECT_TIMEOUT_MS = 5000;
/** Reconnects allowed per session before handing back to the browser recogniser. */
const MAX_FAILOVERS = 3;

// Runs on the audio thread. Box-filter decimation is a crude low-pass, but for
// speech into a recogniser it is indistinguishable from a proper resampler and
// avoids shipping one. Kept as a string so it needs no separate public file.
const WORKLET_SOURCE = `
class PcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${TARGET_SAMPLE_RATE};
    this.acc = 0; this.sum = 0; this.count = 0;
    this.buf = new Int16Array(${CHUNK_SAMPLES}); this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i]; this.count++; this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.sum / this.count));
        this.sum = 0; this.count = 0;
        this.buf[this.len++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.len === this.buf.length) {
          this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
          this.buf = new Int16Array(${CHUNK_SAMPLES}); this.len = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

export function isStreamingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return !!Ctx && 'audioWorklet' in Ctx.prototype && typeof WebSocket !== 'undefined' && micStream.isSupported();
}

async function fetchToken(roomId: string, provider: StreamingProvider): Promise<TokenResponse | null> {
  try {
    const res = await fetch('/api/stt-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, token: roomStore.getMyToken(roomId) ?? '', provider }),
    });
    if (!res.ok) return null;
    return (await res.json()) as TokenResponse;
  } catch {
    return null;
  }
}

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function messageText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  return '';
}

/** A connected provider socket that accepts PCM chunks. */
interface ProviderLink {
  send: (pcm: ArrayBuffer) => void;
  close: () => void;
}

function connectDeepgram(
  token: string,
  opts: StreamingOptions,
  onClosed: () => void
): Promise<ProviderLink | null> {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: opts.language ?? 'en',
    encoding: 'linear16',
    sample_rate: String(TARGET_SAMPLE_RATE),
    channels: '1',
    interim_results: 'true',
    // Short for commands, where a single shouted word is the whole utterance;
    // long enough for dictation that a mid-sentence breath is not an ending.
    endpointing: opts.mode === 'dictation' ? '700' : '100',
    smart_format: 'false',
    punctuate: opts.mode === 'dictation' ? 'true' : 'false',
    // "49", not "forty nine" — the maths rounds match against digits.
    numerals: 'true',
  });
  for (const term of opts.keyterms ?? []) params.append('keyterm', term);

  return new Promise((resolve) => {
    let opened = false;
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['bearer', token]);
    const timer = window.setTimeout(() => {
      if (!opened) {
        ws.close();
        resolve(null);
      }
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      opened = true;
      window.clearTimeout(timer);
      resolve({
        send: (pcm) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
        },
        close: () => {
          ws.onclose = null;
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
          ws.close();
        },
      });
    };
    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(await messageText(event.data));
        if (msg.type !== 'Results') return;
        const text: string = msg.channel?.alternatives?.[0]?.transcript ?? '';
        const speechFinal = !!msg.speech_final;
        // An empty speech_final still matters: it is the pause that ends the utterance.
        if (text || speechFinal) opts.onTranscript(text, !!msg.is_final, speechFinal);
      } catch {
        /* a malformed frame is not worth ending the round over */
      }
    };
    ws.onerror = () => {
      /* onclose follows and decides what happens */
    };
    ws.onclose = () => {
      window.clearTimeout(timer);
      if (!opened) resolve(null);
      else onClosed();
    };
  });
}

function connectGemini(
  token: string,
  model: string,
  opts: StreamingOptions,
  onClosed: () => void
): Promise<ProviderLink | null> {
  // Ephemeral tokens connect to the "Constrained" endpoint and ride in the query
  // string, since browsers cannot set headers on a WebSocket.
  const url =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained' +
    `?access_token=${encodeURIComponent(token)}`;

  return new Promise((resolve) => {
    let ready = false;
    const ws = new WebSocket(url);
    const timer = window.setTimeout(() => {
      if (!ready) {
        ws.close();
        resolve(null);
      }
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${model}`,
            generationConfig: { responseModalities: ['TEXT'] },
            inputAudioTranscription: {},
          },
        })
      );
    };
    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(await messageText(event.data));
        if (msg.setupComplete && !ready) {
          // Audio sent before setup completes is dropped, so only hand back a
          // link once the session is actually listening.
          ready = true;
          window.clearTimeout(timer);
          resolve({
            send: (pcm) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              ws.send(
                JSON.stringify({
                  realtimeInput: { audio: { data: toBase64(pcm), mimeType: `audio/pcm;rate=${TARGET_SAMPLE_RATE}` } },
                })
              );
            },
            close: () => {
              ws.onclose = null;
              ws.close();
            },
          });
          return;
        }
        const content = msg.serverContent;
        // Gemini only finalises once the speaker pauses, so final and end of
        // utterance arrive together.
        if (content?.inputTranscription?.text) opts.onTranscript(content.inputTranscription.text, true, true);
        else if (content?.interimInputTranscription?.text) opts.onTranscript(content.interimInputTranscription.text, false, false);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onerror = () => {
      /* onclose follows */
    };
    ws.onclose = () => {
      window.clearTimeout(timer);
      if (!ready) resolve(null);
      else onClosed();
    };
  });
}

/**
 * Starts listening on the shared microphone, or resolves null if no streaming
 * provider could be reached — in which case the caller should fall back to the
 * browser recogniser.
 */
export async function startStreamingRecognition(opts: StreamingOptions): Promise<StreamingSession | null> {
  if (!isStreamingSupported()) return null;

  const { stream, error } = await micStream.acquire();
  if (error || !stream) return null;

  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let workletUrl: string | null = null;
  let node: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let link: ProviderLink | null = null;
  let current: StreamingProvider | null = null;
  let stopped = false;
  let failovers = 0;

  const teardown = () => {
    stopped = true;
    link?.close();
    link = null;
    unsubscribe();
    source?.disconnect();
    node?.disconnect();
    if (node) node.port.onmessage = null;
    ctx.close().catch(() => {});
    if (workletUrl) URL.revokeObjectURL(workletUrl);
    micStream.release();
  };

  // micStream swaps the underlying track when the OS kills it or the call
  // recovers the device; re-point the tap at whatever is current.
  const attachSource = (s: MediaStream | null) => {
    source?.disconnect();
    source = null;
    if (!s || !node) return;
    source = ctx.createMediaStreamSource(s);
    source.connect(node);
  };
  const unsubscribe = micStream.onStreamChange((s) => {
    if (!stopped) attachSource(s);
  });

  try {
    if (ctx.state === 'suspended') await ctx.resume();
    workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(workletUrl);
    node = new AudioWorkletNode(ctx, 'pcm-tap');
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => link?.send(event.data);
    attachSource(micStream.getStream() ?? stream);
  } catch {
    teardown();
    return null;
  }

  const connect = async (startAt: number): Promise<boolean> => {
    for (let i = 0; i < PROVIDERS.length && !stopped; i++) {
      const provider = PROVIDERS[(startAt + i) % PROVIDERS.length];
      const token = await fetchToken(opts.roomId, provider);
      if (!token || stopped) continue;
      const onClosed = () => {
        link = null;
        if (stopped) return;
        if (++failovers > MAX_FAILOVERS) {
          teardown();
          opts.onFatal?.();
          return;
        }
        // Retry the same provider first — most drops are a blip — then move on.
        void connect(PROVIDERS.indexOf(provider)).then((ok) => {
          if (!ok && !stopped) {
            teardown();
            opts.onFatal?.();
          }
        });
      };
      const next =
        token.provider === 'deepgram'
          ? await connectDeepgram(token.token, opts, onClosed)
          : await connectGemini(token.token, token.model, opts, onClosed);
      if (!next) continue;
      if (stopped) {
        next.close();
        return false;
      }
      link = next;
      if (current !== provider) {
        if (current !== null) opts.onProviderChange?.(provider);
        current = provider;
      }
      return true;
    }
    return false;
  };

  if (!(await connect(0)) || !current) {
    teardown();
    return null;
  }

  return {
    provider: current,
    stop: () => {
      if (!stopped) teardown();
    },
  };
}
