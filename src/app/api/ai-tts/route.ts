import { NextResponse } from 'next/server';
import { callerKey, consume } from '@/lib/server/rateLimit';
import { requireRoomPlayer } from '@/lib/server/roomAuth';
import { passesAppCheck } from '@/lib/server/appCheck';
import { quotaMessage, takeQuota } from '@/lib/server/quota';

/**
 * The AI Game Master's voice.
 *
 * Streams Gemini TTS through as raw 16-bit PCM (24 kHz mono) while it is still
 * being generated, so the host starts talking under a second after the line is
 * asked for rather than after the whole clip exists (~3.5s for a two-sentence
 * line). The client plays the chunks back-to-back as they land.
 *
 * Every phone in the room asks for the same host line at the same moment, and
 * at a party they usually share one Wi-Fi address. So one generation per line
 * is shared: a request for a line already in flight subscribes to it, and a
 * finished line is served from memory. That is one Gemini call instead of six,
 * and the rate limit below is not tripped by a room of friends.
 */

export const dynamic = 'force-dynamic';

/** Fastest to first audio (~1s streaming) and cheapest; plenty for one or two spoken sentences. */
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';
/** One of Gemini's prebuilt voices — the host's signature sound. */
const HOST_VOICE = 'Puck';
/**
 * Delivery direction — accent, energy, tone.
 *
 * Sent as `speech_metadata` alongside the text rather than prefixed to it. The
 * 3.x TTS models read a prefixed "Say this like…" out loud as part of the line,
 * which is what the old route did — every host line opened with the stage
 * direction, and ran about twice as long.
 */
const HOST_STYLE = 'high-energy Nigerian party MC hyping up the crowd, warm and playful';

const MAX_TTS_CHARS = 400;
const MAX_CACHED_LINES = 40;
const UPSTREAM_TIMEOUT_MS = 20_000;

type Line = {
  chunks: Uint8Array[];
  done: boolean;
  failed: boolean;
  waiters: Set<() => void>;
};

// globalThis so the cache survives dev hot reloads; one Cloud Run instance
// means one cache for the whole deployment.
const lines: Map<string, Line> = ((globalThis as unknown as { __hostTtsLines?: Map<string, Line> }).__hostTtsLines ??=
  new Map());

function notify(line: Line): void {
  const waiters = [...line.waiters];
  line.waiters.clear();
  waiters.forEach((wake) => wake());
}

/** Emoji and pictographs are read aloud as their names, or as noise. */
function speakable(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function generate(key: string, text: string, apiKey: string): Line {
  const line: Line = { chunks: [], done: false, failed: false, waiters: new Set() };
  lines.set(key, line);
  while (lines.size > MAX_CACHED_LINES) {
    const oldest = lines.keys().next().value;
    if (oldest === undefined) break;
    lines.delete(oldest);
  }

  void (async () => {
    try {
      // The Interactions API, because it is the one that takes speech_metadata;
      // generateContent rejects a style instruction for these models.
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions?alt=sse', {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: TTS_MODEL,
          stream: true,
          input: [
            {
              type: 'user_input',
              content: [
                { type: 'text', text, annotations: [{ type: 'speech_metadata', style: HOST_STYLE }] },
              ],
            },
          ],
          response_format: { type: 'audio' },
          generation_config: { speech_config: [{ voice: HOST_VOICE }] },
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!res.ok || !res.body) throw new Error(`Gemini TTS ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const events = pending.split('\n');
        pending = events.pop() ?? '';
        for (const event of events) {
          if (!event.startsWith('data:')) continue;
          // The stream ends on a non-JSON sentinel. Letting that throw marked a
          // fully delivered line as failed and dropped it from the cache.
          let message: { error?: unknown; delta?: { type?: string; data?: unknown } };
          try {
            message = JSON.parse(event.slice(5));
          } catch {
            continue;
          }
          if (message?.error) throw new Error(`Gemini TTS: ${JSON.stringify(message.error).slice(0, 200)}`);
          // step.delta events carry raw 24 kHz mono PCM; the rest is bookkeeping.
          const delta = message?.delta;
          if (delta?.type !== 'audio' || typeof delta.data !== 'string') continue;
          line.chunks.push(new Uint8Array(Buffer.from(delta.data, 'base64')));
          notify(line);
        }
      }
      if (line.chunks.length === 0) throw new Error('Gemini TTS returned no audio');
    } catch (error) {
      console.error('Gemini TTS error:', error);
      line.failed = true;
      // A failure must not be served from cache to the next room.
      if (lines.get(key) === line) lines.delete(key);
    } finally {
      line.done = true;
      notify(line);
    }
  })();

  return line;
}

function waitForProgress(line: Line): Promise<void> {
  return new Promise((resolve) => line.waiters.add(resolve));
}

export async function POST(req: Request) {
  // Loose enough for a room of phones behind one address; cached lines cost nothing.
  const limit = consume(`ai-tts:${callerKey(req)}`, 12, 2000);
  if (!limit.ok) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  if (!(await passesAppCheck(req, 'ai-tts'))) {
    return NextResponse.json({ success: false, error: 'App verification failed' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'TTS is not configured' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: unknown; roomId?: unknown; token?: unknown };
  const player = await requireRoomPlayer(body.roomId, body.token);
  if (!player) return NextResponse.json({ success: false, error: 'Join a room first' }, { status: 401 });

  const text = typeof body.text === 'string' ? speakable(body.text) : '';
  if (!text) return NextResponse.json({ success: false, error: 'Missing text' }, { status: 400 });
  // Host lines are one or two sentences; anything longer is a bug or somebody
  // using this as a free synthesis endpoint.
  if (text.length > MAX_TTS_CHARS) {
    return NextResponse.json(
      { success: false, error: `Text must be under ${MAX_TTS_CHARS} characters` },
      { status: 413 }
    );
  }

  const key = `${TTS_MODEL}|${HOST_VOICE}|${text}`;
  let line = lines.get(key);
  if (line) {
    // Refresh its place so a line in use is the last to be evicted.
    lines.delete(key);
    lines.set(key, line);
  } else {
    // Only a fresh generation spends money; a line another phone already asked
    // for is served free, so it is not counted.
    const quota = await takeQuota('tts', { ...player, ip: callerKey(req) });
    if (!quota.ok) {
      return NextResponse.json({ success: false, error: quotaMessage('tts', quota.scope) }, { status: 429 });
    }
    // Re-check: another request may have started this line during the quota round trip.
    line = lines.get(key) ?? generate(key, text, apiKey);
  }

  // Hold the response until the first audio exists, so a failure can still be
  // reported as an error the client falls back on, rather than an empty stream.
  while (line.chunks.length === 0 && !line.done) await waitForProgress(line);
  if (line.chunks.length === 0) {
    return NextResponse.json({ success: false, error: 'TTS generation failed' }, { status: 502 });
  }

  const source = line;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = 0;
      while (!cancelled) {
        while (sent < source.chunks.length) controller.enqueue(source.chunks[sent++]);
        if (source.done) break;
        await waitForProgress(source);
      }
      if (!cancelled) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'audio/l16; rate=24000; channels=1',
      'Cache-Control': 'no-store',
    },
  });
}
