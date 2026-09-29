import { getAppCheck } from 'firebase-admin/app-check';
// Imported for its side effect: it initialises the Admin app this relies on.
import '../firebase/server';

type Mode = 'off' | 'monitor' | 'enforce';

/**
 * APP_CHECK_MODE, defaulting to monitor.
 *
 * Rolled out the way Firebase rolls out its own enforcement: watch first,
 * block later. Players still on a tab opened before this shipped, or whose ad
 * blocker stops the reCAPTCHA script, send no token, and enforcing on day one
 * would cut their voice off mid-game. Monitor serves them and logs it; flip to
 * enforce once the logs show nearly every request verified.
 */
function mode(): Mode {
  const value = process.env.APP_CHECK_MODE;
  return value === 'off' || value === 'enforce' ? value : 'monitor';
}

/**
 * Whether a request to a paid route may proceed, judged by its App Check token.
 *
 * Room membership says the caller holds a seat; this says the caller is our web
 * app in a real browser. Without it, anyone who joins a room once can lift the
 * room token out of devtools and script the paid routes up to the quota.
 */
export async function passesAppCheck(request: Request, route: string): Promise<boolean> {
  const current = mode();
  if (current === 'off') return true;

  const token = request.headers.get('x-firebase-appcheck');
  if (token) {
    try {
      await getAppCheck().verifyToken(token);
      return true;
    } catch {
      /* forged, expired or for another project — treated as missing */
    }
  }

  console.warn(`[app-check] ${route}: ${token ? 'invalid' : 'missing'} token (${current})`);
  return current === 'monitor';
}
