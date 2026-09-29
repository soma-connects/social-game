import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The room's half of the attempt window, through the real handler with only
 * storage replaced.
 *
 * Everyone but the performer learns that an attempt is under way from the live
 * state the performer shares, and their replay recorder trusts it. That leans on
 * three things the server has to keep true: the flag arrives untouched, nobody
 * can put words in the performer's mouth, and a flag left over from one turn is
 * gone before the next begins.
 */

const store = vi.hoisted(() => ({
  rooms: new Map<string, unknown>(),
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

const stored = (roomId: string) => store.rooms.get(roomId) as any;

/** Two players, Voice Arena only, match started: somebody is on stage and about to attempt. */
async function onStage() {
  const roomId = `LA${++counter}`;
  const created = await call(roomId, { action: 'create', playerName: 'Host' });
  const host: Who = { id: created.body.playerId, token: created.body.token };
  const joined = await call(roomId, { action: 'join', playerName: 'Ada' });
  const ada: Who = { id: joined.body.playerId, token: joined.body.token };

  await call(roomId, { action: 'update_minigames', miniGames: ['voice_arena'] }, host);
  const started = await call(roomId, { action: 'start_match' }, host);
  expect(started.status).toBe(200);

  const room = started.body.room;
  const performer = room.players[room.activePlayerIndex].id === host.id ? host : ada;
  const bystander = performer === host ? ada : host;
  return { roomId, performer, bystander, game: room.currentMiniGame as string };
}

const push = (roomId: string, who: Who, state: Record<string, unknown>) =>
  call(roomId, { action: 'push_live_state', state }, who);

beforeEach(() => {
  store.rooms.clear();
  store.secrets.clear();
});

describe('the live attempt state', () => {
  it('starts a turn with nothing in it, so nobody is recording before the performer acts', async () => {
    const { roomId } = await onStage();
    expect(stored(roomId).liveState ?? null).toBeNull();
  });

  it('passes the attempting flag to the room untouched, both ways', async () => {
    const { roomId, performer } = await onStage();

    expect((await push(roomId, performer, { prompt: 'jollof', attempting: true })).status).toBe(200);
    expect(stored(roomId).liveState).toMatchObject({ prompt: 'jollof', attempting: true });

    expect((await push(roomId, performer, { prompt: 'jollof', attempting: false })).status).toBe(200);
    expect(stored(roomId).liveState).toMatchObject({ attempting: false });
  });

  it('says whose attempt it is and at which game, from the room rather than from the sender', async () => {
    const { roomId, performer, game } = await onStage();

    // The sender claims to be somebody else, at a different game.
    await push(roomId, performer, { attempting: true, playerId: 'somebody-else', game: 'pitch_bird' });

    const live = stored(roomId).liveState;
    expect(live.playerId).toBe(performer.id);
    expect(live.game).toBe(game);
  });

  it('only listens to the performer', async () => {
    const { roomId, bystander } = await onStage();

    const forged = await push(roomId, bystander, { attempting: true });
    expect(forged.status).toBe(403);
    expect(stored(roomId).liveState ?? null).toBeNull();
  });

  it('is gone before the next turn begins, so a flag nobody cleared cannot start anyone recording', async () => {
    const { roomId, performer } = await onStage();

    // The performer's last report says they are still attempting -- the closing
    // "not attempting" never arrived.
    await push(roomId, performer, { prompt: 'jollof', attempting: true });
    expect(stored(roomId).liveState.attempting).toBe(true);

    // The turn ends, and the roast that follows it.
    const done = await call(roomId, { action: 'complete_voice_turn', pointsEarned: 100 }, performer);
    expect(done.status).toBe(200);
    const roast = await call(roomId, { action: 'finish_roast' }, performer);
    expect(roast.status).toBe(200);

    // Whoever is next, and whatever comes next, starts clean.
    expect(stored(roomId).liveState ?? null).toBeNull();
  });
});
