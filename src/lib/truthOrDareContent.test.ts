import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRUTH_OR_DARE_SETTINGS,
  TRUTH_OR_DARE_CATEGORIES,
  TRUTH_OR_DARE_PROMPTS,
  isSpicyCategory,
  pickTruthOrDarePrompt,
} from './truthOrDareContent';

describe('TRUTH_OR_DARE_PROMPTS', () => {
  it('has unique ids', () => {
    const ids = TRUTH_OR_DARE_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers both truth and dare for every category', () => {
    for (const category of TRUTH_OR_DARE_CATEGORIES) {
      const truths = TRUTH_OR_DARE_PROMPTS.filter((p) => p.type === 'truth' && p.category === category.id);
      const dares = TRUTH_OR_DARE_PROMPTS.filter((p) => p.type === 'dare' && p.category === category.id);
      expect(truths.length, `${category.id} truths`).toBeGreaterThan(0);
      expect(dares.length, `${category.id} dares`).toBeGreaterThan(0);
    }
  });
});

describe('isSpicyCategory', () => {
  it('flags only the spicy category', () => {
    expect(isSpicyCategory('spicy')).toBe(true);
    expect(isSpicyCategory('confessions')).toBe(false);
  });
});

describe('pickTruthOrDarePrompt', () => {
  it('never returns a spicy prompt when spicy is disabled, even if requested', () => {
    for (let i = 0; i < 40; i++) {
      const prompt = pickTruthOrDarePrompt('truth', ['spicy'], false, []);
      expect(prompt).toBeNull();
    }
  });

  it('returns a spicy prompt once spicy is enabled', () => {
    const prompt = pickTruthOrDarePrompt('dare', ['spicy'], true, []);
    expect(prompt?.category).toBe('spicy');
  });

  it('avoids repeating a used prompt while alternatives remain', () => {
    const category = DEFAULT_TRUTH_OR_DARE_SETTINGS.categories;
    const first = pickTruthOrDarePrompt('truth', category, false, []);
    expect(first).not.toBeNull();
    const used = [first!.id];
    for (let i = 0; i < 20; i++) {
      const next = pickTruthOrDarePrompt('truth', category, false, used);
      expect(next?.id).not.toBe(first!.id);
    }
  });

  it('recycles the pool instead of stalling once everything has been used', () => {
    const allTruthIds = TRUTH_OR_DARE_PROMPTS.filter(
      (p) => p.type === 'truth' && p.category === 'confessions'
    ).map((p) => p.id);
    const prompt = pickTruthOrDarePrompt('truth', ['confessions'], false, allTruthIds);
    expect(prompt).not.toBeNull();
  });

  it('returns null for a type/category combination with nothing to draw from', () => {
    expect(pickTruthOrDarePrompt('truth', [], false, [])).toBeNull();
  });
});
