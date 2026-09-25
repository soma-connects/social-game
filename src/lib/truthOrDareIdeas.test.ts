import { describe, expect, it } from 'vitest';
import {
  StoredTruthOrDareIdea,
  TRUTH_OR_DARE_IDEAS_PER_TYPE,
  TRUTH_OR_DARE_IDEA_MAX_CHARS,
  addIdea,
  cleanIdeaText,
  countIdeas,
  ideasBy,
  removeIdea,
  withoutAuthors,
} from './truthOrDareIdeas';

/** Ids that count up, so a test can say which idea it means. */
function counter() {
  let n = 0;
  return () => `idea_${++n}`;
}

function poolOf(...items: [author: string, type: 'truth' | 'dare', text: string][]): StoredTruthOrDareIdea[] {
  const id = counter();
  return items.map(([authorId, type, text]) => ({ id: id(), type, text, authorId }));
}

describe('cleanIdeaText', () => {
  it('trims, and folds every run of whitespace — newlines included — into one space', () => {
    expect(cleanIdeaText('  what is\n\n your   worst\thabit?  ')).toBe('what is your worst habit?');
  });

  it('caps the length', () => {
    expect(cleanIdeaText('x'.repeat(1000))).toHaveLength(TRUTH_OR_DARE_IDEA_MAX_CHARS);
  });

  it('survives things that are not strings', () => {
    expect(cleanIdeaText(undefined)).toBe('');
    expect(cleanIdeaText(null)).toBe('');
    expect(cleanIdeaText(42)).toBe('42');
  });
});

describe('addIdea', () => {
  it('stores an idea against its author, and hands back only the idea', () => {
    const result = addIdea([], 'ada', 'truth', 'What is your worst habit?', counter());
    expect(result.status).toBe('added');
    if (result.status !== 'added') return;

    expect(result.pool).toEqual([
      { id: 'idea_1', type: 'truth', text: 'What is your worst habit?', authorId: 'ada' },
    ]);
    expect(result.idea).toEqual({ id: 'idea_1', type: 'truth', text: 'What is your worst habit?' });
    expect(result.idea).not.toHaveProperty('authorId');
  });

  it('does not touch the pool it was given', () => {
    const pool = poolOf(['ada', 'truth', 'Something that happened once']);
    const before = JSON.stringify(pool);
    addIdea(pool, 'ada', 'dare', 'Do a silly walk', counter());
    expect(JSON.stringify(pool)).toBe(before);
  });

  it('refuses anything that is not a truth or a dare', () => {
    for (const type of ['confession', '', undefined, null, 7]) {
      const result = addIdea([], 'ada', type, 'A perfectly good idea', counter());
      expect(result.status, String(type)).toBe('refused');
    }
  });

  it('says different things about an empty idea and one that is merely short', () => {
    const empty = addIdea([], 'ada', 'truth', '   \n ', counter());
    const short = addIdea([], 'ada', 'truth', 'hi', counter());
    expect(empty.status).toBe('refused');
    expect(short.status).toBe('refused');
    if (empty.status !== 'refused' || short.status !== 'refused') return;
    expect(empty.error).not.toBe(short.error);
  });

  it('cleans the text it stores', () => {
    const result = addIdea([], 'ada', 'dare', '  Sing   the\nchorus  ', counter());
    expect(result.status === 'added' && result.idea.text).toBe('Sing the chorus');
  });

  it('treats saying the same thing twice as a success that changes nothing', () => {
    // Room actions are replayed when two writes collide. An add that failed on
    // its own replay would report a failure for something that had worked.
    const first = addIdea([], 'ada', 'truth', 'What is your worst habit?', counter());
    if (first.status !== 'added') throw new Error('setup');

    const again = addIdea(first.pool, 'ada', 'truth', '  WHAT is your worst HABIT?  ', counter());
    expect(again.status).toBe('added');
    if (again.status !== 'added') return;
    expect(again.pool).toHaveLength(1);
    expect(again.idea.id).toBe(first.idea.id);
  });

  it('lets the same words be a truth and a dare, and lets two people say the same thing', () => {
    const id = counter();
    let pool: StoredTruthOrDareIdea[] = [];
    for (const [author, type] of [
      ['ada', 'truth'],
      ['ada', 'dare'],
      ['bo', 'truth'],
    ] as const) {
      const result = addIdea(pool, author, type, 'Tell us something true', id);
      if (result.status !== 'added') throw new Error(result.error);
      pool = result.pool;
    }
    expect(pool).toHaveLength(3);
  });

  it('stops one player being the whole deck, per kind', () => {
    const id = counter();
    let pool: StoredTruthOrDareIdea[] = [];
    for (let i = 0; i < TRUTH_OR_DARE_IDEAS_PER_TYPE; i++) {
      const result = addIdea(pool, 'ada', 'truth', `Truth number ${i} for the room`, id);
      if (result.status !== 'added') throw new Error(result.error);
      pool = result.pool;
    }

    const over = addIdea(pool, 'ada', 'truth', 'One truth too many', id);
    expect(over.status).toBe('refused');
    if (over.status === 'refused') expect(over.error).toMatch(/remove one/i);

    // Truths are full; dares and other players are not.
    expect(addIdea(pool, 'ada', 'dare', 'A dare is still welcome', id).status).toBe('added');
    expect(addIdea(pool, 'bo', 'truth', 'Bo has not written any yet', id).status).toBe('added');
  });
});

describe('removeIdea', () => {
  it('removes your own idea', () => {
    const pool = poolOf(['ada', 'truth', 'Something about ada'], ['bo', 'truth', 'Something about bo']);
    const next = removeIdea(pool, 'ada', 'idea_1');
    expect(next.map((i) => i.id)).toEqual(['idea_2']);
  });

  it("leaves somebody else's idea alone, and says nothing about it", () => {
    const pool = poolOf(['ada', 'truth', 'Something about ada']);
    expect(removeIdea(pool, 'bo', 'idea_1')).toEqual(pool);
  });

  it('is a no-op for an id that is not there', () => {
    const pool = poolOf(['ada', 'truth', 'Something about ada']);
    expect(removeIdea(pool, 'ada', 'idea_99')).toEqual(pool);
    expect(removeIdea(pool, 'ada', undefined)).toEqual(pool);
  });
});

describe('what each reader may see', () => {
  const pool = poolOf(
    ['ada', 'truth', 'Ada wrote this truth'],
    ['bo', 'dare', 'Bo wrote this dare'],
    ['ada', 'dare', 'Ada wrote this dare']
  );

  it('shows an author their own ideas, in the order they wrote them, without an author field', () => {
    const mine = ideasBy(pool, 'ada');
    expect(mine.map((i) => i.text)).toEqual(['Ada wrote this truth', 'Ada wrote this dare']);
    for (const idea of mine) expect(idea).not.toHaveProperty('authorId');
  });

  it('shows somebody who wrote nothing an empty list', () => {
    expect(ideasBy(pool, 'cy')).toEqual([]);
  });

  it('takes the authors off the whole pool for the draw', () => {
    const drawn = withoutAuthors(pool);
    expect(drawn).toHaveLength(3);
    for (const idea of drawn) expect(idea).not.toHaveProperty('authorId');
  });

  it('tells the room how many there are, and nothing else', () => {
    expect(countIdeas(pool)).toEqual({ truth: 1, dare: 2 });
    expect(countIdeas([])).toEqual({ truth: 0, dare: 0 });
  });
});
