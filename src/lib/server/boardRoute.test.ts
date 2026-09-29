import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the real room API for the board game's rounds, with only storage
 * replaced: what a round does to the people who played it, and where trivia
 * comes from.
 */

const store = vi.hoisted(() => ({
  rooms: new Map<string, any>(),
  secrets: new Map<string, { tokens: Record<string, string>; triviaAnswer?: string; triviaAccepted?: string[] }>(),
  aiTrivia: { calls: 0 },
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
  // Counted, so a test can prove the board's trivia never asks the model.
  generateTriviaFromAi: async () => {
    store.aiTrivia.calls++;
    return null;
  },
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

/** A board match under way with a host and a guest; the host has the first turn. */
async function boardMatch() {
  const roomId = `BD${++counter}`;
  const created = await call(roomId, { action: 'create', playerName: 'Host' });
  const host: Who = { id: created.body.playerId, token: created.body.token };
  const joined = await call(roomId, { action: 'join', playerName: 'Ada' });
  const ada: Who = { id: joined.body.playerId, token: joined.body.token };
  const started = await call(roomId, { action: 'start_match' }, host);
  expect(started.status).toBe(200);
  return { roomId, host, ada };
}

const room = (roomId: string) => store.rooms.get(roomId);
const player = (roomId: string, id: string) => room(roomId).players.find((p: any) => p.id === id);

beforeEach(() => {
  store.rooms.clear();
  store.secrets.clear();
  store.aiTrivia.calls = 0;
});

describe('a bad mini-game round', () => {
  it('costs no life — lives are for attacks and mines', async () => {
    const { roomId, host } = await boardMatch();
    expect(player(roomId, host.id).lives).toBe(3);

    // Scoring nothing at all, which used to take a life.
    const res = await call(roomId, { action: 'complete_voice_turn', pointsEarned: 0 }, host);

    expect(res.status).toBe(200);
    expect(player(roomId, host.id).lives).toBe(3);
    expect(JSON.stringify(room(roomId).events)).not.toMatch(/bombed|life|lives/i);
  });

  it('still counts as a bombed round in the match stats', async () => {
    const { roomId, host } = await boardMatch();
    await call(roomId, { action: 'complete_voice_turn', pointsEarned: 0 }, host);
    expect(player(roomId, host.id).bombs).toBe(1);
  });

  it('keeps every life through repeated bad rounds', async () => {
    const { roomId, host } = await boardMatch();
    for (let i = 0; i < 3; i++) {
      const r = room(roomId);
      // Put the host back on the mic each time.
      r.phase = 'qualifying_voice';
      r.activePlayerIndex = 0;
      r.currentMiniGame = 'voice_arena';
      store.rooms.set(roomId, r);
      await call(roomId, { action: 'complete_voice_turn', pointsEarned: 0 }, host);
    }
    expect(player(roomId, host.id).lives).toBe(3);
    expect(player(roomId, host.id).boardPosition).toBe(0);
  });

  it('tells the recap when the mic never opened, and nothing more', async () => {
    const { roomId, host } = await boardMatch();
    const res = await call(roomId, { action: 'complete_voice_turn', pointsEarned: 0, micFault: true }, host);
    expect(res.body.result.micFaultForgiven).toBe(true);
    expect(player(roomId, host.id).lives).toBe(3);
  });
});

describe('the board’s trivia', () => {
  it('comes from the question bank and never asks the model', async () => {
    const { roomId, host } = await boardMatch();

    const res = await call(roomId, { action: 'trivia_generate' }, host);

    expect(res.status).toBe(200);
    expect(res.body.room.triviaState.question.length).toBeGreaterThan(5);
    expect(store.aiTrivia.calls).toBe(0);
  });

  it('keeps the answer off the wire until the reveal', async () => {
    const { roomId, host } = await boardMatch();
    await call(roomId, { action: 'trivia_generate' }, host);
    const answer = store.secrets.get(roomId)!.triviaAnswer!;

    expect(JSON.stringify(room(roomId).triviaState)).not.toContain(answer);
  });

  it('marks a right answer right, and one the accent bent still right', async () => {
    const { roomId, host } = await boardMatch();
    await call(roomId, { action: 'trivia_generate' }, host);
    const secrets = store.secrets.get(roomId)!;
    // A known answer, so the test does not depend on which question was drawn.
    secrets.triviaAnswer = 'Lagos';
    secrets.triviaAccepted = ['lagos'];

    const res = await call(roomId, { action: 'trivia_answer', answerText: "I think it's Legos" }, host);

    expect(res.body.isCorrect).toBe(true);
  });

  it('marks a different answer wrong, and silence wrong', async () => {
    for (const said of ['Kenya', '']) {
      const { roomId, host } = await boardMatch();
      await call(roomId, { action: 'trivia_generate' }, host);
      const secrets = store.secrets.get(roomId)!;
      secrets.triviaAnswer = 'Kano';
      secrets.triviaAccepted = ['kano'];

      const res = await call(roomId, { action: 'trivia_answer', answerText: said }, host);
      expect(res.body.isCorrect).toBe(false);
    }
  });
});
