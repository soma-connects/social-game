import { afterEach, describe, expect, it, vi } from 'vitest';
import { fallbackLine, hostFacts, rememberHostLine, spokenAnswer, type LineKind } from './aiMasterLines';
import type { AiMasterState, Player } from './types';

afterEach(() => vi.restoreAllMocks());

const players = [
  { id: 'a', name: 'Ada', score: 40, lives: 1 },
  { id: 'b', name: 'Ben', score: 220, lives: 3 },
  { id: 'c', name: 'Cy', score: 0, lives: 0, eliminated: true },
] as Player[];

const state = (over: Partial<AiMasterState> = {}) => ({ round: 4, ...over }) as AiMasterState;

describe('what the host is told', () => {
  it('names each player with their lives and points, so a joke can be about them', () => {
    const facts = hostFacts(players, state());
    expect(facts).toContain('round 4');
    expect(facts).toContain('Ada: 1 of 3 lives, 40 points');
    expect(facts).toContain('Ben: 3 of 3 lives, 220 points');
    expect(facts).toContain('Cy: OUT of the game');
  });

  it('shows the host’s bias, but only for players still in', () => {
    const facts = hostFacts(players, state({ grudgeId: 'a', favorId: 'c' }));
    expect(facts).toContain('you have it in for them');
    // Cy is the pet, but Cy is out: there is nothing to be soft on.
    expect(facts).not.toContain('you are soft on them');
  });

  it('includes what the caller adds, such as who paid for this round', () => {
    expect(hostFacts(players, state(), ['Ben paid 120 points to pick Ada.'])).toContain('Ben paid 120 points to pick Ada.');
  });

  it('warns the host off its own recent lines, and off nothing when it has none', () => {
    expect(hostFacts(players, state())).not.toContain('last few lines');
    const facts = hostFacts(players, state({ hostHistory: ['Line one.', 'Line two.'] }));
    expect(facts).toContain('"Line one." / "Line two."');
    expect(facts).toContain('Do not reuse');
  });
});

describe('remembering what was said', () => {
  it('keeps only the last few lines', () => {
    const s = state();
    for (let i = 1; i <= 8; i++) rememberHostLine(s, `line ${i}`);
    expect(s.hostHistory).toEqual(['line 4', 'line 5', 'line 6', 'line 7', 'line 8']);
  });

  it('ignores an empty line', () => {
    const s = state();
    rememberHostLine(s, '   ');
    rememberHostLine(s, undefined);
    expect(s.hostHistory).toBeUndefined();
  });
});

describe('what counts as an answer', () => {
  it('treats the client’s placeholder for silence as no answer', () => {
    expect(spokenAnswer('(said nothing)')).toBe('');
    expect(spokenAnswer('   ')).toBe('');
    expect(spokenAnswer(undefined)).toBe('');
  });

  it('keeps real words', () => {
    expect(spokenAnswer('  I ate the last jollof ')).toBe('I ate the last jollof');
  });
});

describe('the fallback lines', () => {
  const kinds: LineKind[] = ['survived', 'bombed', 'dodged', 'eliminated', 'skipped', 'redirected', 'spotlight', 'life'];

  it('always talk about somebody, whichever way the round went', () => {
    for (const kind of kinds) expect(fallbackLine(kind, 'Ada')).toContain('Ada');
  });

  it('never congratulate a player who dodged', () => {
    for (const r of [0, 0.4, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      expect(fallbackLine('dodged', 'Ada')).not.toMatch(/congrat|well done|great job|nice one/i);
    }
  });

  it('does not always say the same thing', () => {
    const seen = new Set<string>();
    for (const r of [0, 0.5, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      seen.add(fallbackLine('survived', 'Ada'));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
