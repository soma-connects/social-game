import { describe, expect, it } from 'vitest';
import { gradeSpokenAnswer } from './triviaGrade';

const grade = (spoken: string, ...accepted: string[]) => gradeSpokenAnswer(spoken, accepted);

describe('an answer said exactly', () => {
  it('is right, whatever the case or punctuation', () => {
    expect(grade('Lagos', 'lagos')).toMatchObject({ correct: true, how: 'exact' });
    expect(grade('  LAGOS!  ', 'Lagos')).toMatchObject({ correct: true });
  });

  it('is right inside a sentence, as whole words', () => {
    expect(grade("uh, I think it's Lagos", 'lagos')).toMatchObject({ correct: true, how: 'contains' });
  });

  it('accepts any of the forms it was given', () => {
    expect(grade('1960', 'nineteen sixty', '1960').correct).toBe(true);
    expect(grade('nineteen sixty', 'nineteen sixty', '1960').correct).toBe(true);
  });

  it('ignores accents on either side', () => {
    expect(grade('Lomé', 'lome').correct).toBe(true);
  });
});

describe('an accent the recogniser only half caught', () => {
  it('counts a near miss of a name', () => {
    expect(grade('Legos', 'lagos')).toMatchObject({ correct: true, how: 'close' });
    expect(grade('Abuza', 'abuja').correct).toBe(true);
    expect(grade('Ibadam', 'ibadan').correct).toBe(true);
  });

  it('counts a near miss buried in a sentence', () => {
    expect(grade("I'd say the capital is Abuza", 'abuja').correct).toBe(true);
  });

  it('gives a long name room for two slips', () => {
    expect(grade('Naijeria', 'nigeria').correct).toBe(true);
  });

  it('counts a near miss of a two-word answer', () => {
    expect(grade('Mount Kilimanjaro', 'mount kilimanjaro').correct).toBe(true);
    expect(grade('Mount Kilimanjero', 'mount kilimanjaro').correct).toBe(true);
  });
});

describe('an answer that is simply different', () => {
  it('is wrong when it names another place', () => {
    expect(grade('Kenya', 'kano').correct).toBe(false);
    expect(grade('Niger', 'nigeria').correct).toBe(false);
    expect(grade('Lagoon', 'lagos').correct).toBe(false);
    expect(grade('Peru', 'paris').correct).toBe(false);
    expect(grade('Malawi', 'mali').correct).toBe(false);
  });

  it('is wrong when the first letter differs, since an accent rarely moves it', () => {
    expect(grade('Bagos', 'lagos').correct).toBe(false);
  });

  it('gives short words no room at all', () => {
    expect(grade('oat', 'oil').correct).toBe(false);
    expect(grade('cat', 'car').correct).toBe(false);
  });

  it('is wrong for saying nothing', () => {
    expect(grade('', 'lagos')).toEqual({ correct: false });
    expect(grade('   ', 'lagos')).toEqual({ correct: false });
    expect(grade('...', 'lagos')).toEqual({ correct: false });
  });

  it('is not fooled by a lone letter that appears in the answer', () => {
    // Testing containment the other way round made "a" a right answer to anything with an A.
    expect(grade('a', 'lagos').correct).toBe(false);
  });

  it('is wrong when there is nothing to compare with', () => {
    expect(grade('Lagos').correct).toBe(false);
    expect(grade('Lagos', '', '  ').correct).toBe(false);
  });
});
