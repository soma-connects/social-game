/**
 * A small per-caller token bucket for the routes that cost money.
 *
 * The AI routes call Gemini on every request and carry no authentication, so
 * without this anyone who finds the URL can spend the project's quota in a loop.
 * This is not a defence against a distributed attack — it is the cheap control
 * that stops one script, or one component stuck in a render loop, from running
 * up a bill.
 *
 * Anchored to globalThis so the buckets survive the module reload that Next.js
 * does on every edit in development.
 */

type Bucket = { tokens: number; updatedAt: number };

const store = globalThis as unknown as { __voicePartyRateBuckets?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (store.__voicePartyRateBuckets ??= new Map());

/** Dropped once they have been full for a while, so the map cannot grow forever. */
const IDLE_EVICT_MS = 10 * 60 * 1000;
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  buckets.forEach((bucket, key) => {
    if (now - bucket.updatedAt > IDLE_EVICT_MS) buckets.delete(key);
  });
}

/**
 * Identifies the caller as well as a serverless environment allows.
 *
 * Behind Cloud Run or Vercel the socket address is the proxy, so the forwarded
 * header is the only thing carrying the real client. It is spoofable — which is
 * why this is a cost guard and not a security boundary.
 */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the next token, for a Retry-After header. */
  retryAfter: number;
};

/**
 * Consumes one token for `key`.
 *
 * `burst` requests may arrive at once; after that the caller is held to one per
 * `refillMs`. A burst allowance matters here because a room legitimately fires
 * several host lines back to back when a round starts.
 */
export function consume(key: string, burst: number, refillMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { tokens: burst, updatedAt: now };
  const refilled = Math.min(burst, bucket.tokens + (now - bucket.updatedAt) / refillMs);

  if (refilled < 1) {
    // Keep updatedAt where it is so the caller does not lose accrued progress.
    buckets.set(key, { tokens: refilled, updatedAt: now });
    return { ok: false, retryAfter: Math.ceil(((1 - refilled) * refillMs) / 1000) };
  }

  buckets.set(key, { tokens: refilled - 1, updatedAt: now });
  return { ok: true, retryAfter: 0 };
}
