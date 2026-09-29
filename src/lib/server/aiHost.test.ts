import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askHost, cannedCallOut, generateChallenge, hostInstructions, HOST_SYSTEM_PROMPT, judgeAnswer, resolveProvider } from './aiHost';
import { CHALLENGE_STYLES } from '../challengeStyles';

const ENV_KEYS = ['GEMINI_API_KEY', 'XAI_API_KEY', 'XAI_MODEL', 'AI_HOST_PROVIDER'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(handler: (url: string, init: any) => { ok: boolean; status?: number; json: unknown }) {
  const calls: { url: string; init: any }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    calls.push({ url, init });
    const res = handler(url, init);
    return { ok: res.ok, status: res.status ?? (res.ok ? 200 : 500), json: async () => res.json };
  });
  return calls;
}

const geminiReply = (text: string) => ({ ok: true, json: { candidates: [{ content: { parts: [{ text }] } }] } });
const grokReply = (text: string) => ({ ok: true, json: { choices: [{ message: { content: text } }] } });

describe('the host’s instructions', () => {
  it('tells the host to roast what happened and never to congratulate a no-show', () => {
    expect(HOST_SYSTEM_PROMPT).toContain('never congratulated');
    // The old prompt forbade insulting anybody, which made a roast impossible.
    expect(HOST_SYSTEM_PROMPT).not.toMatch(/never insult/i);
    // The roast has a floor: who somebody is stays off limits.
    expect(HOST_SYSTEM_PROMPT).toMatch(/never who someone is/i);
  });

  it('carries the room’s vibe', () => {
    expect(hostInstructions('roast_room')).toContain('signed up to be roasted');
    expect(hostInstructions('getting_to_know')).toContain('getting to know each other');
  });

  it('adds mild mode only for rooms with strangers in them', () => {
    expect(hostInstructions('roast_room')).not.toContain('MILD MODE');
    expect(hostInstructions('roast_room', { strangers: true })).toContain('MILD MODE');
  });

  it('gives the host the facts it was handed, and nothing when there are none', () => {
    expect(hostInstructions('classic_party', { facts: 'Ada: 1 life, 40 pts' })).toContain('Ada: 1 life, 40 pts');
    expect(hostInstructions('classic_party', { facts: '   ' })).not.toContain('WHAT YOU KNOW');
  });
});

describe('which model speaks', () => {
  it('is Gemini unless a vibe asks for Grok and there is a key to use', () => {
    expect(resolveProvider('classic_party')).toBe('gemini');
    expect(resolveProvider('roast_room')).toBe('gemini');

    process.env.XAI_API_KEY = 'xai-test';
    expect(resolveProvider('roast_room')).toBe('grok');
    expect(resolveProvider('classic_party')).toBe('gemini');
  });

  it('never uses Grok for a room with strangers in it', () => {
    process.env.XAI_API_KEY = 'xai-test';
    process.env.AI_HOST_PROVIDER = 'grok';
    expect(resolveProvider('roast_room', true)).toBe('gemini');
  });

  it('can be switched on, or off, for every vibe at once', () => {
    process.env.XAI_API_KEY = 'xai-test';
    process.env.AI_HOST_PROVIDER = 'grok';
    expect(resolveProvider('classic_party')).toBe('grok');

    process.env.AI_HOST_PROVIDER = 'gemini';
    expect(resolveProvider('roast_room')).toBe('gemini');
  });
});

describe('asking the host', () => {
  it('returns nothing, and calls nothing, when no key is configured', async () => {
    const calls = stubFetch(() => geminiReply('unused'));
    expect(await askHost('classic_party', 'say hi')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('sends Gemini the persona as a system instruction, with thinking off', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    const calls = stubFetch(() => geminiReply('A line.'));

    expect(await askHost('classic_party', 'roast Ada')).toBe('A line.');

    const body = JSON.parse(calls[0].init.body);
    expect(calls[0].url).toContain('generativelanguage.googleapis.com');
    expect(body.systemInstruction.parts[0].text).toContain('ROOM VIBE');
    expect(body.contents[0].parts[0].text).toBe('roast Ada');
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
    expect(calls[0].init.signal).toBeDefined();
  });

  it('asks Grok for a Roast Room when a key is set, on the default model', async () => {
    process.env.XAI_API_KEY = 'xai-test';
    const calls = stubFetch(() => grokReply('Savage.'));

    expect(await askHost('roast_room', 'roast Ada')).toBe('Savage.');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.x.ai/v1/chat/completions');
    expect(calls[0].init.headers.Authorization).toBe('Bearer xai-test');
    const body = JSON.parse(calls[0].init.body);
    expect(body.model).toBe('grok-4-fast-non-reasoning');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'roast Ada' });
  });

  it('lets the model be chosen without a deploy', async () => {
    process.env.XAI_API_KEY = 'xai-test';
    process.env.XAI_MODEL = 'grok-4';
    const calls = stubFetch(() => grokReply('Savage.'));
    await askHost('roast_room', 'roast Ada');
    expect(JSON.parse(calls[0].init.body).model).toBe('grok-4');
  });

  it('falls back to Gemini when Grok fails, so a bad model name costs a joke and not the round', async () => {
    process.env.XAI_API_KEY = 'xai-test';
    process.env.GEMINI_API_KEY = 'g-test';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls = stubFetch((url) =>
      url.includes('x.ai') ? { ok: false, status: 404, json: {} } : geminiReply('Backup line.')
    );

    expect(await askHost('roast_room', 'roast Ada')).toBe('Backup line.');
    expect(calls.map((c) => (c.url.includes('x.ai') ? 'grok' : 'gemini'))).toEqual(['grok', 'gemini']);
  });

  it('keeps a stranger room on Gemini even when Grok is set up', async () => {
    process.env.XAI_API_KEY = 'xai-test';
    process.env.GEMINI_API_KEY = 'g-test';
    const calls = stubFetch(() => geminiReply('Polite.'));

    expect(await askHost('roast_room', 'roast Ada', { strangers: true })).toBe('Polite.');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('generativelanguage');
    expect(JSON.parse(calls[0].init.body).systemInstruction.parts[0].text).toContain('MILD MODE');
  });
});

