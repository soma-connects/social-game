import { NextResponse } from 'next/server';
import { callerKey, consume } from '@/lib/server/rateLimit';
import { requireRoomPlayer } from '@/lib/server/roomAuth';
import { quotaMessage, takeQuota } from '@/lib/server/quota';

/**
 * Short-lived credentials for streaming speech-to-text.
 *
 * The phone streams microphone audio straight to the provider — relaying it
 * through this server would add a hop to every word, and Next.js route handlers
 * cannot hold a WebSocket open anyway. The long-lived API keys stay here; the
 * browser only ever sees a token that expires in seconds and, for Gemini, can
 * open exactly one session.
 *
 * Gated on being a player in a live room, because every token spends real
 * money: a bare rate limit keyed on a spoofable IP header would let anyone on
 * the internet transcribe on this account.
 */

export const dynamic = 'force-dynamic';

export type SttProvider = 'deepgram' | 'gemini';

export type SttTokenResponse =
  | { provider: 'deepgram'; token: string; expiresIn: number }
  | { provider: 'gemini'; token: string; model: string; expiresIn: number };

/** Live transcription model for the Gemini fallback. */
const GEMINI_TRANSCRIBE_MODEL ='gemini-3.5-transcribe-live';

/** Only has to outlive the WebSocket handshake — the open socket stays authorised. */
const DEEPGRAM_TOKEN_TTL_SECONDS = 30;

async function mintDeepgram(): Promise<SttTokenResponse | { error: string }> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return { error: 'Deepgram is not configured' };

  const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: DEEPGRAM_TOKEN_TTL_SECONDS }),
  });
  if (!res.ok) {
    // A 403 here means the key exists but lacks the Member role needed to mint
    // browser tokens — worth saying plainly, since the key still transcribes
    // fine server-side and looks healthy everywhere else.
    return { error: `Deepgram token request failed (${res.status})` };
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return { error: 'Deepgram returned no token' };
  return { provider: 'deepgram', token: data.access_token, expiresIn: data.expires_in ?? DEEPGRAM_TOKEN_TTL_SECONDS };
}

async function mintGemini(): Promise<SttTokenResponse | { error: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: 'Gemini is not configured' };

  const now = Date.now();
  // v1alpha, matching the Live endpoint the browser opens with this token (see
  // streamingSpeech.ts) — ephemeral tokens are only supported there.
  const res = await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      // Locks the token to transcription on this one model, so a leaked token
      // cannot be spent on anything more expensive. The REST field is
      // `bidiGenerateContentSetup`; `liveConnectConstraints` is only the SDK's
      // name for it and the raw API rejects it. Must match the setup message
      // the client sends in streamingSpeech.ts.
      bidiGenerateContentSetup: {
        model: `models/${GEMINI_TRANSCRIBE_MODEL}`,
        generationConfig: { responseModalities: ['TEXT'] },
        inputAudioTranscription: {},
      },
    }),
  });
  if (!res.ok) return { error: `Gemini token request failed (${res.status})` };
  const data = (await res.json()) as { name?: string };
  if (!data.name) return { error: 'Gemini returned no token' };
  return { provider: 'gemini', token: data.name, model: GEMINI_TRANSCRIBE_MODEL, expiresIn: 60 };
}

export async function POST(request: Request) {
  const limit = consume(`stt-token:${callerKey(request)}`, 6, 5000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    roomId?: unknown;
    token?: unknown;
    provider?: unknown;
  };
  const player = await requireRoomPlayer(body.roomId, body.token);
  if (!player) return NextResponse.json({ error: 'Join a room first' }, { status: 401 });

  // A failover mints a second token, so it is counted too — a session that
  // keeps dropping and reconnecting is exactly the pattern worth capping.
  const quota = await takeQuota('stt', { ...player, ip: callerKey(request) });
  if (!quota.ok) return NextResponse.json({ error: quotaMessage('stt', quota.scope) }, { status: 429 });

  const provider: SttProvider = body.provider === 'gemini' ? 'gemini' : 'deepgram';
  const result = provider === 'gemini' ? await mintGemini() : await mintDeepgram();
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
