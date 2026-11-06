import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the real room API for someone who joins while a match is running.
 *
 * Playtest: a guest joined mid board game and was handed Asteroid Defense
 * seconds later, with no warning that a match was on. A latecomer now watches
 * the rest of the round (board game) or the rest of the match (everything else).
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
  coerceVibe: (vibe: unknown) => vibe ?? 'classic_party',
  generateChallenge: async () => ({ challenge: 'x', hostLine: 'y' }),
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

type Who = { id: string; token: string; name: string };

let counter = 0;

async function call(roomId: string, body: Record<string, unknown>, who?: Who) {
  const res = await POST(
    new Request(`http://test/api/room/${roomId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: who?.token, playerId: who?.id, ...body }),
    }),
    { params: { roomId } }
  );
  return { status: res.status, body: (await res.json()) as any };
}

async function join(roomId: string, name: string): Promise<Who> {
  const joined = await call(roomId, { action: 'join', playerName: name });
  expect(joined.status).toBe(200);
  return { id: joined.body.playerId, token: joined.body.token, name };
}

const room = (roomId: string) => store.rooms.get(roomId);
const player = (roomId: string, id: string) => room(roomId).players.find((p: any) => p.id === id);
const performer = (roomId: string) => room(roomId).players[room(roomId).activePlayerIndex];

/** A room with a host and a guest; the board game plays Voice Arena only, so every turn ends the same way. */
async function lobby() {
  const roomId = `LC${++counter}`;
  const created = await call(roomId, { action: 'create', playerName: 'Host' });
  const host: Who = { id: created.body.playerId, token: created.body.token, name: 'Host' };
  const ada = await join(roomId, 'Ada');
  expect((await call(roomId, { action: 'update_minigames', miniGames: ['voice_arena'] }, host)).status).toBe(200);
  return { roomId, host, ada };
}

async function boardMatch() {
  const setup = await lobby();
  expect((await call(setup.roomId, { action: 'start_match' }, setup.host)).status).toBe(200);
  return setup;
}

/** Whoever is up plays their mini-game and the room moves past the roast. */
async function playTurn(roomId: string, who: Who) {
  expect(performer(roomId).id).toBe(who.id);
  expect((await call(roomId, { action: 'complete_voice_turn', pointsEarned: 50 }, who)).status).toBe(200);
  expect((await call(roomId, { action: 'finish_roast' }, who)).status).toBe(200);
}

/** Everyone in the roll order takes their turn without rolling, which ends the round. */
async function finishBoard(roomId: string, everyone: Who[]) {
  while (room(roomId).phase === 'roadmap_turn') {
    const up = everyone.find((w) => w.id === performer(roomId).id)!;
    expect((await call(roomId, { action: 'advance_turn' }, up)).status).toBe(200);
  }
}

beforeEach(() => {
  store.rooms.clear();
  store.secrets.clear();
});

describe('joining before anything has started', () => {
  it('is simply joining — no watching', async () => {
    const { roomId } = await lobby();
    const bo = await join(roomId, 'Bo');
    expect(player(roomId, bo.id).latecomer).toBeUndefined();
  });
});

describe('joining a board game that is already running', () => {
  it('lets them in to watch, from the next round', async () => {
    const { roomId } = await boardMatch();
    const bo = await join(roomId, 'Bo');

    expect(player(roomId, bo.id).latecomer).toEqual({ fromRound: 2 });
    expect(JSON.stringify(room(roomId).events)).toContain('Bo joined mid-match and plays when round 2 starts');
  });

  it('never hands them a mini-game in the round they arrived in', async () => {
    const { roomId, host, ada } = await boardMatch();
    await join(roomId, 'Bo');

    await playTurn(roomId, host);
    await playTurn(roomId, ada);

    // Straight to the shop: nobody else was owed a turn.
    expect(room(roomId).phase).toBe('powerup_shop');
  });

  it('does not hold the shop or the dice for them', async () => {
    const { roomId, host, ada } = await boardMatch();
    const bo = await join(roomId, 'Bo');
    await playTurn(roomId, host);
    await playTurn(roomId, ada);

    await call(roomId, { action: 'finish_shopping' }, host);
    await call(roomId, { action: 'finish_shopping' }, ada);

    expect(room(roomId).phase).toBe('roadmap_turn');
    expect(room(roomId).rollOrder).not.toContain(bo.id);
    expect(room(roomId).rollOrder).toHaveLength(2);
  });

  it('gives them a turn once the next round starts', async () => {
    const { roomId, host, ada } = await boardMatch();
    const bo = await join(roomId, 'Bo');
    await playTurn(roomId, host);
    await playTurn(roomId, ada);
    await call(roomId, { action: 'finish_shopping' }, host);
    await call(roomId, { action: 'finish_shopping' }, ada);
    await finishBoard(roomId, [host, ada, bo]);

    expect(room(roomId).roundNumber).toBe(2);
    await playTurn(roomId, host);
    await playTurn(roomId, ada);
    // The latecomer is up, last, in the round they were promised.
    expect(performer(roomId).id).toBe(bo.id);
    expect(room(roomId).phase).toBe('qualifying_voice');
  });

  it('cannot be hit with a powerup while they are watching', async () => {
    const { roomId, host } = await boardMatch();
    const bo = await join(roomId, 'Bo');
    const r = room(roomId);
    r.phase = 'roadmap_turn';
    r.players.find((p: any) => p.id === host.id).inventory = ['freeze'];
    store.rooms.set(roomId, r);

    const res = await call(roomId, { action: 'use_powerup', powerupId: 'freeze', targetPlayerId: bo.id }, host);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/only watching/);
  });

  it('is let in at once when everyone from the match has gone', async () => {
    const { roomId, host, ada } = await boardMatch();
    const bo = await join(roomId, 'Bo');

    await call(roomId, { action: 'mark_away' }, ada);
    await call(roomId, { action: 'mark_away' }, host);

    expect(player(roomId, bo.id).latecomer).toBeUndefined();
    expect(performer(roomId).id).toBe(bo.id);
  });

  it('becomes host when they are the only one left', async () => {
    const { roomId } = await boardMatch();
    const bo = await join(roomId, 'Bo');
    // Host and Ada went quiet a minute ago; Bo is due a heartbeat.
    const r = room(roomId);
    for (const p of r.players) p.lastSeen = p.id === bo.id ? Date.now() - 15_000 : Date.now() - 60_000;
    store.rooms.set(roomId, r);

    await call(roomId, { action: 'heartbeat' }, bo);

    expect(room(roomId).hostId).toBe(bo.id);
    expect(player(roomId, bo.id).isHost).toBe(true);
    expect(performer(roomId).id).toBe(bo.id);
  });

  it('is the same for a pass-and-play player the host adds mid-match', async () => {
    const { roomId, host } = await boardMatch();
    const added = await call(roomId, { action: 'add_local_player', playerName: 'Cy' }, host);
    const cy = added.body.room.players.find((p: any) => p.name === 'Cy');
    expect(cy.latecomer).toEqual({ fromRound: 2 });
  });
});

describe('joining any other mode that is already running', () => {
  it('waits for the next match, and the next match lets them play', async () => {
    const { roomId, host } = await lobby();
    expect((await call(roomId, { action: 'chess_start_match', mode: '1v1' }, host)).status).toBe(200);
    const bo = await join(roomId, 'Bo');
    expect(player(roomId, bo.id).latecomer).toEqual({ fromRound: null });
    expect(JSON.stringify(room(roomId).events)).toContain('plays when the next match starts');

    expect((await call(roomId, { action: 'end_match' }, host)).status).toBe(200);
    expect(player(roomId, bo.id).latecomer).toBeUndefined();
  });

  it('never calls on a watcher in Truth or Dare', async () => {
    const { roomId, host } = await lobby();
    expect((await call(roomId, { action: 'truth_or_dare_start' }, host)).status).toBe(200);
    const bo = await join(roomId, 'Bo');

    // The wheel picks at random, so give it plenty of chances to be wrong.
    for (let i = 0; i < 25; i++) {
      const r = room(roomId);
      r.truthOrDareState = { ...r.truthOrDareState, phase: 'selecting', selectionMode: 'wheel', targetId: '' };
      store.rooms.set(roomId, r);
      const caller = r.players.find((p: any) => p.id === r.truthOrDareState.callerId);
      const who = caller.id === host.id ? host : { id: caller.id, token: store.secrets.get(roomId)!.tokens[caller.id], name: caller.name };
      expect((await call(roomId, { action: 'truth_or_dare_select' }, who)).status).toBe(200);
      expect(room(roomId).truthOrDareState.targetId).not.toBe(bo.id);
    }
  });

  it('clears an old pass when a new match starts straight from the lobby', async () => {
    const { roomId, host } = await lobby();
    const bo = await join(roomId, 'Bo');
    // A pass left behind by a match that ended some other way.
    const r = room(roomId);
    r.players.find((p: any) => p.id === bo.id).latecomer = { fromRound: 7 };
    store.rooms.set(roomId, r);

    await call(roomId, { action: 'start_match' }, host);

    expect(player(roomId, bo.id).latecomer).toBeUndefined();
  });
});
