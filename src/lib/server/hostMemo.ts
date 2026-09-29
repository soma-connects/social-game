/**
 * Remembers what the AI host said for one request, so a replay does not ask again.
 *
 * The room API reads a room, applies an action and writes it back, and if
 * anyone else wrote in between it throws the attempt away and runs the whole
 * action again. That is right for the state and ruinous for a model call made
 * inside it: with a couple of players heartbeating, a two-second call is
 * regularly overtaken by another write, and each replay asked the model again -
 * up to five times, then "the room is busy". The AI Master seemed to take an
 * age because it often was: several serial round trips to the model for one tap
 * on NEXT ROUND.
 *
 * Keyed by everything that should change the answer (room, round, who, what was
 * said), so a replay against unchanged state is instant and a genuinely
 * different question still gets asked. Held briefly and bounded.
 */

const TTL_MS = 60_000;
const MAX_ENTRIES = 300;

type Entry = { at: number; value: Promise<unknown> };

const cache: Map<string, Entry> = ((globalThis as unknown as { __hostMemo?: Map<string, Entry> }).__hostMemo ??=
  new Map());

function sweep(now: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.at > TTL_MS) cache.delete(key);
  }
  // Oldest first: a Map iterates in insertion order.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function once<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const now = Date.now();
  sweep(now);

  const hit = cache.get(key);
  if (hit) return hit.value as Promise<T>;

  const value = produce();
  cache.set(key, { at: now, value });
  // A call that throws is not worth remembering; one that merely came back
  // empty is (the host functions return null on failure), so that a replay
  // does not sit through the same slow failure again.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** For tests. */
export function forgetAll(): void {
  cache.clear();
}
