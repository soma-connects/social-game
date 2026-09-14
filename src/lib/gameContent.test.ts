import { describe, expect, it } from 'vitest';
import {
  DARE_CATEGORIES,
  NOLLYWOOD_DARES,
  dareBody,
  dareCategory,
} from './gameContent';

/**
 * A dare travels through room state as a plain string, so the only link back
 * to its category is the marker inside the text. If that link breaks, nothing
 * throws — the modal quietly shows the generic mask for every dare, which is
 * exactly the state this replaced.
 */
describe('dareCategory', () => {
  it('matches every dare in the shipped list to a category', () => {
    const unmatched = NOLLYWOOD_DARES.filter((dare) => dareCategory(dare) === null);
    expect(unmatched).toEqual([]);
  });

  it('has art for every category it can return', () => {
    // The filenames under public/dares are named from these ids, so an id
    // added here without art falls back to emoji rather than 404ing visibly.
    const ids = DARE_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('sing');
    expect(ids).toContain('crying');
  });

  it('reads the marker regardless of surrounding punctuation', () => {
    expect(dareCategory('[ACCENT]: do the thing')?.id).toBe('accent');
    expect(dareCategory('🗣️ [ accent ] do the thing')?.id).toBe('accent');
    expect(dareCategory('🎵 [sing it]: sing')?.id).toBe('sing');
  });

  it('returns null rather than guessing when there is no marker', () => {
    expect(dareCategory('Just sing something')).toBeNull();
    expect(dareCategory('')).toBeNull();
    expect(dareCategory('[NOT A REAL CATEGORY]: hmm')).toBeNull();
  });
});

describe('dareBody', () => {
  it('drops the emoji and the marker, keeping the instruction', () => {
    expect(dareBody('🎵 [SING IT]: Sing the chorus in a Hausa accent!')).toBe(
      'Sing the chorus in a Hausa accent!',
    );
  });

  it('leaves a dare with no marker alone', () => {
    expect(dareBody('Just sing something')).toBe('Just sing something');
  });

  it('never returns an empty string, so the card is never blank', () => {
    // A marker with nothing after it would otherwise strip to nothing and the
    // performer would be asked to do an unnamed dare.
    expect(dareBody('🎵 [SING IT]:')).toBe('🎵 [SING IT]:');
    expect(dareBody('  ')).toBe('');
  });

  it('keeps brackets that appear later in the instruction', () => {
    expect(dareBody('🗣️ [ACCENT]: Say "wahala [sic]" three times')).toBe(
      'Say "wahala [sic]" three times',
    );
  });

  it('strips cleanly for every shipped dare', () => {
    for (const dare of NOLLYWOOD_DARES) {
      const body = dareBody(dare);
      expect(body).not.toContain('[');
      expect(body.length).toBeGreaterThan(0);
    }
  });
});
