import { describe, expect, it } from 'vitest';
import { playerText } from './roomServer';

/**
 * The cap exists because a room is one Firestore document and Firestore
 * rejects anything over 1 MiB. An unbounded string in a story round does not
 * fail for whoever sent it — it fails every subsequent write to that room, so
 * the other five players lose the match.
 */
describe('playerText', () => {
  it('keeps ordinary input untouched', () => {
    expect(playerText('Chibuike', 24)).toBe('Chibuike');
    expect(playerText('Nigerian Jollof sweet pass Ghana Jollof', 80)).toBe(
      'Nigerian Jollof sweet pass Ghana Jollof',
    );
  });

  it('caps anything long enough to threaten the document limit', () => {
    const essay = 'a'.repeat(2_000_000);
    expect(playerText(essay, 240)).toHaveLength(240);
  });

  it('trims first, so padding cannot smuggle past the cap', () => {
    expect(playerText('   Tunde   ', 24)).toBe('Tunde');
    // 30 spaces then 30 characters: trimming has to happen before the slice,
    // or the cap spends itself on whitespace and truncates real text.
    expect(playerText(' '.repeat(30) + 'b'.repeat(30), 10)).toBe('b'.repeat(10));
  });

  it('turns nothing into an empty string rather than "undefined"', () => {
    expect(playerText(undefined, 24)).toBe('');
    expect(playerText(null, 24)).toBe('');
  });

  it('coerces whatever a client actually sent', () => {
    // The body is JSON from a browser, so a field typed as a string arrives as
    // whatever the sender felt like putting there.
    expect(playerText(12345, 24)).toBe('12345');
    expect(playerText({ nope: true }, 24)).toBe('[object Object]');
  });
});
