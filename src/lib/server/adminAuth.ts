import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Access control for the admin dashboard.
 *
 * The game's only identity is anonymous Firebase auth: a uid that is stable for
 * one browser profile and vanishes with its site data. That is exactly right
 * for a party game nobody should have to sign up for, and it cannot express
 * "this person is staff" — an anonymous uid allowlist would lock the owner out
 * the first time they cleared their browser.
 *
 * So the dashboard is gated on a single shared secret in the environment. It is
 * deliberately the smallest thing that is actually safe:
 *
 *   - The secret is never sent to the browser. Login posts it once; what comes
 *     back is a digest, and that digest is what the cookie carries.
 *   - The cookie is httpOnly, so page scripts cannot read it, and SameSite
 *     strict, so another origin cannot ride it.
 *   - Comparisons are timing-safe, so the secret cannot be recovered a byte at
 *     a time by measuring how fast the wrong answer comes back.
 *
 * What it does NOT give you is per-person attribution: everyone with the token
 * is the same principal, and revoking one person means rotating it for all. The
 * upgrade path is real Google sign-in plus a uid allowlist, and this interface
 * is the seam to do it behind.
 */

export const ADMIN_COOKIE = 'vp_admin';

/** Eight hours. Long enough for a working session, short enough to expire. */
export const ADMIN_SESSION_MAX_AGE_S = 8 * 60 * 60;

/** The configured secret, or null when the dashboard is switched off. */
export function adminSecret(): string | null {
  const raw = process.env.ADMIN_DASHBOARD_TOKEN;
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  // A short secret is worse than none, because it advertises a door that can be
  // guessed. Refuse to run rather than pretend to be locked.
  return token.length >= 16 ? token : null;
}

/**
 * What the cookie holds: a digest of the secret, not the secret.
 *
 * Salted with a fixed label so the value is specific to this cookie and cannot
 * be replayed anywhere else the same secret might be hashed.
 */
function digest(token: string): string {
  return createHash('sha256').update(`vp-admin-session:${token}`).digest('hex');
}

/** Constant-time string compare that tolerates differing lengths. */
function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, and the throw itself leaks the
  // length — so compare fixed-width hashes of both sides instead.
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

/** Whether a submitted password is the configured secret. */
export function isValidPassword(submitted: unknown): boolean {
  const secret = adminSecret();
  if (!secret || typeof submitted !== 'string' || submitted.length === 0) return false;
  return sameSecret(submitted, secret);
}

/** The cookie value to set once a password has been accepted. */
export function sessionValue(): string | null {
  const secret = adminSecret();
  return secret ? digest(secret) : null;
}

/** Whether a request carries a valid admin session cookie. */
export function isAdminRequest(request: Request): boolean {
  const expected = sessionValue();
  if (!expected) return false;

  const header = request.headers.get('cookie');
  if (!header) return false;

  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== ADMIN_COOKIE) continue;
    const value = rest.join('=');
    if (value && sameSecret(value, expected)) return true;
  }
  return false;
}

/** Serialised Set-Cookie for a fresh admin session. */
export function sessionCookie(value: string, secure: boolean): string {
  return [
    `${ADMIN_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${ADMIN_SESSION_MAX_AGE_S}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/** Serialised Set-Cookie that clears the session. */
export function clearedCookie(secure: boolean): string {
  return [
    `${ADMIN_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}
