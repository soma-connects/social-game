import { STARTING_LIVES } from './gameRules';
import type { AiMasterState, Player } from './types';

/**
 * The AI Master's own economy.
 *
 * The board game has a shop of powerups because it has a road to use them on.
 * This mode has no road: what it has is a host who can be leaned on, and points
 * that otherwise buy nothing. So these are the host's prices — a fixed list, not
 * a gamble — for the things people in this room actually want: to get out of it,
 * to hand it to somebody else, or to choose who gets it next.
 */

/** Everyone sits down with the same purse, whatever the room played before. */
export const AI_MASTER_STARTING_PURSE = 100;

/** Points a survived round pays the player who survived it. */
export const AI_MASTER_PASS_POINTS = 120;

/** Paid once per round to each player who casts a vote, so judging is worth doing. */
export const AI_MASTER_VOTE_POINTS = 10;

export type AiMasterItemId = 'skip' | 'redirect' | 'spotlight' | 'life';

export type AiMasterItem = {
  id: AiMasterItemId;
  label: string;
  blurb: string;
  price: number;
  /** Whether the buyer has to name another player. */
  needsVictim: boolean;
  /** Whether only the player on the spot may buy it. */
  targetOnly: boolean;
};

export const AI_MASTER_ITEMS: AiMasterItem[] = [
  {
    id: 'skip',
    label: 'Buy your way out',
    blurb: 'Walk away from your own challenge. No points, no penalty.',
    price: 100,
    needsVictim: false,
    targetOnly: true,
  },
  {
    id: 'redirect',
    label: 'Shove it on someone',
    blurb: 'Dump your challenge on a player you choose.',
    price: 150,
    needsVictim: true,
    targetOnly: true,
  },
  {
    id: 'spotlight',
    label: 'Name the next victim',
    blurb: 'Pay the host to call out a player you choose next round.',
    price: 120,
    needsVictim: true,
    targetOnly: false,
  },
  {
    id: 'life',
    label: 'Buy back a heart',
    blurb: 'Get one life back.',
    price: 200,
    needsVictim: false,
    targetOnly: false,
  },
];

export function getAiMasterItem(id: unknown): AiMasterItem | undefined {
  return AI_MASTER_ITEMS.find((item) => item.id === id);
}

export type PurchaseInput = {
  state: AiMasterState;
  buyer: Player;
  players: Player[];
  /** Ids of everyone who can be called out: still in, and actually here. */
  standingIds: string[];
  itemId: unknown;
  targetId?: unknown;
};

/**
 * Tagged with a string rather than a boolean: this project compiles with
 * strict off, where a boolean discriminant does not narrow.
 */
export type PurchaseResult =
  | { status: 'bought'; item: AiMasterItem; victim: Player | null }
  | { status: 'refused'; error: string; http: number };

const refuse = (error: string, http = 409): PurchaseResult => ({ status: 'refused', error, http });

/**
 * Sells one thing from the host's list, or says why not.
 *
 * Applies the purchase to `state` and the buyer's purse itself, so the rules
 * for what each item does live in one place beside the rules for who may buy
 * it. Nothing is taken from a refused purchase.
 */
export function buyFromHost(input: PurchaseInput): PurchaseResult {
  const { state, buyer, players, standingIds } = input;

  const item = getAiMasterItem(input.itemId);
  if (!item) return refuse('The host does not sell that', 400);

  if (buyer.eliminated) return refuse('You are out — the host has no time for ghosts');
  if ((buyer.score ?? 0) < item.price) return refuse(`That costs ${item.price} points and you have ${buyer.score ?? 0}`);

  const isTarget = state.targetId === buyer.id;
  if (item.targetOnly && !isTarget) return refuse('Only the player on the spot can buy that');

  let victim: Player | null = null;
  if (item.needsVictim) {
    victim = players.find((p) => p.id === input.targetId) ?? null;
    if (!victim || victim.id === buyer.id || !standingIds.includes(victim.id)) {
      return refuse('Pick somebody who is still in the game', 400);
    }
  }

  switch (item.id) {
    case 'skip': {
      if (state.phase === 'verdict') return refuse('This round is already decided');
      state.phase = 'verdict';
      state.passed = true;
      state.outcome = 'skipped';
      state.revealedAt = Date.now();
      break;
    }
    case 'redirect': {
      if (state.phase !== 'announcing') return refuse('Too late — they have already answered');
      state.targetId = victim!.id;
      state.votes = {};
      state.response = undefined;
      // A fresh clock for the new target, not whatever was left on the old one.
      state.deadline = null;
      state.deadlineFor = null;
      break;
    }
    case 'spotlight': {
      if (state.spotlight) {
        return refuse(`${state.spotlight.byName} has already bought the next spotlight`);
      }
      state.spotlight = {
        by: buyer.id,
        byName: buyer.name,
        target: victim!.id,
        targetName: victim!.name,
        price: item.price,
      };
      break;
    }
    case 'life': {
      if ((buyer.lives ?? STARTING_LIVES) >= STARTING_LIVES) return refuse('Your hearts are already full');
      buyer.lives = Math.min(STARTING_LIVES, (buyer.lives ?? STARTING_LIVES) + 1);
      break;
    }
  }

  buyer.score = Math.max(0, (buyer.score ?? 0) - item.price);
  return { status: 'bought', item, victim };
}
