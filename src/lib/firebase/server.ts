import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize the Firebase Admin SDK if it hasn't been initialized already.
// We use the application default credentials for security.
if (!getApps().length) {
  try {
    // If running locally, you must set GOOGLE_APPLICATION_CREDENTIALS
    // to point to your service account key JSON file, OR provide
    // FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY
    // as environment variables.
    if (process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Handle newlines in the private key when loaded from env vars
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      // Explicitly pass projectId because ADC user credentials don't include it
      initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

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
