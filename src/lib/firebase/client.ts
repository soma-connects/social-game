import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, getToken, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if it hasn't been initialized already
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ─── App Check ──────────────────────────────────────────────────────────────
//
// Proves a request comes from this web app running in a real browser, not a
// script replaying our API calls. reCAPTCHA Enterprise scores the visitor
// invisibly; Firebase swaps a good score for a short-lived token that the
// Firestore SDK attaches by itself and that our own paid API routes check
// (see src/lib/server/appCheck.ts).
//
// Started at module load, not on first use, so the token is usually ready
// before the first voice or host request needs it.

let appCheck: AppCheck | null = null;
const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

if (typeof window !== 'undefined' && siteKey) {
  // The site key only works on the domains registered for it, so local
  // development authenticates with a debug token instead. Never in a
  // production build: a debug token baked into the bundle is a pass anyone
  // could copy out of it.
  const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
  if (debugToken && process.env.NODE_ENV !== 'production') {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    // A hot reload re-runs this module against the same app, which throws.
    console.warn('[app-check] not initialised', error);
  }
}

/** Longest a request waits for a token before going without one. */
const APP_CHECK_WAIT_MS = 2500;

/**
 * The App Check header for a call to one of our paid API routes, or nothing.
 *
 * Never throws and never hangs: an ad blocker that stops the reCAPTCHA script
 * would otherwise freeze the game's voice. Without a token the server decides —
 * in monitor mode it serves the request and logs it.
 */
export async function appCheckHeaders(): Promise<Record<string, string>> {
  if (!appCheck) return {};
  try {
    const result = await Promise.race([
      getToken(appCheck),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), APP_CHECK_WAIT_MS)),
    ]);
    return result?.token ? { 'X-Firebase-AppCheck': result.token } : {};
  } catch {
    return {};
  }
}

export const db = getFirestore(app, 'default');
