import { describe, expect, it } from 'vitest';

import {
  ALL_MINI_GAMES,
  BOARD_MINI_GAMES,
  FINISH_NODE,
  MAX_REACTION_BONUS,
  MINIGAME_HISTORY_WINDOW,
  MINIGAME_ICONS,
  MINIGAME_LABELS,
  MINI_GAMES,
  STARTING_LIVES,
  alternateByTeam,
  boardProgress,
  loseLife,
  performanceToSteps,
  pickMiniGame,
  rememberMiniGame,
  resolveTile,
  respawnToStart,
  scoreToPerformance,
  sumReactionBonus,
  shuffleTeams,
  walkBack,
  walkForward,
} from './gameRules';
import type { MiniGameId, Player, TeamId } from './types';

/** Enough of a Player to exercise the rules, without dragging in a real room. */
function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Tester',
    avatar: { id: 'paul', name: 'Paul', emoji: '', headwear: '', outfit: '', color: '', badge: '' },
    score: 0,
    boardPosition: 0,
    inventory: [],
    isHost: false,
    isReady: true,
    ...overrides,
  };
}

describe('mini-game catalogue', () => {
  // The lobby used to carry its own list of seven of the ten games, and saving
  // the lobby toggles wrote that back over the room — silently switching three
  // finished games off. Everything derives from one catalogue now; these lock
  // that in from the outside, where a future divergence would show up.
  it('describes every game exactly once', () => {
    const ids = MINI_GAMES.map((game) => game.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(ALL_MINI_GAMES);
  });

  it('gives every game a label, an icon and a blurb', () => {
    for (const game of MINI_GAMES) {
      expect(game.label.length).toBeGreaterThan(0);
      expect(game.icon.length).toBeGreaterThan(0);
      expect(game.blurb.length).toBeGreaterThan(0);
      expect(MINIGAME_LABELS[game.id]).toBe(game.label);
      expect(MINIGAME_ICONS[game.id]).toBe(game.icon);
    }
  });

  it('names no two games the same', () => {
    const labels = MINI_GAMES.map((game) => game.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('draws the board subset from games that exist', () => {
    for (const game of BOARD_MINI_GAMES) {
      expect(ALL_MINI_GAMES).toContain(game);
    }
  });
});

describe('scoring', () => {
  it('clamps performance to 0..1 however wild the score', () => {
    expect(scoreToPerformance('voice_arena', -50)).toBe(0);
    expect(scoreToPerformance('voice_arena', 99999)).toBe(1);
    expect(scoreToPerformance('voice_arena', 155)).toBeCloseTo(0.5, 5);
  });

  it('still moves a player who bombed the round', () => {
    // Freezing someone in place for a missed word makes the game drag; they
    // have already lost the points.
    expect(performanceToSteps(0)).toBeGreaterThan(0);
  });

  it('never rewards a worse round with more movement', () => {
    let previous = 0;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const steps = performanceToSteps(p);
      expect(steps).toBeGreaterThanOrEqual(previous);
      previous = steps;
    }
    expect(performanceToSteps(1)).toBe(12);
  });

  it('treats out-of-range performance as the nearest end', () => {
    expect(performanceToSteps(-3)).toBe(performanceToSteps(0));
    expect(performanceToSteps(7)).toBe(performanceToSteps(1));
  });
});

describe('lives', () => {
  it('reads a missing bar as full, so old rooms need no migration', () => {
    const p = player();
    expect(loseLife(p)).toEqual({ livesLeft: STARTING_LIVES - 1, empty: false });
  });

  it('empties at zero and never goes negative', () => {
    const p = player({ lives: 1 });
    expect(loseLife(p)).toEqual({ livesLeft: 0, empty: true });
    expect(loseLife(p)).toEqual({ livesLeft: 0, empty: true });
  });

  it('respawns to the launchpad with a fresh bar and no half-move left over', () => {
    const p = player({ lives: 0, boardPosition: 40, remainingSteps: 3 });
    respawnToStart(p);
    expect(p).toMatchObject({ lives: STARTING_LIVES, boardPosition: 0 });
    expect(p.remainingSteps).toBeUndefined();
  });
});

describe('reaction bonus', () => {
  it('is nothing when the room stays quiet', () => {
    expect(sumReactionBonus([])).toBe(0);
  });

  it('caps so a big room cannot dwarf actual accuracy', () => {
    const spam = Array.from({ length: 40 }, () => ({ reaction: 'drama' as const }));
    expect(sumReactionBonus(spam)).toBe(MAX_REACTION_BONUS);
  });
});

describe('teams', () => {
  const crew = (n: number, teamId?: TeamId) =>
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, teamId }));

  it('gives everyone a crew', () => {
    for (const size of [2, 3, 4, 5, 6]) {
      const teams = shuffleTeams(crew(size));
      expect(teams).toHaveLength(size);
      expect(teams.every((p) => p.teamId === 'red' || p.teamId === 'blue')).toBe(true);
    }
  });

  it('splits evenly, giving an odd player to red', () => {
    for (const size of [2, 3, 4, 5, 6]) {
      const red = shuffleTeams(crew(size)).filter((p) => p.teamId === 'red').length;
      expect(red).toBe(Math.ceil(size / 2));
    }
  });

  it('puts a lone player somewhere rather than crashing', () => {
    expect(shuffleTeams(crew(1))[0].teamId).toBe('red');
    expect(shuffleTeams([])).toEqual([]);
  });

  it('re-rolls to a different grouping, so a second press is never a no-op', () => {
    // Four players already split red/red/blue/blue. Other arrangements exist,
    // so the shuffle owes the room a visibly different one.
    const before = [
      { id: 'a', teamId: 'red' as TeamId },
      { id: 'b', teamId: 'red' as TeamId },
      { id: 'c', teamId: 'blue' as TeamId },
      { id: 'd', teamId: 'blue' as TeamId },
    ];
    const groupingOf = (players: { id: string; teamId?: TeamId }[]) =>
      players.filter((p) => p.teamId === 'red').map((p) => p.id).sort().join(',');

    for (let attempt = 0; attempt < 40; attempt++) {
      expect(groupingOf(shuffleTeams(before))).not.toBe(groupingOf(before));
    }
  });

  it('weaves the roll order instead of batching one side', () => {
    const ordered = [
      { id: 'a', teamId: 'red' as TeamId },
      { id: 'b', teamId: 'red' as TeamId },
      { id: 'c', teamId: 'blue' as TeamId },
      { id: 'd', teamId: 'blue' as TeamId },
    ];
    expect(alternateByTeam(ordered).map((p) => p.teamId)).toEqual(['red', 'blue', 'red', 'blue']);
  });

  it('lets the leading side keep the first slot', () => {
    const blueFirst = [
      { id: 'c', teamId: 'blue' as TeamId },
      { id: 'a', teamId: 'red' as TeamId },
    ];
    expect(alternateByTeam(blueFirst)[0].teamId).toBe('blue');
  });
});

