import { describe, expect, it } from 'vitest';
import { nextBotAction, nextLudoColor } from './ludoRules';
import type { LudoColor, LudoRoomState, LudoToken } from './ludoTypes';

const colors: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

function tokens(): Record<LudoColor, LudoToken[]> {
  const make = (color: LudoColor) => [0, 1, 2, 3].map((id) => ({ id, color, position: -1 }));
  return { red: make('red'), green: make('green'), yellow: make('yellow'), blue: make('blue') };
}

/** Red and green are people, yellow and blue are bots. */
function match(over: Partial<LudoRoomState> = {}): LudoRoomState {
  return {
    players: colors.map((color, i) => ({
      playerId: i < 2 ? `human_${color}` : `bot_${color}`,
      name: color,
      color,
      isAi: i >= 2,
    })),
    activeColor: 'yellow',
    diceValue: null,
    hasRolled: false,
    consecutiveSixes: 0,
    tokens: tokens(),
    winner: null,
    rankings: [],
    ...over,
  };
}

describe('what a bot does next', () => {
  it('rolls when it is a bot’s turn and nothing has been rolled', () => {
    expect(nextBotAction(match())).toBe('roll');
  });

  it('moves once the dice has landed', () => {
    expect(nextBotAction(match({ hasRolled: true, diceValue: 4 }))).toBe('move');
  });

  it('does nothing on a person’s turn, however the dice stands', () => {
    expect(nextBotAction(match({ activeColor: 'red' }))).toBeNull();
    expect(nextBotAction(match({ activeColor: 'green', hasRolled: true, diceValue: 6 }))).toBeNull();
  });

  it('does nothing before a match exists or after it is won', () => {
    expect(nextBotAction(null)).toBeNull();
    expect(nextBotAction(undefined)).toBeNull();
    expect(nextBotAction(match({ winner: 'blue' }))).toBeNull();
  });

  it('has no move to make when it has rolled but no number is showing', () => {
    expect(nextBotAction(match({ hasRolled: true, diceValue: null }))).toBeNull();
  });
});

describe('passing the turn round the table', () => {
  const nobodyAway = () => false;

  it('goes to the next colour in order', () => {
    const ls = match();
    expect(nextLudoColor(ls, 'red', nobodyAway)).toBe('green');
    expect(nextLudoColor(ls, 'blue', nobodyAway)).toBe('red');
  });

  it('passes over a person who is not there', () => {
    const ls = match();
    expect(nextLudoColor(ls, 'red', (id) => id === 'human_green')).toBe('yellow');
  });

  it('never treats a bot as absent, whatever the callback says', () => {
    const ls = match();
    expect(nextLudoColor(ls, 'green', () => true)).toBe('yellow');
  });

  it('skips several absent people in a row', () => {
    const ls = match({
      players: colors.map((color) => ({ playerId: `human_${color}`, name: color, color, isAi: false })),
    });
    expect(nextLudoColor(ls, 'red', (id) => id === 'human_green' || id === 'human_yellow')).toBe('blue');
  });

  it('still advances when every person is gone, so the match is there for whoever returns', () => {
    const ls = match({
      players: colors.map((color) => ({ playerId: `human_${color}`, name: color, color, isAi: false })),
    });
    expect(nextLudoColor(ls, 'red', () => true)).toBe('green');
  });
});
