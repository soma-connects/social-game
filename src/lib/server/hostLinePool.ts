import { RoomVibeId } from '../roomVibes';
import { AiMasterCategory } from '../types';
import { askHost, generateTriviaFromAi, HOST_CHALLENGE_TIMEOUT_MS } from './aiHost';

/**
 * Host lines generated *before* they are needed.
 *
 * Every AI Master transition used to await Gemini before the room document was
 * written, so the whole table sat on an unchanged screen for as long as the
 * call took — and a round has five of them. Capping the timeout bounds that,
 * but a bounded freeze is still a freeze: the fix is not to be waiting at all
 * when the moment arrives.
 *
 * So the lines are written with a placeholder where the name goes, generated
 * while nothing is happening, and dropped in synchronously when the round
 * turns. An empty bucket costs the room a canned line, never a pause — exactly
 * what a failed call already cost.
 *
 * In-memory on purpose. This is a cache of disposable flavour text, so a cold
 * start or a second serverless instance simply means a few canned lines while
 * it fills; persisting it would buy nothing and cost a read on every round.
 */

/** What the generated lines say instead of a name. */
const PLAYER_SLOT = '{PLAYER}';

export type QuipKind = 'praise' | 'taunt' | 'eliminate' | 'bribe_accept' | 'bribe_refuse';

/** How each quip is asked for. `{PLAYER}` is the player it is said about. */
const QUIP_BRIEF: Record<QuipKind, string> = {
  praise: `congratulate ${PLAYER_SLOT} for surviving a challenge the room voted on`,
  taunt: `tease ${PLAYER_SLOT} for bombing their challenge and costing themselves a life`,
  eliminate: `dramatically announce that ${PLAYER_SLOT} has run out of lives and is eliminated`,
  bribe_accept: `corruptly and shamelessly accept a bribe ${PLAYER_SLOT} just paid you`,
  bribe_refuse: `publicly refuse ${PLAYER_SLOT}'s bribe and mock them for trying it`,
};

/** What each category actually asks the player to do. */
const CATEGORY_BRIEF: Record<AiMasterCategory, string> = {
  truth: 'a personal question they have to answer honestly out loud',
  dare: 'a short performance dare they can do on the spot with just their voice',
  bluff: 'a prompt to tell one true story and one convincing lie about themselves',
  trivia: 'a single general-knowledge question with a definite answer',
  story: 'a one-line story opening they have to continue out loud',
};

export type PooledChallenge = { hostLine: string; challenge: string };

/**
 * How many of each line to keep ready.
 *
 * Two is the useful number: one for the moment that is coming and one spare so
 * a bucket is not empty the instant it is used. More would mean generating
 * lines most rooms never reach.
 */
const BUCKET_TARGET = 2;

type Bucket<T> = { ready: T[]; inFlight: number };

const quips = new Map<string, Bucket<string>>();
const challenges = new Map<string, Bucket<PooledChallenge>>();

function bucketOf<T>(store: Map<string, Bucket<T>>, key: string): Bucket<T> {
  let bucket = store.get(key);
  if (!bucket) {
    bucket = { ready: [], inFlight: 0 };
    store.set(key, bucket);
  }
  return bucket;
}

/**
 * Puts the real name back into a pooled line.
 *
 * A model that ignored the placeholder still wrote a usable line — generic
 * praise reads perfectly well — so a missing slot is not a reason to throw the
 * line away.
 */
function fill(line: string, playerName: string): string {
  return line.split(PLAYER_SLOT).join(playerName);
}

/** Takes a ready quip, or null if the bucket is cold. Never waits. */
export function takeHostQuip(vibe: RoomVibeId, kind: QuipKind, playerName: string): string | null {
  const line = bucketOf(quips, `${vibe}:${kind}`).ready.shift();
  return line ? fill(line, playerName) : null;
}

/** Takes a ready challenge, or null if the bucket is cold. Never waits. */
export function takeChallenge(
  vibe: RoomVibeId,
  category: AiMasterCategory,
  playerName: string
): PooledChallenge | null {
  const pooled = bucketOf(challenges, `${vibe}:${category}`).ready.shift();
  if (!pooled) return null;
  return { hostLine: fill(pooled.hostLine, playerName), challenge: fill(pooled.challenge, playerName) };
}

