import { NextResponse } from 'next/server';
import { adminDb, describeCredentialSource } from '@/lib/firebase/server';
import { callerKey, consume } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Deployment health check.
 *
 * Exists because a misconfigured Admin SDK produced a 500 with an empty body on
 * every room request, which is the least useful failure mode available: the app
 * booted, served pages, and died only on the API — with nothing said about why.
 *
 * Reports whether each credential is *present and well-formed*, never its value.
 * The private key is only ever described as present/absent and PEM-shaped or
 * not; the service account email is masked. That keeps this safe to leave
 * enabled in production, which matters, because the moment you need it is the
 * moment you cannot reproduce the problem locally.
 */
export async function GET(request: Request) {
  // Cheap, but it does touch Firestore, so it should not be a free amplifier.
  const limit = consume(`health:${callerKey(request)}`, 10, 3000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  const config = describeCredentialSource();
  const maskedEmail = config.clientEmail
    ? config.clientEmail.replace(/^(.{6}).*(@.*)$/, '$1…$2')
    : null;

  const report = {
    ok: false,
    credentials: {
      mode: config.mode,
      projectId: config.projectId,
      clientEmail: maskedEmail,
      privateKeyPresent: config.privateKeyPresent,
      privateKeyLooksValid: config.privateKeyLooksValid,
    },
    firestore: { reachable: false, database: 'default', error: null as string | null },
    gemini: { keyPresent: !!process.env.GEMINI_API_KEY },
  };

  try {
    // A read against a document that need not exist — this is testing whether
    // the credentials can talk to Firestore at all, not what is stored.
    // The id deliberately avoids the __x__ form, which Firestore reserves and
    // rejects with INVALID_ARGUMENT before it ever checks credentials.
    await adminDb.collection('rooms').doc('healthcheck').get();
    report.firestore.reachable = true;
    report.ok = true;
  } catch (error) {
    report.firestore.error = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