describe('mini-game selection', () => {
  const board = BOARD_MINI_GAMES;

  it('honours what the host enabled', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickMiniGame(['pitch_bird', 'solfege'], true)).toMatch(/pitch_bird|solfege/);
    }
  });

  it('never serves the same game twice running when it has a choice', () => {
    for (let i = 0; i < 200; i++) {
      expect(pickMiniGame(board, true, ['solfege'])).not.toBe('solfege');
    }
  });

  it('rests a game that already came up twice in the window', () => {
    const recent: MiniGameId[] = ['pitch_bird', 'voice_arena', 'pitch_bird', 'voice_arena'];
    for (let i = 0; i < 200; i++) {
      expect(pickMiniGame(board, true, recent)).not.toBe('pitch_bird');
    }
  });

  it('still returns the only enabled game rather than nothing', () => {
    // The repeat rules are preferences. A host who enabled one game gets it.
    expect(pickMiniGame(['voice_arena'], true, ['voice_arena'])).toBe('voice_arena');
  });

  it('keeps a board turn to games the board can run', () => {
    for (let i = 0; i < 100; i++) {
      expect(BOARD_MINI_GAMES).toContain(pickMiniGame(ALL_MINI_GAMES, true));
    }
  });

  it('prefers the room vibe without overriding the repeat rules', () => {
    for (let i = 0; i < 100; i++) {
      expect(pickMiniGame(board, true, [], ['solfege', 'pitch_bird'])).toMatch(
        /solfege|pitch_bird/,
      );
    }
  });

  it('remembers only as far back as the repeat rule looks', () => {
    let recent: MiniGameId[] = [];
    for (let i = 0; i < 20; i++) recent = rememberMiniGame(recent, 'solfege');
    expect(recent).toHaveLength(MINIGAME_HISTORY_WINDOW);
  });
});

describe('board movement', () => {
  it('starts the launchpad at zero progress', () => {
    expect(boardProgress(0)).toBe(0);
  });

  it('stops at the finish rather than walking off the end', () => {
    expect(walkForward(0, 10_000)).toBe(FINISH_NODE);
  });

  it('stops at the launchpad rather than walking off the start', () => {
    expect(walkBack(FINISH_NODE, 10_000)).toBe(0);
  });

  it('moves forward and back symmetrically over plain road', () => {
    const forward = walkForward(0, 4);
    expect(forward).not.toBe(0);
    expect(walkBack(forward, 4)).toBe(0);
  });

  it('treats a position off the board as the launchpad', () => {
    expect(() => resolveTile(99_999)).not.toThrow();
  });

  it('calls the finish the finish', () => {
    const outcome = resolveTile(FINISH_NODE);
    expect(outcome.isFinish).toBe(true);
    expect(outcome.position).toBe(FINISH_NODE);
  });
});
