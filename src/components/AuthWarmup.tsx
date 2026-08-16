'use client';

import { useEffect } from 'react';
import { ensureSignedIn } from '@/lib/firebase/auth';

/**
 * Starts anonymous sign-in as soon as the app loads.
 *
 * Nothing renders and nothing waits on this. It exists because the first thing
 * that actually needs the uid is creating or joining a room, and resolving
 * sign-in at that moment would put a network round trip in front of the one
 * button people are impatient about. Kicking it off here means the token is
 * almost always already in hand by then.
 *
 * ensureSignedIn caches its promise, so this races nothing and repeats nothing.
 */
export default function AuthWarmup() {
  useEffect(() => {
    void ensureSignedIn();
  }, []);

  return null;
}
