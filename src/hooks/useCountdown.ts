'use client';

import { useEffect, useState } from 'react';

/**
 * Seconds remaining until an epoch-ms deadline, ticking once a second.
 *
 * Returns null when there is no deadline to show — either none was given, or it
 * is further out than `withinMs`, which keeps a three-minute server timeout from
 * sitting on screen as a three-minute clock. A room only wants the number once
 * the wait has started to feel like a fault.
 *
 * The interval depends on the deadline alone. Countdowns here have a habit of
 * being wired to a value that changes as the room polls, and the tick is then
 * cleared and restarted before it ever fires — which is how a one-second clock
 * ends up standing still.
 */
export function useCountdown(deadline: number | null | undefined, withinMs?: number): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  if (!deadline) return null;
  const msLeft = deadline - now;
  if (msLeft <= 0) return null;
  if (withinMs !== undefined && msLeft > withinMs) return null;
  return Math.ceil(msLeft / 1000);
}
