import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the real room API for Ludo, with only storage replaced.
 *
 * The rules are unit-tested on their own. What only shows up once the handlers
 * are wired together is who is allowed to play a bot's turn, what happens to the
 * table when somebody's phone goes dark on theirs, and that the die's number
 * survives a turn that resolves itself.
 */

const store = vi.hoisted(() => ({
  rooms: new Map<string, any>(),
  secrets: new Map<string, { tokens: Record<string, string> }>(),
}));

vi.mock('@/lib/firebase/server', () => ({ verifyUid: async () => null, adminDb: {} }));
vi.mock('@/lib/server/sessionArchive', () => ({
  newSessionId: () => 'test-session',
  recordSessionCreated: async () => {},
  recordSessionStarted: async () => {},
  recordSessionCompleted: async () => {},
}));
vi.mock('@/lib/server/matchArchive', () => ({ archiveMatch: async () => {} }));
vi.mock('@/lib/server/aiHost', () => ({
  generateTriviaFromAi: async () => null,
  askHost: async () => null,
  coerceVibe: (vibe: unknown) => vibe,
  generateChallenge: async () => null,
}));

vi.mock('@/lib/server/roomServer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/roomServer')>();
  return {
    ...actual,
    readRoom: async (roomId: string) => {
      const room = store.rooms.get(roomId);
      return room ? structuredClone(room) : null;
    },
    writeRoom: async (room: { roomId: string }) => {
      store.rooms.set(room.roomId, structuredClone(room));
      return structuredClone(room);
    },
    readSecrets: async (roomId: string) => {
      let secrets = store.secrets.get(roomId);
      if (!secrets) {
        secrets = { tokens: {} };
        store.secrets.set(roomId, secrets);
      }
      return secrets;
    },
    writeSecrets: async (roomId: string, secrets: { tokens: Record<string, string> }) => {
      store.secrets.set(roomId, secrets);
    },
  };
});

import { POST } from '@/app/api/room/[roomId]/route';

type Who = { id: string; token: string };

let counter = 0;

async function call(roomId: string, body: Record<string, unknown>, who?: Who) {
  const res = await POST(
    new Request(`http://test/api/room/${roomId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: who?.token, ...body }),
    }),
    { params: { roomId } }
  );
  return { status: res.status, body: (await res.json()) as any };
}

/** A host and a guest, with a Ludo match started: host is red, guest green, the rest bots. */
async function ludoMatch(humanSeats = 2) {
  const roomId = `LU${++counter}`;
  const created = await call(roomId, { action: 'create', playerName: 'Host' });
  const host: Who = { id: created.body.playerId, token: created.body.token };
  const joined = await call(roomId, { action: 'join', playerName: 'Ada' });
  const ada: Who = { id: joined.body.playerId, token: joined.body.token };
  const started = await call(roomId, { action: 'ludo_start_match', humanSeats }, host);
  expect(started.status).toBe(200);
  return { roomId, host, ada };
}

const ludo = (roomId: string) => store.rooms.get(roomId).ludoState;
const setLudo = (roomId: string, patch: Record<string, unknown>) => {
  const room = store.rooms.get(roomId);
  Object.assign(room.ludoState, patch);
  store.rooms.set(roomId, room);
};

beforeEach(() => {
  store.rooms.clear();
  store.secrets.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('starting a match', () => {
  it('is the host’s to start — a guest cannot reset a game in progress', async () => {
    const { roomId, ada } = await ludoMatch();
    const res = await call(roomId, { action: 'ludo_start_match', humanSeats: 1 }, ada);
    expect(res.status).toBe(403);
  });

  it('fills the seats nobody holds with bots and begins on red', async () => {
    const { roomId } = await ludoMatch(1);
    const seats = ludo(roomId).players;
    expect(seats.filter((p: any) => p.isAi).map((p: any) => p.color)).toEqual(['green', 'yellow', 'blue']);
    expect(ludo(roomId).activeColor).toBe('red');
    expect(ludo(roomId).seq).toBe(0);
  });
});

describe('who plays a bot’s turn', () => {
  it('lets the host roll for a bot', async () => {
    const { roomId, host } = await ludoMatch(1);
    setLudo(roomId, { activeColor: 'green' });

    const res = await call(roomId, { action: 'ludo_roll_dice' }, host);
    expect(res.status).toBe(200);
  });

  it('refuses everybody else, which is why only the host’s browser may try', async () => {
    const { roomId, ada } = await ludoMatch(1);
    setLudo(roomId, { activeColor: 'green' });

    const res = await call(roomId, { action: 'ludo_roll_dice' }, ada);
    expect(res.status).toBe(403);
  });
});

describe('the die', () => {
  it('remembers the number rolled even when the turn plays itself out', async () => {
    const { roomId, host } = await ludoMatch();
    // A one with every token still in the yard has no legal move, so the turn is
    // passed on at once and diceValue is cleared — the table used to lose the number.
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const res = await call(roomId, { action: 'ludo_roll_dice' }, host);
    expect(res.status).toBe(200);
    expect(ludo(roomId).diceValue).toBeNull();
    expect(ludo(roomId).lastRoll).toBe(1);
    expect(ludo(roomId).activeColor).toBe('green');
  });

  it('counts every roll, so a bonus turn is told apart from the one before', async () => {
    const { roomId, host } = await ludoMatch();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await call(roomId, { action: 'ludo_roll_dice' }, host);
    expect(ludo(roomId).seq).toBe(1);
  });

  it('will not roll once the match is won', async () => {
    const { roomId, host } = await ludoMatch();
    setLudo(roomId, { winner: 'red' });
    const res = await call(roomId, { action: 'ludo_roll_dice' }, host);
    expect(res.status).toBe(409);
  });
});

describe('a player who has gone', () => {
  it('is passed over when the turn reaches them', async () => {
    const { roomId, host } = await ludoMatch();
    const room = store.rooms.get(roomId);
    room.players.find((p: any) => p.name === 'Ada').connected = false;
    store.rooms.set(roomId, room);

    vi.spyOn(Math, 'random').mockReturnValue(0);
    await call(roomId, { action: 'ludo_roll_dice' }, host);

    // Red passed; green is Ada, who is away, so it lands on the yellow bot.
    expect(ludo(roomId).activeColor).toBe('yellow');
  });

  it('has their turn passed straight away if they drop while it is theirs', async () => {
    const { roomId, ada } = await ludoMatch();
    setLudo(roomId, { activeColor: 'green' });

    await call(roomId, { action: 'mark_away' }, ada);

    expect(ludo(roomId).activeColor).toBe('yellow');
    expect(ludo(roomId).lastActionText).toContain('away');
  });

  it('does not lose the match if they come back', async () => {
    const { roomId, host, ada } = await ludoMatch();
    setLudo(roomId, { activeColor: 'green' });
    await call(roomId, { action: 'mark_away' }, ada);
    await call(roomId, { action: 'heartbeat' }, ada);

    // Back on the call, and the seat is still theirs when green comes round again.
    setLudo(roomId, { activeColor: 'green' });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const res = await call(roomId, { action: 'ludo_roll_dice' }, ada);
    expect(res.status).toBe(200);
    expect(host).toBeTruthy();
  });
});
