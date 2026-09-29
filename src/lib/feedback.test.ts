import { describe, expect, it } from 'vitest';
import { MAX_FEEDBACK_CHARS, MAX_RECENT_ERRORS, parseFeedback } from './feedback';

const ok = (body: Record<string, unknown>) => {
  const result = parseFeedback(body);
  if ('error' in result) throw new Error(`expected ok, got: ${result.error}`);
  return result.value;
};

describe('parseFeedback', () => {
  it('accepts a real report and keeps its line breaks', () => {
    const value = ok({ kind: 'bug', message: 'Shop froze.\nThen the timer hit zero and nothing happened.' });
    expect(value.message).toContain('\n');
    expect(value.kind).toBe('bug');
  });

  it('refuses a report too short to act on', () => {
    // "it broke" is eight characters of nothing to go on.
    expect(parseFeedback({ kind: 'bug', message: 'broke' })).toMatchObject({ ok: false });
    expect(parseFeedback({ kind: 'bug', message: '        ' })).toMatchObject({ ok: false });
  });

  it('refuses a kind it does not know', () => {
    expect(parseFeedback({ kind: 'complaint', message: 'This is a long enough message' })).toMatchObject({ ok: false });
    expect(parseFeedback({ message: 'This is a long enough message' })).toMatchObject({ ok: false });
  });

  it('caps the message rather than rejecting a long one', () => {
    const value = ok({ kind: 'idea', message: 'x'.repeat(MAX_FEEDBACK_CHARS + 500) });
    expect(value.message).toHaveLength(MAX_FEEDBACK_CHARS);
  });

  it('keeps only the most recent errors, each trimmed', () => {
    const errors = Array.from({ length: 12 }, (_, i) => `TypeError ${i}: ${'y'.repeat(400)}`);
    const value = ok({ kind: 'bug', message: 'The board went blank', recentErrors: errors });
    expect(value.recentErrors).toHaveLength(MAX_RECENT_ERRORS);
    expect(value.recentErrors[value.recentErrors.length - 1]).toMatch(/^TypeError 11/);
    expect(value.recentErrors.every((e) => e.length <= 300)).toBe(true);
  });

  it('ignores junk where a list of errors should be', () => {
    expect(ok({ kind: 'bug', message: 'Nothing loads at all', recentErrors: 'not a list' }).recentErrors).toEqual([]);
    expect(
      ok({ kind: 'bug', message: 'Nothing loads at all', recentErrors: [null, 42, '', '  real one  '] }).recentErrors
    ).toEqual(['real one']); // strings only: a number is not an error message
  });

  it('normalises the room code and survives a missing one', () => {
    expect(ok({ kind: 'bug', message: 'Cannot join the room', roomId: 'abc12' }).roomId).toBe('ABC12');
    expect(ok({ kind: 'bug', message: 'Cannot join the room' }).roomId).toBeNull();
  });
});
