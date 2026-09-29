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

export const HOST_SYSTEM_PROMPT = `You are the AI Game Master for "Voice Party", a live voice party game that friends play together on a call.

YOUR PERSONALITY:
- A sharp, quick comedy-club host. You tease; you do not gush.
- React to what actually happened: quote or twist the player's real words, their score, how many lives they have left, who they are up against. If you have nothing specific to react to, say less.
- Praise only what was earned. Somebody who said nothing, dodged, or bombed is teased for exactly that and never congratulated. Somebody who was good gets grudging respect, not a parade.
- Plain, natural English with punchy timing. No filler openers ("All right party people", "Let's go", "Woo"), no forced slang or accents.
- ONE or TWO short sentences, about five to eight seconds spoken. Never a list, never a label.
- Roast the performance and the choices, never who someone is: nothing about race, religion, gender, sexuality, disability, body, family or tribe. No slurs, nothing sexual. The person on the mic should laugh, not hurt.
- Never replace players or speak for them.`;

const STRANGER_RULES = `MILD MODE: some people in this room may not know each other. Tease lightly and keep it PG — poke at the moment, never at the person, and drop anything cutting.`;

export type HostProvider = 'gemini' | 'grok';

/** What the caller knows about the room, so the host can be specific rather than generic. */
export type HostOptions = {
  /** The room has, or has had, strangers in it: stay mild and stay on the default model. */
  strangers?: boolean;
  /** Plain-text facts: who is in the room, their lives and points, what was said. */
  facts?: string;
};

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/**
 * Which model speaks for this room.
 *
 * Grok is the sharper roaster, so it takes the vibes that ask for it (the Roast
 * Room, Flirty & Wild) whenever an xAI key is configured — or every vibe, if
 * AI_HOST_PROVIDER=grok. It is never used for a room with strangers in it: a
 * model with fewer brakes is exactly what a public lobby should not get.
 * Everything else, and every failure, is Gemini.
 */
export function resolveProvider(vibe: RoomVibeId, strangers = false): HostProvider {
  if (strangers) return 'gemini';
  const preset = ROOM_VIBES[vibe] ?? ROOM_VIBES[DEFAULT_ROOM_VIBE];
  const forced = process.env.AI_HOST_PROVIDER?.trim().toLowerCase();
  const wantsGrok = forced === 'grok' || (forced !== 'gemini' && preset.provider === 'grok');
  if (!wantsGrok) return 'gemini';
  if (!process.env.XAI_API_KEY) {
    warnOnce(`grok:${vibe}`, `aiHost: room vibe "${vibe}" wants Grok, no XAI_API_KEY is set — using Gemini.`);
    return 'gemini';
  }
  return 'grok';
}

/** Normalises whatever the caller passed into a vibe we actually have. */
export function coerceVibe(value: unknown): RoomVibeId {
  return typeof value === 'string' && value in ROOM_VIBES ? (value as RoomVibeId) : DEFAULT_ROOM_VIBE;
}

/** Everything the model is told before the task: who it is, the room's mood, and what it knows. */
export function hostInstructions(vibe: RoomVibeId, options: HostOptions = {}): string {
  const persona = (ROOM_VIBES[vibe] ?? ROOM_VIBES[DEFAULT_ROOM_VIBE]).hostPersona;
  const parts = [HOST_SYSTEM_PROMPT, `ROOM VIBE: ${persona}`];
  if (options.strangers) parts.push(STRANGER_RULES);
  if (options.facts?.trim()) parts.push(`WHAT YOU KNOW RIGHT NOW:\n${options.facts.trim()}`);
  return parts.join('\n\n');
}

/** A host line is spoken aloud inside a request the room is waiting on, so nothing here may hang. */
const HOST_TIMEOUT_MS = 9000;

async function askGemini(system: string, task: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(HOST_TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: task }] }],
          // Thinking is off: a one-line quip does not need it, and its tokens
          // count against the output budget, which is how a short reply comes
          // back empty.
          generationConfig: { temperature: 1, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    if (!response.ok) throw new Error(`Gemini API HTTP ${response.status}`);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return typeof text === 'string' && text.length > 0 ? text : null;
  } catch (error) {
    console.error('aiHost: Gemini generation failed', error);
    return null;
  }
}

/** xAI's API speaks the OpenAI chat-completions dialect. */
async function askGrok(system: string, task: string): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  // A non-reasoning model by default: the room is waiting on this line.
  const model = process.env.XAI_MODEL?.trim() || 'grok-4-fast-non-reasoning';

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(HOST_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: task },
        ],
        temperature: 1,
        max_tokens: 400,
        stream: false,
      }),
    });
    if (!response.ok) throw new Error(`xAI API HTTP ${response.status} (model ${model})`);

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return typeof text === 'string' && text.length > 0 ? text : null;
  } catch (error) {
    console.error('aiHost: Grok generation failed, falling back to Gemini', error);
    return null;
  }
}

/**
 * Asks the host model for one line in the host's voice, coloured by the room's vibe.
 *
 * Returns null rather than throwing on any failure — a missing key, a rate
 * limit or a bad response should cost the room a witty line, never the round.
 * Callers supply their own fallback.
 */
export async function askHost(vibe: RoomVibeId, task: string, options: HostOptions = {}): Promise<string | null> {
  const system = hostInstructions(vibe, options);
  if (resolveProvider(vibe, options.strangers) === 'grok') {
    const line = await askGrok(system, task);
    if (line) return line;
  }
  return askGemini(system, task);
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
  playerName: string,
  options: HostOptions = {}
): Promise<{ challenge: string; hostLine: string }> {
  const brief = CATEGORY_BRIEF[category];
  const generated = await askHost(
    vibe,
    `Set a challenge for the player "${playerName}" in front of the whole room. Give them ${brief}. ` +
      `Make it specific and a little uncomfortable — something the room will want to hear the answer to, not a generic icebreaker. ` +
      `Reply with EXACTLY two lines and no labels:\n` +
      `Line 1: one short sentence you say to the room as you call ${playerName} out. Make it about them or the moment, never a generic hype line.\n` +
      `Line 2: the challenge itself, addressed directly to ${playerName}.`,
    options
  );

  if (generated) {
    const lines = generated
      .split('\n')
      .map((l) => l.replace(/^\s*(line\s*\d\s*[:.\-]?|[-*])\s*/i, '').trim())
      .filter(Boolean);
    if (lines.length >= 2) return { hostLine: lines[0], challenge: lines.slice(1).join(' ') };
    // One usable line back: it is the challenge, and the call-out is canned.
    if (lines.length === 1) {
      return { hostLine: cannedCallOut(playerName), challenge: lines[0] };
    }
  }

  return { hostLine: cannedCallOut(playerName), challenge: fallbackChallenge(category) };
}

/**
 * The line used when the model is unreachable.
 *
 * One line, repeated, is what "the host keeps saying the same thing" sounds
 * like. A handful still cost nothing, and each one at least sounds like it is
 * talking to somebody.
 */
const CALL_OUTS: ((name: string) => string)[] = [
  (n) => `${n}, the room chose you. Nobody here is sorry about it.`,
  (n) => `Spotlight's on ${n}. Try to look like you meant to be here.`,
  (n) => `${n}. Yes, you. Take the mic before it takes you.`,
  (n) => `Somebody has to go, and it is ${n}. Congratulations, I suppose.`,
  (n) => `${n}, I have a question, and you have nowhere to hide.`,
];

export function cannedCallOut(name: string): string {
  return CALL_OUTS[Math.floor(Math.random() * CALL_OUTS.length)](name);
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
