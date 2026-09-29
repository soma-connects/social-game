import { AI_PROMPT_POOLS } from '../aiGameMaster';
import { DEFAULT_ROOM_VIBE, ROOM_VIBES, RoomVibeId } from '../roomVibes';
import { AiMasterCategory } from '../types';

/**
 * The AI Master's voice, in one place.
 *
 * Both the /api/ai-master endpoint (which the client calls for one-off host
 * lines) and the room route (which needs challenges the client cannot forge)
 * generate text through here, so the persona cannot drift between the two.
 */

export const HOST_SYSTEM_PROMPT = `You are the AI Game Master for "Voice Party", a high-energy multiplayer voice gaming platform.

YOUR ROLE & PERSONALITY:
- You are a witty, charismatic, energetic, and encouraging party host.
- Speak in smooth, natural, clever English with punchy humor.
- DO NOT force unnatural slang, awkward tropes, or fake accents (avoid forcing "yam", "Oya", or cliché slang unless completely natural).
- Keep ALL responses under 2 short sentences (5-8 seconds when spoken aloud).
- Never replace players, never insult players, and keep prompts fun, clever, and engaging.
`;

/**
 * Room-vibe presets can name a 'grok' provider (e.g. the flirty_wild room), but
 * there is no xAI integration yet — this is the single place that would change
 * once a Grok key exists. Everything falls through to Gemini today.
 */
export function resolveProvider(vibe: RoomVibeId): 'gemini' {
  const preset = ROOM_VIBES[vibe] ?? ROOM_VIBES[DEFAULT_ROOM_VIBE];
  if (preset.provider === 'grok') {
    console.warn(`aiHost: room vibe "${vibe}" wants Grok, no xAI key configured yet — using Gemini.`);
  }
  return 'gemini';
}

/** Normalises whatever the caller passed into a vibe we actually have. */
export function coerceVibe(value: unknown): RoomVibeId {
  return typeof value === 'string' && value in ROOM_VIBES ? (value as RoomVibeId) : DEFAULT_ROOM_VIBE;
}

/**
 * Asks Gemini for one line in the host's voice, coloured by the room's vibe.
 *
 * Returns null rather than throwing on any failure — a missing key, a rate
 * limit or a bad response should cost the room a witty line, never the round.
 * Callers supply their own fallback.
 */
/**
 * How long a line is worth waiting for.
 *
 * Every one of these calls sits inside a room action, and the room document is
 * not written until the action returns — so the whole table stares at an
 * unchanged screen for as long as this takes. There was no timeout at all,
 * which meant a slow or hanging Gemini stopped the game outright.
 */
export const HOST_LINE_TIMEOUT_MS = 1_500;
/** The challenge *is* the round, so it is worth waiting a little longer for. */
export const HOST_CHALLENGE_TIMEOUT_MS = 5_000;
/** A JSON question is a longer generation, and the bank is right behind it. */
export const HOST_TRIVIA_TIMEOUT_MS = 4_000;

/**
 * Stops every round paying the timeout when Gemini is simply unavailable.
 *
 * A bad key, an exhausted quota or an outage fails identically on every call,
 * and without this each one costs another full timeout — so the mode gets
 * slower exactly when it is already broken. After a few consecutive failures
 * the calls are skipped outright and the fallbacks are used, and one call is
 * let through periodically to notice when the service comes back.
 */
const BREAKER_TRIP_AFTER = 3;
const BREAKER_COOLDOWN_MS = 60_000;
let consecutiveFailures = 0;
let breakerOpenedAt = 0;

function breakerIsOpen(): boolean {
  if (consecutiveFailures < BREAKER_TRIP_AFTER) return false;
  if (Date.now() - breakerOpenedAt > BREAKER_COOLDOWN_MS) {
    // Let one through to see whether it is back.
    consecutiveFailures = BREAKER_TRIP_AFTER - 1;
    return false;
  }
  return true;
}

function noteFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures === BREAKER_TRIP_AFTER) breakerOpenedAt = Date.now();
}