/** Splits the two-line challenge reply, mirroring what generateChallenge does. */
function parseChallenge(raw: string): PooledChallenge | null {
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/^\s*(line\s*\d\s*[:.\-]?|[-*])\s*/i, '').trim())
    .filter(Boolean);
  if (lines.length >= 2) return { hostLine: lines[0], challenge: lines.slice(1).join(' ') };
  if (lines.length === 1) return { hostLine: `${PLAYER_SLOT}, you are up. Let's see it.`, challenge: lines[0] };
  return null;
}

/**
 * Tops the buckets back up, in the background.
 *
 * Deliberately returns void rather than a promise: callers are request handlers
 * that must not wait on this, and an unawaited rejection would take the request
 * down with it, so every path here resolves.
 */
export function warmHostPool(vibe: RoomVibeId): void {
  for (const kind of Object.keys(QUIP_BRIEF) as QuipKind[]) {
    const bucket = bucketOf(quips, `${vibe}:${kind}`);
    if (bucket.ready.length + bucket.inFlight >= BUCKET_TARGET) continue;
    bucket.inFlight += 1;
    void askHost(
      vibe,
      `In one short sentence, ${QUIP_BRIEF[kind]}. ` +
        `Write the player's name as exactly ${PLAYER_SLOT}, including the braces, so it can be swapped in later. ` +
        `Reply with the sentence only.`
    )
      .then((line) => {
        // Capped so a room that never spends its lines cannot grow the bucket.
        if (line && bucket.ready.length < BUCKET_TARGET) bucket.ready.push(line);
      })
      .catch(() => undefined)
      .finally(() => {
        bucket.inFlight -= 1;
      });
  }

  for (const category of Object.keys(CATEGORY_BRIEF) as AiMasterCategory[]) {
    const bucket = bucketOf(challenges, `${vibe}:${category}`);
    if (bucket.ready.length + bucket.inFlight >= BUCKET_TARGET) continue;
    bucket.inFlight += 1;
    void askHost(
      vibe,
      `Set a challenge for the player ${PLAYER_SLOT} in front of the whole room. Give them ${CATEGORY_BRIEF[category]}. ` +
        `Write the player's name as exactly ${PLAYER_SLOT}, including the braces, so it can be swapped in later. ` +
        `Reply with EXACTLY two lines and no labels:\n` +
        `Line 1: one short sentence you say to the room as you call ${PLAYER_SLOT} out.\n` +
        `Line 2: the challenge itself, addressed directly to ${PLAYER_SLOT}.`,
      HOST_CHALLENGE_TIMEOUT_MS
    )
      .then((raw) => {
        const parsed = raw ? parseChallenge(raw) : null;
        if (parsed && bucket.ready.length < BUCKET_TARGET) bucket.ready.push(parsed);
      })
      .catch(() => undefined)
      .finally(() => {
        bucket.inFlight -= 1;
      });
  }
}

/**
 * A generated trivia question, waiting for the round that asks for one.
 *
 * Same problem as the challenge, from the other end of the app: the question
 * was fetched at the moment the mini-game opened, so the table watched a
 * loading screen for as long as the model took to answer in JSON. Kept to one
 * spare, because a question costs a whole generation and most rooms play a
 * handful.
 */
export type PooledTrivia = { question: string; answer: string; accept: string[]; funFact: string };

const TRIVIA_TARGET = 1;
const trivia = new Map<string, Bucket<PooledTrivia>>();

/** Takes a ready question, or null if none has come back yet. Never waits. */
export function takeTrivia(vibe: RoomVibeId): PooledTrivia | null {
  return bucketOf(trivia, vibe).ready.shift() ?? null;
}

/** Tops the trivia bucket back up, in the background. Returns immediately. */
export function warmTriviaPool(vibe: RoomVibeId): void {
  const bucket = bucketOf(trivia, vibe);
  if (bucket.ready.length + bucket.inFlight >= TRIVIA_TARGET) return;
  bucket.inFlight += 1;
  void generateTriviaFromAi(vibe)
    .then((question) => {
      if (question && bucket.ready.length < TRIVIA_TARGET) bucket.ready.push(question);
    })
    .catch(() => undefined)
    .finally(() => {
      bucket.inFlight -= 1;
    });
}

/** Test seam: empties every bucket. */
export function resetHostPool(): void {
  quips.clear();
  challenges.clear();
  trivia.clear();
}

/** Test seam: how many lines are ready for a bucket. */
export function pooledCount(vibe: RoomVibeId, kind: QuipKind | AiMasterCategory): number {
  return (
    (quips.get(`${vibe}:${kind}`)?.ready.length ?? 0) +
    (challenges.get(`${vibe}:${kind}`)?.ready.length ?? 0)
  );
}
