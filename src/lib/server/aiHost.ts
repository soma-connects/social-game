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
export async function askHost(vibe: RoomVibeId, task: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  resolveProvider(vibe);
  const persona = (ROOM_VIBES[vibe] ?? ROOM_VIBES[DEFAULT_ROOM_VIBE]).hostPersona;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${HOST_SYSTEM_PROMPT}\n\nROOM VIBE: ${persona}\n\nTask: ${task}` }] }],
        }),
      }
    );
    if (!response.ok) throw new Error(`Gemini API HTTP ${response.status}`);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return typeof text === 'string' && text.length > 0 ? text : null;
  } catch (error) {
    console.error('aiHost: generation failed', error);
    return null;
  }
}

/** What each category actually asks the player to do, for the prompt and the fallback. */
const CATEGORY_BRIEF: Record<AiMasterCategory, string> = {
  truth: 'a personal question they have to answer honestly out loud',
  dare: 'a short performance dare they can do on the spot with just their voice',
  bluff: 'a prompt to tell one true story and one convincing lie about themselves',
  trivia: 'a single general-knowledge question with a definite answer',
  story: 'a one-line story opening they have to continue out loud',
};

/**
 * Maps a category onto the curated pools, for when Gemini is unavailable.
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

function fallbackChallenge(category: AiMasterCategory): string {
  const wanted = FALLBACK_POOL[category];
  const pool = AI_PROMPT_POOLS.filter((p) => p.category === wanted);
  const source = pool.length > 0 ? pool : AI_PROMPT_POOLS;
  return source[Math.floor(Math.random() * source.length)].text;
}

/**
 * Builds the round's task and the line the host says while setting it.
 *
 * Generated server-side on purpose: a client that writes its own challenge
 * writes itself an easy one, and the whole round is judged by the room on the
 * strength of what was asked.
 */
export async function generateChallenge(
  vibe: RoomVibeId,
  category: AiMasterCategory,
  playerName: string
): Promise<{ challenge: string; hostLine: string }> {
  const brief = CATEGORY_BRIEF[category];
  const generated = await askHost(
    vibe,
    `Set a challenge for the player "${playerName}" in front of the whole room. Give them ${brief}. ` +
      `Reply with EXACTLY two lines and no labels:\n` +
      `Line 1: one short sentence you say to the room as you call ${playerName} out.\n` +
      `Line 2: the challenge itself, addressed directly to ${playerName}.`
  );

  if (generated) {
    const lines = generated
      .split('\n')
      .map((l) => l.replace(/^\s*(line\s*\d\s*[:.\-]?|[-*])\s*/i, '').trim())
      .filter(Boolean);
    if (lines.length >= 2) return { hostLine: lines[0], challenge: lines.slice(1).join(' ') };
    // One usable line back: it is the challenge, and the call-out is canned.
    if (lines.length === 1) {
      return { hostLine: `${playerName}, you are up. Let's see it.`, challenge: lines[0] };
    }
  }

  return {
    hostLine: `${playerName}, you are up. Let's see what you have got!`,
    challenge: fallbackChallenge(category),
  };
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
{"question":"...","answer":"...","accept":["...","..."],"funFact":"..."}`
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