export async function askHost(
  vibe: RoomVibeId,
  task: string,
  timeoutMs: number = HOST_LINE_TIMEOUT_MS
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (breakerIsOpen()) return null;

  resolveProvider(vibe);
  const persona = (ROOM_VIBES[vibe] ?? ROOM_VIBES[DEFAULT_ROOM_VIBE]).hostPersona;

  // Abandoned rather than merely ignored: without an abort the fetch keeps the
  // request alive after we have stopped caring about it.
  const controller = new AbortController();
  const bell = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${HOST_SYSTEM_PROMPT}\n\nROOM VIBE: ${persona}\n\nTask: ${task}` }] }],
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok) throw new Error(`Gemini API HTTP ${response.status}`);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    consecutiveFailures = 0;
    return typeof text === 'string' && text.length > 0 ? text : null;
  } catch (error) {
    noteFailure();
    // A timeout is the expected case under load, not an incident.
    if ((error as Error)?.name !== 'AbortError') {
      console.error('aiHost: generation failed', error);
    }
    return null;
  } finally {
    clearTimeout(bell);
  }
}

/**
 * Maps a category onto the curated pools, for when no generated line is ready.
 *
 * The pools are tagged with their own categories, which only partly overlap —
 * anything without a home falls back to the personality prompts, which suit
 * being read aloud regardless of what was asked for.
 */
const FALLBACK_POOL: Record<AiMasterCategory, string> = {
  truth: 'icebreaker',
  dare: 'personality',
  bluff: 'truth_bluff',
  trivia: 'icebreaker',
  story: 'personality',
};

/**
 * A curated challenge, chosen without touching the network.
 *
 * The round is never held up for a generated one: hostLinePool writes those
 * ahead of time, and this is what plays when its bucket is cold.
 */
export function fallbackChallenge(category: AiMasterCategory): string {
  const wanted = FALLBACK_POOL[category];
  const pool = AI_PROMPT_POOLS.filter((p) => p.category === wanted);
  const source = pool.length > 0 ? pool : AI_PROMPT_POOLS;
  return source[Math.floor(Math.random() * source.length)].text;
}


/**
 * Asks Gemini for a fresh trivia question.
 *
 * The bank in triviaBank.ts is the floor: it never fails, never costs an API
 * call and works with no key configured. This is the layer on top, and it earns
 * its place on exactly the questions a file cannot hold — anything current.
 * A question about this year's events is out of date the week after it is
 * committed, so those are asked at the moment of play or not at all.
 *
 * Returns null on anything unexpected, like askHost: a missing key, a rate
 * limit, or a model that answers with prose instead of JSON should cost the
 * room a question from the bank, never the round.
 */
export async function generateTriviaFromAi(
  vibe: RoomVibeId,
  topicHint?: string
): Promise<{ question: string; answer: string; accept: string[]; funFact: string } | null> {
  const topic = topicHint?.trim()
    ? `The question must be about: ${topicHint.trim()}.`
    : 'Pick any widely known topic. Favour Nigerian and West African general knowledge about half the time.';

  const raw = await askHost(
    vibe,
    `Write ONE trivia question for a voice party game, and reply with nothing but JSON.

${topic}

The answer is SPOKEN into a phone and graded by fuzzy text match, so:
- the answer must be at most three words
- no multiple choice, no "all of the above"
- include every form somebody might say it as, especially for years and numbers
  (a recogniser returns "1960" from one phone and "nineteen sixty" from another)
- nothing whose spelling a recogniser would have to guess at

Reply exactly:
{"question":"...","answer":"...","accept":["...","..."],"funFact":"..."}`,
    HOST_TRIVIA_TIMEOUT_MS
  );
  if (!raw) return null;

  try {
    // Models like to wrap JSON in a fenced block however firmly you ask.
    const json = raw.replace(/```(?:json)?/gi, '').trim();
    const start = json.indexOf('{');
    const end = json.lastIndexOf('}');
    if (start === -1 || end <= start) return null;

    const parsed = JSON.parse(json.slice(start, end + 1));
    const question = String(parsed.question ?? '').trim();
    const answer = String(parsed.answer ?? '').trim();
    if (!question || !answer) return null;
    // A long answer cannot be said and matched reliably, whatever it was asked
    // for — better to fall back to the bank than serve an unwinnable round.
    if (answer.split(/\s+/).length > 4) return null;

    const accept = Array.isArray(parsed.accept)
      ? parsed.accept.map((a: unknown) => String(a).trim()).filter(Boolean).slice(0, 8)
      : [];

    return { question, answer, accept, funFact: String(parsed.funFact ?? '').trim() };
  } catch {
    return null;
  }
}
