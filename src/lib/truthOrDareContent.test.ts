import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRUTH_OR_DARE_SETTINGS,
  TRUTH_OR_DARE_CATEGORIES,
  TRUTH_OR_DARE_PROMPTS,
  isSpicyCategory,
  isTruthOrDarePromptSource,
  normalizeTruthOrDareSettings,
  pickTruthOrDarePrompt,
} from './truthOrDareContent';
import type { TruthOrDareIdea, TruthOrDareSettings } from './types';

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

describe('isSpicyCategory and an idea a player wrote', () => {
  it('has no opinion about something with no category', () => {
    expect(isSpicyCategory(null)).toBe(false);
    expect(isSpicyCategory(undefined)).toBe(false);
  });
});

describe('normalizeTruthOrDareSettings', () => {
  it('hands back the defaults when there are no settings yet', () => {
    expect(normalizeTruthOrDareSettings(undefined)).toEqual(DEFAULT_TRUTH_OR_DARE_SETTINGS);
    expect(normalizeTruthOrDareSettings(null)).toEqual(DEFAULT_TRUTH_OR_DARE_SETTINGS);
  });

  it('reads a room saved before prompt sources existed as the default source, not as off', () => {
    const saved: TruthOrDareSettings = {
      categories: ['silly'],
      spicyEnabled: true,
      selectionModes: ['card'],
    };
    expect(normalizeTruthOrDareSettings(saved)).toEqual({ ...saved, promptSource: 'both' });
  });

  it('keeps a source that was chosen', () => {
    for (const promptSource of ['library', 'players', 'both'] as const) {
      const settings = { ...DEFAULT_TRUTH_OR_DARE_SETTINGS, promptSource };
      expect(normalizeTruthOrDareSettings(settings).promptSource).toBe(promptSource);
    }
  });

  it('does not trust a source it does not know', () => {
    const settings = { ...DEFAULT_TRUTH_OR_DARE_SETTINGS, promptSource: 'everything' } as unknown as TruthOrDareSettings;
    expect(normalizeTruthOrDareSettings(settings).promptSource).toBe('both');
    expect(isTruthOrDarePromptSource('everything')).toBe(false);
    expect(isTruthOrDarePromptSource(undefined)).toBe(false);
  });

  it('will not leave a match with nothing selected to play', () => {
    const settings = { ...DEFAULT_TRUTH_OR_DARE_SETTINGS, categories: [], selectionModes: [] } as TruthOrDareSettings;
    const normalized = normalizeTruthOrDareSettings(settings);
    expect(normalized.categories).toEqual(DEFAULT_TRUTH_OR_DARE_SETTINGS.categories);
    expect(normalized.selectionModes).toEqual(DEFAULT_TRUTH_OR_DARE_SETTINGS.selectionModes);
  });
});

