import { describe, expect, it } from 'vitest';
import { winnerIdsOf } from './matchArchive';
import type { RoomState } from '../types';

const room = (overrides: Partial<RoomState>) => ({ players: [], ...overrides }) as unknown as RoomState;

/**
 * Chess and Ludo record their winner as a colour, never as `room.winner`, so an
 * archive that only read `room.winner` recorded every chess match as won by
 * nobody.
 */
describe('winnerIdsOf', () => {
  it('credits the winning chess side, both partners in 2v2', () => {
    const r = room({
      roomType: 'chess',
      chessState: {
        winner: 'w',
        whitePlayers: [{ playerId: 'ada' }, { playerId: 'bisi' }],
        blackPlayers: [{ playerId: 'tunde' }],
      } as any,
    });
    expect([...winnerIdsOf(r)].sort()).toEqual(['ada', 'bisi']);
  });

  it('credits nobody for a draw', () => {
    const r = room({ roomType: 'chess', chessState: { winner: 'draw', whitePlayers: [], blackPlayers: [] } as any });
    expect(winnerIdsOf(r).size).toBe(0);
  });

  it('does not count the bot as a person who won', () => {
    const r = room({
      roomType: 'chess',
      chessState: {
        winner: 'b',
        whitePlayers: [{ playerId: 'ada' }],
        blackPlayers: [{ playerId: 'bot', isAi: true }],
      } as any,
    });
    expect(winnerIdsOf(r).size).toBe(0);
  });

  it('credits the Ludo player holding the winning colour', () => {
    const r = room({
      roomType: 'ludo',
      ludoState: {
        winner: 'green',
        players: [
          { playerId: 'ada', color: 'red' },
          { playerId: 'tunde', color: 'green' },
        ],
      } as any,
    });
    expect([...winnerIdsOf(r)]).toEqual(['tunde']);
  });

  it('still reads room.winner for the modes that set it', () => {
    const r = room({ roomType: 'board_game', winner: { id: 'zainab' } as any });
    expect([...winnerIdsOf(r)]).toEqual(['zainab']);
  });
});