describe('the canned call-out', () => {
  it('names the player and does not always say the same thing', () => {
    const lines = new Set<string>();
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      const line = cannedCallOut('Ada');
      expect(line).toContain('Ada');
      lines.add(line);
    }
    expect(lines.size).toBe(5);
  });
});

describe('ruling on an answer', () => {
  const input = { playerName: 'Ada', challenge: 'Defend jollof.', answer: 'Jollof is overrated because it is always smoky.', livesLeft: 2 };

  it('passes or fails them, with the line said about it', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    stubFetch(() => geminiReply('{"pass": true, "line": "Smoky is a strong word. Fine, you survive."}'));

    expect(await judgeAnswer('classic_party', input)).toEqual({ pass: true, line: 'Smoky is a strong word. Fine, you survive.' });
  });

  it('reads a failure as a failure', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    stubFetch(() => geminiReply('{"pass": false, "line": "That was not a defence, that was a shrug."}'));

    expect((await judgeAnswer('classic_party', input))?.pass).toBe(false);
  });

  it('copes with the model wrapping its JSON in a fence and a sentence', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    stubFetch(() => geminiReply(['Sure!', '```json', '{"pass": true, "line": "Fine."}', '```'].join(String.fromCharCode(10))));

    expect(await judgeAnswer('classic_party', input)).toEqual({ pass: true, line: 'Fine.' });
  });

  it('returns nothing when the reply is not a ruling, so the room’s vote decides instead', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    for (const reply of ['I think they did well!', '{"pass": "yes", "line": "x"}', '{"pass": true}', '{"pass": true, "line": ""}', '{not json}']) {
      stubFetch(() => geminiReply(reply));
      expect(await judgeAnswer('classic_party', input)).toBeNull();
    }
  });

  it('returns nothing with no key, or when the model is down', async () => {
    stubFetch(() => geminiReply('{"pass": true, "line": "x"}'));
    expect(await judgeAnswer('classic_party', input)).toBeNull();

    process.env.GEMINI_API_KEY = 'g-test';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch(() => ({ ok: false, status: 500, json: {} }));
    expect(await judgeAnswer('classic_party', input)).toBeNull();
  });

  it('shows the model what was actually said, and the challenge it was said to', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    const calls = stubFetch(() => geminiReply('{"pass": true, "line": "x"}'));
    await judgeAnswer('classic_party', input);

    const task = JSON.parse(calls[0].init.body).contents[0].parts[0].text;
    expect(task).toContain('Defend jollof.');
    expect(task).toContain('always smoky');
    expect(task).toContain('Ada');
    expect(task).toContain('2 lives');
  });

  it('rules steadily rather than jokingly', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    const calls = stubFetch(() => geminiReply('{"pass": true, "line": "x"}'));
    await judgeAnswer('classic_party', input);
    expect(JSON.parse(calls[0].init.body).generationConfig.temperature).toBeLessThan(0.8);
  });

  it('tells the model not to fail a bad transcription, and warns on the last life', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    const calls = stubFetch(() => geminiReply('{"pass": true, "line": "x"}'));
    await judgeAnswer('classic_party', { ...input, livesLeft: 1 });
    const task = JSON.parse(calls[0].init.body).contents[0].parts[0].text;
    expect(task).toMatch(/never fail someone over garbled/i);
    expect(task).toContain('last life');
  });

  it('carries the host’s leaning', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    const calls = stubFetch(() => geminiReply('{"pass": true, "line": "x"}'));
    await judgeAnswer('classic_party', { ...input, leaning: 'hard' });
    expect(JSON.parse(calls[0].init.body).contents[0].parts[0].text).toContain('have it in for this player');
  });
});

describe('a challenge in the room’s own style', () => {
  it('tells the model what kind of thing to ask', async () => {
    process.env.GEMINI_API_KEY = 'g-test';
    const calls = stubFetch(() => geminiReply(['Ada, court is in session.', 'Ada, your friend’s ex texts you. Rule on it.'].join(String.fromCharCode(10))));
    const style = CHALLENGE_STYLES.bros_hangout.find((s) => s.id === 'bro_code')!;

    const result = await generateChallenge('bros_hangout', 'truth', 'Ada', {}, style, ['Ben']);

    expect(JSON.parse(calls[0].init.body).contents[0].parts[0].text).toContain('bro-code dilemma');
    expect(result.challenge).toContain('ex texts you');
  });

  it('falls back to that style’s own line, not a generic one, when the model is down', async () => {
    const style = CHALLENGE_STYLES.anime_squad.find((s) => s.id === 'tier_list')!;

    const result = await generateChallenge('anime_squad', 'dare', 'Ada', {}, style, ['Ben']);

    expect(style.fallbacks.map((f) => f.replace('{name}', 'Ada'))).toContain(result.challenge);
  });
});