describe('pickTruthOrDarePrompt with the ideas a room wrote', () => {
  const ideas: TruthOrDareIdea[] = [
    { id: 'idea_t1', type: 'truth', text: 'Our own truth one' },
    { id: 'idea_t2', type: 'truth', text: 'Our own truth two' },
    { id: 'idea_d1', type: 'dare', text: 'Our own dare one' },
  ];
  const categories = DEFAULT_TRUTH_OR_DARE_SETTINGS.categories;

  /** Answers from a list, then zeros: enough to pin a coin flip and the index after it. */
  const rolls = (...values: number[]) => {
    const queue = [...values];
    return () => queue.shift() ?? 0;
  };

  it('ignores the ideas unless a source that uses them is asked for', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickTruthOrDarePrompt('truth', categories, false, [], { playerPrompts: ideas })?.origin).toBe('library');
      expect(
        pickTruthOrDarePrompt('truth', categories, false, [], { source: 'library', playerPrompts: ideas })?.origin
      ).toBe('library');
    }
  });

  it('draws only from the room with the players source, and marks it as theirs', () => {
    for (let i = 0; i < 50; i++) {
      const prompt = pickTruthOrDarePrompt('truth', categories, false, [], { source: 'players', playerPrompts: ideas });
      expect(prompt?.origin).toBe('player');
      expect(prompt?.category).toBeNull();
      expect(['idea_t1', 'idea_t2']).toContain(prompt?.id);
    }
  });

  it('only draws a truth for a truth, and a dare for a dare', () => {
    for (let i = 0; i < 30; i++) {
      const prompt = pickTruthOrDarePrompt('dare', categories, false, [], { source: 'players', playerPrompts: ideas });
      expect(prompt?.id).toBe('idea_d1');
    }
  });

  it('does not hold the ideas to the categories or the spicy switch', () => {
    // Nothing in the library qualifies here, and the room's own words still come up.
    const prompt = pickTruthOrDarePrompt('truth', [], false, [], { source: 'players', playerPrompts: ideas });
    expect(prompt?.origin).toBe('player');
  });

  it('serves a fresh idea before repeating one', () => {
    for (let i = 0; i < 30; i++) {
      const prompt = pickTruthOrDarePrompt('truth', categories, false, ['idea_t1'], {
        source: 'players',
        playerPrompts: ideas,
      });
      expect(prompt?.id).toBe('idea_t2');
    }
  });

  it('repeats the room ideas once they are spent, rather than reaching for the deck', () => {
    for (let i = 0; i < 30; i++) {
      const prompt = pickTruthOrDarePrompt('truth', categories, false, ['idea_t1', 'idea_t2'], {
        source: 'players',
        playerPrompts: ideas,
      });
      expect(prompt?.origin).toBe('player');
    }
  });

  it('falls back to the deck when the room wrote none of that kind, so a round cannot stall', () => {
    const onlyTruths = ideas.filter((i) => i.type === 'truth');
    const prompt = pickTruthOrDarePrompt('dare', categories, false, [], { source: 'players', playerPrompts: onlyTruths });
    expect(prompt?.origin).toBe('library');
    expect(prompt?.type).toBe('dare');
  });

  it('falls back to the deck when the room has written nothing at all', () => {
    const prompt = pickTruthOrDarePrompt('truth', categories, false, [], { source: 'players', playerPrompts: [] });
    expect(prompt?.origin).toBe('library');
  });

  it('still returns nothing when there is truly nothing to draw from', () => {
    expect(pickTruthOrDarePrompt('truth', [], false, [], { source: 'players', playerPrompts: [] })).toBeNull();
    expect(pickTruthOrDarePrompt('truth', [], false, [], { source: 'both', playerPrompts: [] })).toBeNull();
  });

  describe('mixing both', () => {
    it('gives the ideas even odds against the deck, not their share of a bigger pool', () => {
      // First roll is the coin, second is the index within whichever deck won.
      const heads = pickTruthOrDarePrompt('truth', categories, false, [], {
        source: 'both',
        playerPrompts: ideas,
        random: rolls(0.1, 0),
      });
      const tails = pickTruthOrDarePrompt('truth', categories, false, [], {
        source: 'both',
        playerPrompts: ideas,
        random: rolls(0.9, 0),
      });
      expect(heads?.origin).toBe('player');
      expect(tails?.origin).toBe('library');
    });

    it('is the deck alone when nobody wrote anything', () => {
      for (let i = 0; i < 30; i++) {
        const prompt = pickTruthOrDarePrompt('truth', categories, false, [], { source: 'both', playerPrompts: [] });
        expect(prompt?.origin).toBe('library');
      }
    });

    it('uses the deck once the fresh ideas are spent', () => {
      for (let i = 0; i < 30; i++) {
        const prompt = pickTruthOrDarePrompt('truth', categories, false, ['idea_t1', 'idea_t2'], {
          source: 'both',
          playerPrompts: ideas,
        });
        expect(prompt?.origin).toBe('library');
      }
    });

    it('uses the ideas when the deck has nothing fresh for these categories', () => {
      for (let i = 0; i < 30; i++) {
        const prompt = pickTruthOrDarePrompt('truth', [], false, [], { source: 'both', playerPrompts: ideas });
        expect(prompt?.origin).toBe('player');
      }
    });

    it('recycles both decks together once everything has been used', () => {
      const everything = [
        ...TRUTH_OR_DARE_PROMPTS.filter((p) => p.type === 'truth').map((p) => p.id),
        'idea_t1',
        'idea_t2',
      ];
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) {
        const prompt = pickTruthOrDarePrompt('truth', categories, false, everything, {
          source: 'both',
          playerPrompts: ideas,
        });
        expect(prompt).not.toBeNull();
        seen.add(prompt!.origin);
      }
      expect(seen).toEqual(new Set(['library', 'player']));
    });
  });
});
