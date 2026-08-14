import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Firebase Admin, which is the only thing allowed to write game state.
 *
 * Two credential paths:
 *   - A service account in the environment (how the deployed container runs).
 *   - Application Default Credentials (how a developer machine runs, via
 *     `gcloud auth application-default login`).
 *
 * The previous version wrapped initialisation in a try/catch that logged and
 * carried on, then called getFirestore() regardless. When the credentials were
 * wrong the app booted "successfully" and every single API request died with an
 * unhandled exception — a 500 with an empty body and nothing to go on. Failing
 * loudly here, with a message that names the actual problem, is worth far more
 * than surviving to serve broken requests.
 */

/**
 * Normalises a PEM private key pasted into a hosting dashboard.
 *
 * Three things routinely go wrong and all of them produce the same opaque
 * "Failed to parse private key" from the SDK:
 *   - The value is copied straight out of the JSON with its surrounding quotes.
 *   - Newlines arrive as the two characters \ and n rather than real breaks.
 *   - The dashboard escapes them twice, giving \\n.
 */
function normalisePrivateKey(raw: string): string {
  let key = raw.trim();

  // Strip one layer of wrapping quotes, which is what you get pasting the JSON
  // field verbatim.
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  return key.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
}

/** Describes what is configured without ever revealing a value. */
export function describeCredentialSource(): {
  mode: 'service-account' | 'application-default';
  projectId: string | null;
  clientEmail: string | null;
  privateKeyPresent: boolean;
  privateKeyLooksValid: boolean;
} {
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  const key = rawKey ? normalisePrivateKey(rawKey) : '';
  return {
    mode: rawKey ? 'service-account' : 'application-default',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    // An email is not a secret and it is the field most often left unset.
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? null,
    privateKeyPresent: !!rawKey,
    privateKeyLooksValid: key.includes('-----BEGIN') && key.includes('PRIVATE KEY-----'),
  };
}

if (!getApps().length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (rawKey) {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = normalisePrivateKey(rawKey);

    // Checked before handing it to the SDK, because the SDK's own error does
    // not say which of the three fields was wrong.
    if (!projectId) {
      throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set — the Admin SDK cannot pick a project.');
    }
    if (!clientEmail) {
      throw new Error('FIREBASE_CLIENT_EMAIL is not set, but FIREBASE_PRIVATE_KEY is. Both are required together.');
    }
    if (!privateKey.includes('-----BEGIN') || !privateKey.includes('PRIVATE KEY-----')) {
      throw new Error(
        'FIREBASE_PRIVATE_KEY does not look like a PEM key. Paste the whole `private_key` value from the ' +
          'service account JSON, including the BEGIN and END lines.'
      );
    }

    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } else {
    // Local development via Application Default Credentials. projectId is
    // passed explicitly because ADC user credentials do not carry one.
    initializeApp({ projectId });
  }
}

/**
 * Note the database id: this project's Firestore instance is literally named
 * `default`, not the usual `(default)`, so it has to be requested by name.
 */
export const adminDb = getFirestore('default');

// RoomState is full of optional fields, and the SDK throws on an explicit
// `undefined` rather than skipping it — one stray optional turns a routine room
// write into a 500 that takes the whole room down. Treat undefined as absent.
// Guarded because settings() may only be called before the first operation, and
// Next.js can re-evaluate this module on a hot reload.
try {
  adminDb.settings({ ignoreUndefinedProperties: true });
} catch {
  /* already initialised — the setting from the first call still stands */
}
