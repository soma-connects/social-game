import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

/**
 * Durable player identity.
 *
 * Everything the game currently calls a "player id" is disposable: it is minted
 * when somebody joins a room and dies with that room six hours later. That is
 * fine for deciding whose turn it is, and useless for anything that has to
 * outlive a session — match history, progression, and above all purchases. You
 * cannot sell somebody a powerup against an id that evaporates.
 *
 * Anonymous auth is the right starting point for a party game:
 *
 *  - No signup. People arrive from a WhatsApp link and want to play, and a
 *    registration wall at that moment costs more players than it earns.
 *  - The uid is stable for that browser across sessions and rooms.
 *  - It can be UPGRADED in place. Linking a Google account later keeps the same
 *    uid, so purchases and history survive the upgrade rather than starting
 *    over. That property is why this has to exist before money is involved —
 *    retrofitting identity onto records that were written without one means
 *    reconciling rows that have no owner.
 *
 * Requires the Anonymous provider to be switched on in the Firebase console
 * (Authentication -> Sign-in method). Until then this fails gracefully and the
 * game keeps working exactly as it does today, minus the durable identity.
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function app() {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

let signInPromise: Promise<User | null> | null = null;

/**
 * Signs in anonymously, reusing the existing session when there is one.
 *
 * Collapsed onto a single promise because several parts of the app want the uid
 * at once on first load, and firing concurrent sign-ins would be wasteful.
 */
export function ensureSignedIn(): Promise<User | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (signInPromise) return signInPromise;

  signInPromise = (async () => {
    try {
      const auth = getAuth(app());

      // Firebase restores a previous anonymous session from IndexedDB, but not
      // synchronously — so wait for the first auth state before deciding
      // whether a new sign-in is needed. Skipping this creates a fresh uid on
      // every reload, which defeats the entire point.
      const existing = await new Promise<User | null>((resolve) => {
        const stop = onAuthStateChanged(auth, (user) => {
          stop();
          resolve(user);
        });
      });

      if (existing) return existing;

      const credential = await signInAnonymously(auth);
      return credential.user;
    } catch (error) {
      // Most likely the Anonymous provider is not enabled yet. The game is
      // fully playable without it; only durable identity is lost.
      console.warn(
        'Anonymous sign-in unavailable — durable player identity is off. Enable Anonymous auth in the Firebase console to turn on match history and purchases.',
        error
      );
      return null;
    }
  })();

  return signInPromise;
}

/** The stable uid for this browser, or null if auth is unavailable. */
export async function getUid(): Promise<string | null> {
  const user = await ensureSignedIn();
  return user?.uid ?? null;
}

/**
 * A short-lived token proving this uid to the server.
 *
 * The uid alone is not proof — a browser can claim any string. The server
 * verifies this with the Admin SDK, which is what makes it safe to attach
 * purchases and entitlements to.
 */
export async function getIdToken(): Promise<string | null> {
  const user = await ensureSignedIn();
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}
