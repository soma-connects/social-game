import { NextResponse } from 'next/server';
import { callerKey, consume } from '@/lib/server/rateLimit';

/**
 * ICE server configuration for the voice call.
 *
 * Served from the API rather than compiled into the bundle, because TURN
 * credentials are worth stealing: anyone who reads them can relay their own
 * traffic through your allowance. Minting them here keeps the long-lived secret
 * on the server and lets providers hand out short-lived ones.
 *
 * Why this route exists at all: the app shipped with STUN only. STUN tells a
 * browser its own public address, but it cannot carry audio — so any player
 * behind symmetric NAT (which is normal on mobile carrier networks) could never
 * establish a path, and was silently inaudible to the whole room while every
 * other player connected to each other fine.
 *
 * Configure ONE of:
 *   TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL   — any static TURN service
 *   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN        — Twilio Network Traversal
 *   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
 */

export const dynamic = 'force-dynamic';

/** Public STUN. Always included — it is what finds the cheap direct path. */
const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

type IceResponse = {
  iceServers: RTCIceServer[];
  /** False when only STUN is configured, so the client can warn rather than guess. */
  hasRelay: boolean;
  /** Which provider answered, for the diagnostics readout. */
  provider: 'static' | 'twilio' | 'cloudflare' | 'stun-only';
  /** Seconds the client may cache this for. Ephemeral credentials expire. */
  ttl: number;
};

/** Twilio mints short-lived credentials from the account's long-lived token. */
async function fromTwilio(): Promise<IceResponse | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Tokens.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'Ttl=3600',
  });
  if (!res.ok) {
    console.error('Twilio NTS token request failed:', res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { ice_servers?: RTCIceServer[]; ttl?: string };
  const servers = data.ice_servers ?? [];
  if (servers.length === 0) return null;

  return {
    iceServers: servers,
    hasRelay: servers.some((s) => String(s.urls).includes('turn:')),
    provider: 'twilio',
    // Renew a little early so a call never runs on credentials that expire
    // mid-negotiation.
    ttl: Math.max(300, Number(data.ttl ?? 3600) - 300),
  };
}

/** Cloudflare Realtime issues credentials per request too. */
async function fromCloudflare(): Promise<IceResponse | null> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken) return null;

  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 3600 }),
    }
  );
  if (!res.ok) {
    console.error('Cloudflare TURN request failed:', res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
  const servers = data.iceServers
    ? Array.isArray(data.iceServers)
      ? data.iceServers
      : [data.iceServers]
    : [];
  if (servers.length === 0) return null;

  return {
    iceServers: [...STUN, ...servers],
    hasRelay: true,
    provider: 'cloudflare',
    ttl: 3300,
  };
}

/** Any TURN service configured with a fixed username and password. */
function fromStatic(): IceResponse | null {
  const urls = process.env.TURN_URLS;
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;
  if (!urls || !username || !credential) return null;

  const rawUrls = urls.split(',').map((u) => u.trim()).filter(Boolean);
  const expandedUrls: string[] = [];

  rawUrls.forEach((u) => {
    expandedUrls.push(u);
    // Add explicit TCP transport variant if not present
    if (u.startsWith('turn:') && !u.includes('transport=')) {
      expandedUrls.push(`${u}?transport=tcp`);
    }
    // If openrelay/metered is used, add comprehensive mobile fallback ports
    if (u.includes('openrelay.metered.ca')) {
      expandedUrls.push('turn:openrelay.metered.ca:80');
      expandedUrls.push('turn:openrelay.metered.ca:80?transport=tcp');
      expandedUrls.push('turn:openrelay.metered.ca:443?transport=tcp');
      expandedUrls.push('turns:openrelay.metered.ca:443?transport=tcp');
    }
  });

  const uniqueUrls = Array.from(new Set(expandedUrls));

  return {
    iceServers: [
      ...STUN,
      { urls: uniqueUrls, username, credential },
    ],
    hasRelay: true,
    provider: 'static',
    // Static credentials do not expire, but re-checking hourly keeps a rotation
    // from needing a redeploy to take effect.
    ttl: 3600,
  };
}

export async function GET(request: Request) {
  // Cheap, but it does hit a paid provider on every miss.
  const limit = consume(`ice:${callerKey(request)}`, 20, 3000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const config = (await fromTwilio()) ?? (await fromCloudflare()) ?? fromStatic();
    if (config) return NextResponse.json(config);
  } catch (error) {
    // A provider outage must not take voice down entirely — STUN still works
    // for the majority of players on ordinary home networks.
    console.error('ICE provider lookup failed, falling back to STUN:', error);
  }

  return NextResponse.json({
    iceServers: STUN,
    hasRelay: false,
    provider: 'stun-only',
    ttl: 600,
  } satisfies IceResponse);
}
