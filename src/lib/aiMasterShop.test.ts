import { describe, expect, it } from 'vitest';
import { AI_MASTER_ITEMS, buyFromHost, getAiMasterItem } from './aiMasterShop';
import { STARTING_LIVES } from './gameRules';
import type { AiMasterState, Player } from './types';

function player(id: string, over: Partial<Player> = {}): Player {
  return { id, name: id.toUpperCase(), score: 500, lives: STARTING_LIVES, ...over } as Player;
}

function round(over: Partial<AiMasterState> = {}): AiMasterState {
  return {
    round: 2,
    targetId: 'ada',
    challenge: 'Confess something',
    category: 'truth',
    phase: 'announcing',
    votes: { ben: 'pass' },
    response: 'I once…',
    bribes: [],
    ...over,
  } as AiMasterState;
}

const ada = () => player('ada');
const ben = () => player('ben');
const cy = () => player('cy');

function buy(
  itemId: unknown,
  opts: { buyer?: Player; state?: AiMasterState; targetId?: unknown; standing?: string[] } = {}
) {
  const buyer = opts.buyer ?? ada();
  const players = [buyer, ben(), cy()].filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);
  const state = opts.state ?? round();
  const result = buyFromHost({
    state,
    buyer,
    players,
    standingIds: opts.standing ?? players.map((p) => p.id),
    itemId,
    targetId: opts.targetId,
  });
  return { result, buyer, state, players };
}

describe('the price list', () => {
  it('has fixed prices for the four things worth buying', () => {
    expect(AI_MASTER_ITEMS.map((i) => i.id)).toEqual(['skip', 'redirect', 'spotlight', 'life']);
    for (const item of AI_MASTER_ITEMS) expect(item.price).toBeGreaterThan(0);
    expect(getAiMasterItem('skip')?.price).toBe(100);
    expect(getAiMasterItem('nonsense')).toBeUndefined();
  });

  it('refuses an item that is not on it', () => {
    const { result } = buy('teleport');
    expect(result).toMatchObject({ status: 'refused', http: 400 });
  });
});

describe('buying your way out', () => {
  it('ends your round with no points and no penalty, and takes the money', () => {
    const { result, buyer, state } = buy('skip');
    expect(result.status).toBe('bought');
    expect(state.phase).toBe('verdict');
    expect(state.outcome).toBe('skipped');
    expect(buyer.score).toBe(400);
    expect(buyer.lives).toBe(STARTING_LIVES);
  });

  it('is only for the player on the spot', () => {
    const { result, buyer, state } = buy('skip', { buyer: ben() });
    expect(result).toMatchObject({ status: 'refused' });
    expect(state.phase).toBe('announcing');
    expect(buyer.score).toBe(500);
  });

  it('cannot be bought once the round is decided', () => {
    const { result } = buy('skip', { state: round({ phase: 'verdict' }) });
    expect(result.status).toBe('refused');
  });
});

describe('shoving it on someone', () => {
  it('hands the challenge to the player you name, with a clean slate', () => {
    const { result, buyer, state } = buy('redirect', { targetId: 'ben' });
    expect(result.status).toBe('bought');
    expect(state.targetId).toBe('ben');
    expect(state.votes).toEqual({});
    expect(state.response).toBeUndefined();
    // The new target gets a clock of their own, not what was left on the old one.
    expect(state.deadline).toBeNull();
    expect(buyer.score).toBe(350);
  });

  it('will not take you as the victim, or anyone who is out or gone', () => {
    expect(buy('redirect', { targetId: 'ada' }).result).toMatchObject({ status: 'refused', http: 400 });
    expect(buy('redirect', { targetId: 'ben', standing: ['ada', 'cy'] }).result).toMatchObject({ status: 'refused' });
    expect(buy('redirect', { targetId: 'nobody' }).result).toMatchObject({ status: 'refused' });
    expect(buy('redirect').result).toMatchObject({ status: 'refused' });
  });

  it('is too late once they have answered', () => {
    const { result, state } = buy('redirect', { targetId: 'ben', state: round({ phase: 'voting' }) });
    expect(result.status).toBe('refused');
    expect(state.targetId).toBe('ada');
  });

  it('is only for the player on the spot', () => {
    expect(buy('redirect', { buyer: cy(), targetId: 'ben' }).result.status).toBe('refused');
  });
});

describe('naming the next victim', () => {
  it('lets anyone, including a bystander, pay to have somebody called out next', () => {
    const { result, buyer, state } = buy('spotlight', { buyer: cy(), targetId: 'ben' });
    expect(result.status).toBe('bought');
    expect(state.spotlight).toMatchObject({ by: 'cy', target: 'ben', price: 120 });
    expect(buyer.score).toBe(380);
    // It changes nothing about the round in front of them.
    expect(state.targetId).toBe('ada');
    expect(state.phase).toBe('announcing');
  });

  it('can be bought even while the verdict is on screen', () => {
    expect(buy('spotlight', { buyer: cy(), targetId: 'ben', state: round({ phase: 'verdict' }) }).result.status).toBe('bought');
  });

  it('is sold once a round, and the second buyer keeps their money', () => {
    const state = round();
    buy('spotlight', { buyer: cy(), targetId: 'ben', state });
    const second = buy('spotlight', { buyer: ben(), targetId: 'ada', state });
    expect(second.result).toMatchObject({ status: 'refused' });
    expect(second.buyer.score).toBe(500);
    expect(state.spotlight?.target).toBe('ben');
  });

  it('cannot name yourself', () => {
    expect(buy('spotlight', { buyer: cy(), targetId: 'cy' }).result.status).toBe('refused');
  });
});

describe('buying a heart back', () => {
  it('gives one life for the price', () => {
    const { result, buyer } = buy('life', { buyer: player('ada', { lives: 1 }) });
    expect(result.status).toBe('bought');
    expect(buyer.lives).toBe(2);
    expect(buyer.score).toBe(300);
  });

  it('is refused when the hearts are already full', () => {
    const { result, buyer } = buy('life');
    expect(result.status).toBe('refused');
    expect(buyer.score).toBe(500);
  });
});

describe('money and eligibility', () => {
  it('takes nothing from a player who cannot afford it', () => {
    const { result, buyer, state } = buy('skip', { buyer: player('ada', { score: 99 }) });
    expect(result).toMatchObject({ status: 'refused' });
    expect(buyer.score).toBe(99);
    expect(state.phase).toBe('announcing');
  });

  it('serves nobody who has been knocked out', () => {
    const { result } = buy('life', { buyer: player('ada', { eliminated: true, lives: 0 }) });
    expect(result.status).toBe('refused');
  });

  it('never leaves a purse below zero', () => {
    const { buyer } = buy('skip', { buyer: player('ada', { score: 100 }) });
    expect(buyer.score).toBe(0);
  });
});
