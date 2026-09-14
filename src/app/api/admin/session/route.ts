import { NextResponse } from 'next/server';
import {
  adminSecret,
  clearedCookie,
  isAdminRequest,
  isValidPassword,
  sessionCookie,
  sessionValue,
} from '@/lib/server/adminAuth';
import { callerKey, consume } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Whether a request arrived over TLS, so the cookie can be marked Secure.
 *
 * Behind Cloud Run or Vercel the connection into the container is plain HTTP
 * and the forwarded header is the only record of the original scheme. Marking
 * the cookie Secure on a local http:// dev server would stop it being stored at
 * all, so this cannot simply be hardcoded either way.
 */
function isSecure(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  return new URL(request.url).protocol === 'https:';
}

/** Whether the caller already holds a session — used by the page on load. */
export async function GET(request: Request) {
  return NextResponse.json({
    configured: adminSecret() !== null,
    authenticated: isAdminRequest(request),
  });
}

export async function POST(request: Request) {
  if (adminSecret() === null) {
    return NextResponse.json(
      {
        error:
          'The dashboard is not configured. Set ADMIN_DASHBOARD_TOKEN (at least 16 characters) in the server environment.',
      },
      { status: 503 }
    );
  }

  // A single shared password is exactly the shape brute force is good at, and
  // this endpoint is the only thing standing in front of every player's data.
  // Five attempts, then one every thirty seconds.
  const limit = consume(`admin-login:${callerKey(request)}`, 5, 30_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const password = (body as { password?: unknown } | null)?.password;
  if (!isValidPassword(password)) {
    // Deliberately does not distinguish "no password" from "wrong password".
    return NextResponse.json({ error: 'That token was not accepted.' }, { status: 401 });
  }

  const value = sessionValue();
  if (!value) return NextResponse.json({ error: 'Dashboard unavailable' }, { status: 503 });

  const response = NextResponse.json({ authenticated: true });
  response.headers.set('Set-Cookie', sessionCookie(value, isSecure(request)));
  return response;
}

/** Sign out. */
export async function DELETE(request: Request) {
  const response = NextResponse.json({ authenticated: false });
  response.headers.set('Set-Cookie', clearedCookie(isSecure(request)));
  return response;
}
