import { afterEach, describe, expect, it, vi } from 'vitest';
import { attemptIsOpen, attemptWindow } from './attemptWindow';
import type { LiveMiniGameState } from './types';

const live = (overrides: Partial<LiveMiniGameState> = {}): LiveMiniGameState => ({
  playerId: 'sis',
  game: 'voice_arena',
  attempting: true,
  ...overrides,
});

describe('attemptIsOpen', () => {
  const base = { performerId: 'sis', game: 'voice_arena' as const, localOpen: false, liveState: null };

  describe('on the performer’s own device', () => {
    it('is closed until the performer starts, however long it has been their turn', () => {
      // The bug this exists for: the phase is running, nothing has been attempted.
      expect(attemptIsOpen({ ...base, isPerformer: true, liveState: live({ attempting: false }) })).toBe(false);
      expect(attemptIsOpen({ ...base, isPerformer: true })).toBe(false);
    });

    it('opens the moment their own device says so, without waiting to hear it back from the room', () => {
      expect(attemptIsOpen({ ...base, isPerformer: true, localOpen: true, liveState: null })).toBe(true);
    });

    it('closes when their device says so, even if the room has not caught up', () => {
      expect(attemptIsOpen({ ...base, isPerformer: true, localOpen: false, liveState: live({ attempting: true }) })).toBe(false);
    });
  });

  describe('on everyone else’s device', () => {
    it('is closed while the performer is only on stage', () => {
      expect(attemptIsOpen({ ...base, isPerformer: false, liveState: live({ attempting: false }) })).toBe(false);
      expect(attemptIsOpen({ ...base, isPerformer: false, liveState: live({ attempting: undefined }) })).toBe(false);
      expect(attemptIsOpen({ ...base, isPerformer: false, liveState: null })).toBe(false);
    });

    it('opens when the performer reports an attempt under way', () => {
      expect(attemptIsOpen({ ...base, isPerformer: false, liveState: live() })).toBe(true);
    });

    it('does not trust their own device, which only the performer ever opens', () => {
      expect(attemptIsOpen({ ...base, isPerformer: false, localOpen: true, liveState: null })).toBe(false);
    });

    it('ignores an attempt by somebody else', () => {
      expect(attemptIsOpen({ ...base, isPerformer: false, liveState: live({ playerId: 'bo' }) })).toBe(false);
    });

    it('ignores an attempt at a different game', () => {
      expect(attemptIsOpen({ ...base, isPerformer: false, liveState: live({ game: 'pitch_bird' }) })).toBe(false);
    });

    it('has nothing to compare against when the game is unknown', () => {
      expect(attemptIsOpen({ ...base, isPerformer: false, game: undefined, liveState: live() })).toBe(false);
    });
  });

  it('is closed when nobody is on stage', () => {
    expect(attemptIsOpen({ ...base, performerId: null, isPerformer: true, localOpen: true })).toBe(false);
    expect(attemptIsOpen({ ...base, performerId: undefined, isPerformer: false, liveState: live() })).toBe(false);
  });
});

describe('attemptWindow', () => {
  afterEach(() => {
    attemptWindow.close('sis');
    attemptWindow.close('bo');
  });

  it('is shut until somebody opens it', () => {
    expect(attemptWindow.isOpen('sis')).toBe(false);
  });

  it('opens and closes for a player, and tells whoever is listening exactly once each time', () => {
    const listener = vi.fn();
    const unsubscribe = attemptWindow.subscribe(listener);

    attemptWindow.open('sis');
    attemptWindow.open('sis'); // already open: nothing changed, nothing to announce
    expect(attemptWindow.isOpen('sis')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    attemptWindow.close('sis');
    attemptWindow.close('sis');
    expect(attemptWindow.isOpen('sis')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('will not let a late cleanup close somebody else’s attempt', () => {
    // sis's game unmounts after bo's attempt has already opened the window.
    attemptWindow.open('sis');
    attemptWindow.open('bo');
    attemptWindow.close('sis');
    expect(attemptWindow.isOpen('bo')).toBe(true);
    expect(attemptWindow.isOpen('sis')).toBe(false);
  });

  it('stops telling a listener that has unsubscribed', () => {
    const listener = vi.fn();
    const unsubscribe = attemptWindow.subscribe(listener);
    unsubscribe();
    attemptWindow.open('sis');
    expect(listener).not.toHaveBeenCalled();
  });
});
