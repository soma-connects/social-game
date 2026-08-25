import { NextResponse } from 'next/server';
import { resolve4 } from 'node:dns/promises';
import { connect } from 'node:net';
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
  /**
   * TURN hostnames that do not resolve. Empty is the healthy case.
   *
   * Surfaced because hasRelay used to mean only "credentials are configured",
   * which is not the same as "a relay will answer" — and the gap between those
   * two hid a completely dead TURN host behind a green light.
   */
  unresolvedHosts?: string[];
  /**
   * TURN endpoints that resolve but refuse a connection.
   *
   * The layer below unresolvedHosts: a retired relay that kept its DNS record
   * passes the name check and still cannot carry a single call.
   */
  unreachableHosts?: string[];
};

/** Pulls the hostname out of a turn:/turns: URL, which URL() will not parse. */
function turnHost(url: string): string | null {
  const match = /^turns?:([^:?/]+)/i.exec(url.trim());
  return match ? match[1] : null;
}

/** Host and port together, since a relay can be alive on one port and dead on another. */
function turnHostPort(url: string): { host: string; port: number } | null {
  const match = /^turns?:([^:?/]+)(?::(\d+))?/i.exec(url.trim());
  if (!match) return null;
  return { host: match[1], port: Number(match[2] ?? 3478) };
}

/**
 * Whether anything is actually listening on a relay's port.
 *
 * DNS resolution turned out not to be enough. A retired relay kept its A record
 * and answered nothing, so the name check passed, hasRelay stayed true, and the
 * whole room silently failed to connect while the endpoint looked healthy — the
 * same failure the DNS check was added to catch, one layer down. A TCP connect
 * is the cheapest thing that distinguishes "the name exists" from "a server is
 * there", and TURN listens on TCP wherever it listens on UDP.
 */
const PROBE_TIMEOUT_MS = 2500;
const PROBE_CACHE_MS = 2 * 60 * 1000;

const reachability: Map<string, { ok: boolean; at: number }> = ((
  globalThis as unknown as { __turnReachability?: Map<string, { ok: boolean; at: number }> }
).__turnReachability ??= new Map());

function probe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function isReachable(host: string, port: number): Promise<boolean> {
  const key = `${host}:${port}`;
  const cached = reachability.get(key);
  if (cached && Date.now() - cached.at < PROBE_CACHE_MS) return cached.ok;

  const ok = await probe(host, port);
  reachability.set(key, { ok, at: Date.now() });
  return ok;
}

/** TURN endpoints that resolve but refuse connections. Empty is the healthy case. */
async function findUnreachableHosts(servers: RTCIceServer[]): Promise<string[]> {
  const targets = new Map<string, { host: string; port: number }>();
  for (const server of servers) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    for (const url of urls) {
      const parsed = turnHostPort(String(url));
      if (parsed) targets.set(`${parsed.host}:${parsed.port}`, parsed);
    }
  }

  const dead: string[] = [];
  await Promise.all(
    [...targets.values()].map(async ({ host, port }) => {
      if (!(await isReachable(host, port))) dead.push(`${host}:${port}`);
    })
  );
  return dead;
}

/**
 * Checks that the configured TURN hostnames actually resolve.
 *
 * This exists because of a real outage: the configured host had been retired by
 * its provider and had no A record at all, so every ICE candidate silently
 * failed to gather while the endpoint reported hasRelay: true and looked
 * healthy from every angle except a live call. A name lookup is the cheapest
 * check that would have caught it, and DNS results are cached by the resolver,
 * so it costs effectively nothing per request.
 *
 * Only reports; a name that resolves is not proof the relay accepts traffic.
 */
async function findUnresolvedHosts(servers: RTCIceServer[]): Promise<string[]> {
  const hosts = new Set<string>();
  for (const server of servers) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    for (const url of urls) {
      const host = turnHost(String(url));
      if (host) hosts.add(host);
    }
  }

  const bad: string[] = [];
  await Promise.all(
    [...hosts].map(async (host) => {
      try {
        const addresses = await resolve4(host);
        if (addresses.length === 0) bad.push(host);
      } catch {
        bad.push(host);
      }
    })
  );
  return bad;
}

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

  /**
   * Only ever adds a TCP sibling for a URL that was actually configured.
   *
   * Mobile carriers routinely drop UDP, so a UDP-only relay leaves players on
   * cellular data silently inaudible while everyone on wifi connects fine.
   * Offering the same host and port over TCP is the standard escape hatch, and
   * is safe to synthesise because coturn and every hosted provider listen for
   * both on the ports they publish.
   *
   * What this deliberately does NOT do is invent extra hostnames or ports. An
   * earlier version hardcoded a vendor's hostnames here as "mobile fallbacks",
   * and when that vendor retired the host the dead name stayed buried in the
   * code where no config change could dislodge it — every synthesised URL
   * resolved to nothing, so no relay candidate could ever be gathered while the
   * endpoint still cheerfully reported hasRelay: true. Extra ports and hosts
   * belong in TURN_URLS, where they can be fixed without a deploy.
   */
  rawUrls.forEach((u) => {
    expandedUrls.push(u);
    if (u.startsWith('turn:') && !u.includes('transport=')) {
      expandedUrls.push(`${u}?transport=tcp`);
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
    if (config) {
      const unresolvedHosts = await findUnresolvedHosts(config.iceServers);

      if (unresolvedHosts.length > 0) {
        console.error(
          `ICE: TURN host(s) do not resolve: ${unresolvedHosts.join(', ')}. ` +
            'No relay candidate can be gathered, so players behind carrier-grade NAT will be ' +
            'inaudible. Check TURN_URLS against the provider\'s current hostname.'
        );
      }

      // Names that resolve still have to answer. Probing only the endpoints that
      // got past DNS keeps this to one cheap connect per relay, cached.
      const unreachableHosts = await findUnreachableHosts(config.iceServers);
      if (unreachableHosts.length > 0) {
        console.error(
          `ICE: TURN endpoint(s) resolve but refuse connections: ${unreachableHosts.join(', ')}. ` +
            'No relay candidate can be gathered, so players behind carrier-grade NAT will be ' +
            'inaudible. The service is most likely retired — check the provider.'
        );
      }

      // A relay nobody can reach is not a relay. Reporting it as one is what let
      // a dead host sit in production behind a green light.
      const turnUrls = config.iceServers
        .flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]))
        .map((u) => String(u))
        .filter((u) => turnHost(u));

      // Judged on reachability alone: a connect to a name that does not resolve
      // fails too, so this already covers the DNS case. Keeping the name check
      // as the sole authority would let a flaky resolver on one instance
      // condemn a relay that is actually fine.
      const everyHostDead =
        turnUrls.length > 0 &&
        turnUrls.every((u) => {
          const parsed = turnHostPort(u);
          return parsed ? unreachableHosts.includes(`${parsed.host}:${parsed.port}`) : false;
        });

      return NextResponse.json({
        ...config,
        hasRelay: config.hasRelay && !everyHostDead,
        provider: everyHostDead ? 'stun-only' : config.provider,
        unresolvedHosts,
        unreachableHosts,
      } satisfies IceResponse);
    }
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
