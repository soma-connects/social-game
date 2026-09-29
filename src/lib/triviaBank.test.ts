import { describe, expect, it } from 'vitest';
import { TRIVIA_BANK, TRIVIA_HISTORY_WINDOW, acceptedAnswers, pickTriviaQuestion, rememberTrivia } from './triviaBank';

/**
 * Rules every question in the bank must follow.
 *
 * Trivia here is spoken into a phone and graded by the room route, which
 * lowercases both sides, turns anything but a-z and 0-9 into spaces, and counts
 * an answer when it appears as a whole word in what was said. Each rule below
 * is a way a question can look fine on the page and still be unplayable.
 */

/** Exactly what the grader in route.ts does to both sides. */
const norm = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const NUMBER_WORDS = new Set(
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand'.split(' ')
);

describe('the trivia bank', () => {
  it('has unique ids', () => {
    const ids = TRIVIA_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never asks the same question twice', () => {
    // Two copies of one question is a bigger bank that plays like a smaller one.
    const seen = new Map<string, string>();
    for (const q of TRIVIA_BANK) {
      const key = norm(q.question);
      expect(seen.get(key), `${q.id} repeats ${seen.get(key)}`).toBeUndefined();
      seen.set(key, q.id);
    }
  });

  it('keeps answers short enough to say and to match', () => {
    for (const q of TRIVIA_BANK) {
      expect(norm(q.answer).split(' ').length, q.id).toBeLessThanOrEqual(4);
    }
  });

  it('never reads out its own answer', () => {
    // If the answer is spoken inside the question, anyone can win by repeating
    // a word they just heard.
    for (const q of TRIVIA_BANK) {
      const question = norm(q.question);
      for (const form of acceptedAnswers(q)) {
        const f = norm(form);
        if (f.length <= 2) continue;
        expect(new RegExp(`\\b${f}\\b`).test(question), `${q.id} gives away "${form}"`).toBe(false);
      }
    }
  });

  it('gives every number answer a form a phone might say instead', () => {
    // One recogniser hands back "1960", the next "nineteen sixty".
    for (const q of TRIVIA_BANK) {
      const forms = acceptedAnswers(q).map(norm);
      const answer = norm(q.answer);
      if (/^\d+$/.test(answer)) {
        const spoken = forms.some((f) => f.split(' ').some((w) => NUMBER_WORDS.has(w)));
        expect(spoken, `${q.id} (${q.answer}) needs a spoken form`).toBe(true);
      }
      if (answer.split(' ').every((w) => NUMBER_WORDS.has(w))) {
        expect(forms.some((f) => /\d/.test(f)), `${q.id} (${q.answer}) needs a digit form`).toBe(true);
      }
    }
  });

  it('writes every accepted form in plain letters the grader keeps', () => {
    // The grader turns "é" into a space, so an accented form can never match.
    for (const q of TRIVIA_BANK) {
      for (const form of acceptedAnswers(q)) {
        expect(/^[\x20-\x7e]*$/.test(form), `${q.id}: "${form}"`).toBe(true);
      }
    }
  });

  it('does not offer the choices in the question', () => {
    // "Is it X or Y?" lets someone say both and score on whichever was right.
    for (const q of TRIVIA_BANK) {
      expect(/\bor\b/i.test(q.question), q.id).toBe(false);
    }
  });

  it('is big enough that a friend group is not hearing repeats', () => {
    expect(TRIVIA_BANK.length).toBeGreaterThanOrEqual(300);
    // Well past the repeat window, or the "unseen" pool runs dry within a night.
    expect(TRIVIA_BANK.length).toBeGreaterThan(TRIVIA_HISTORY_WINDOW * 5);
    const naija = TRIVIA_BANK.filter((q) => q.category === 'nigeria').length;
    expect(naija / TRIVIA_BANK.length).toBeGreaterThan(0.3);
  });
});

describe('pickTriviaQuestion', () => {
  it('does not repeat anything inside the history window', () => {
    let recent: string[] = [];
    for (let i = 0; i < TRIVIA_HISTORY_WINDOW; i++) {
      const q = pickTriviaQuestion(recent);
      expect(recent).not.toContain(q.id);
      recent = rememberTrivia(recent, q.id);
    }
  });

  it('keeps to the categories asked for', () => {
    for (let i = 0; i < 30; i++) {
      expect(pickTriviaQuestion([], ['nigeria']).category).toBe('nigeria');
    }
  });
});
