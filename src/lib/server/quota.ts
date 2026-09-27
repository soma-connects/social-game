import { adminDb } from '../firebase/server';

/**
 * Daily spend caps on the routes that cost money.
 *
 * Kept in Firestore rather than process memory, for two reasons: a daily
 * budget has to survive a redeploy (an in-memory counter resets to zero on
 * every restart), and it has to hold across instances if the service is ever
 * scaled out. The burst limiter in rateLimit.ts stays in memory — it only
 * smooths spikes, and losing it on a restart costs nothing.
 *
 * Every request is counted against four scopes at once. Player and room stop
 * one table from burning the budget; IP slows someone creating room after room
 * (it is spoofable, so it is a speed bump, not a wall); global is the backstop
 * that bounds the day's bill however the others are dodged.
 */

export type QuotaBucket = 'stt' | 'tts' | 'host' | 'turn';
type Scope = 'player' | 'room' | 'ip' | 'global';

/**
 * Units per UTC day. A unit is one speech token, one generated host voice line
 * (cache hits are free), one host text line, or one TURN credential fetch.
 *
 * Sized for real play: a long evening at one table is a few hundred voice
 * rounds at most. Global caps can be raised per deployment with
 * QUOTA_GLOBAL_STT / _TTS / _HOST / _TURN without a code change.
 */
const LIMITS: Record<QuotaBucket, Record<Scope, number>> = {
  stt: { player: 150, room: 600, ip: 900, global: 20_000 },
  tts: { player: 300, room: 600, ip: 900, global: 20_000 },
  host: { player: 200, room: 500, ip: 800, global: 20_000 },
  turn: { player: 60, room: 300, ip: 400, global: 10_000 },
};

function limitFor(bucket: QuotaBucket, scope: Scope): number {
  if (scope === 'global') {
    const override = Number(process.env[`QUOTA_GLOBAL_${bucket.toUpperCase()}`]);
    if (Number.isFinite(override) && override > 0) return override;
  }
  return LIMITS[bucket][scope];
}

/** UTC calendar day, so every instance agrees on when the budget resets. */
export function quotaDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Firestore document ids may not contain '/'. IPv6 colons and dots are fine. */
function docId(bucket: QuotaBucket, scope: Scope, subject: string, day: string): string {
  return `${bucket}__${scope}__${subject.replace(/\//g, '_').slice(0, 200)}__${day}`;
}

/** `scope` names the cap that refused the request, or is null when it went through. */
export type QuotaResult = { ok: boolean; scope: Scope | null };

/**
 * Takes one unit from every scope, or none of them.
 *
 * All-or-nothing in one transaction: a request refused by the room cap must
 * not still have been charged to the player and global counters.
 */
export async function takeQuota(
  bucket: QuotaBucket,
  subjects: { playerId: string; roomId: string; ip: string }
): Promise<QuotaResult> {
  const day = quotaDay();
  const scopes: [Scope, string][] = [
    ['player', `${subjects.roomId}:${subjects.playerId}`],
    ['room', subjects.roomId],
    ['ip', subjects.ip],
    ['global', 'all'],
  ];
  const refs = scopes.map(([scope, subject]) => ({
    scope,
    limit: limitFor(bucket, scope),
    ref: adminDb.collection('quotas').doc(docId(bucket, scope, subject, day)),
  }));

  try {
    return await adminDb.runTransaction(async (tx): Promise<QuotaResult> => {
      const snaps = await Promise.all(refs.map((r) => tx.get(r.ref)));
      for (let i = 0; i < refs.length; i++) {
        const used = (snaps[i].data()?.count as number | undefined) ?? 0;
        if (used >= refs[i].limit) return { ok: false, scope: refs[i].scope };
      }
      // Two days out, so a Firestore TTL policy on `expireAt` can clear
      // yesterday's counters without racing today's.
      const expireAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      refs.forEach((r, i) => {
        const used = (snaps[i].data()?.count as number | undefined) ?? 0;
        tx.set(r.ref, { count: used + 1, bucket, scope: r.scope, day, expireAt });
      });
      return { ok: true, scope: null };
    });
  } catch (error) {
    // Fail closed. If the budget cannot be read, spending blind is exactly
    // what this exists to prevent; every caller has a free fallback.
    console.error(`Quota check failed for ${bucket}:`, error);
    return { ok: false, scope: 'global' };
  }
}

export function quotaMessage(bucket: QuotaBucket, scope: Scope | null): string {
  const what = { stt: 'speech recognition', tts: 'the host voice', host: 'the AI host', turn: 'the voice relay' }[bucket];
  return scope === 'global'
    ? `Daily limit for ${what} reached for today.`
    : `This ${scope === 'player' ? 'player' : scope === 'room' ? 'room' : 'network'} has used today's limit for ${what}.`;
}
