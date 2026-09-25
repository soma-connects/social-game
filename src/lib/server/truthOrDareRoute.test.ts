import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the real room API for Truth or Dare, with only storage replaced.
 *
 * The rules for the room's own ideas are unit-tested on their own. What those
 * cannot show is the part that matters to a player: that the room document
 * never carries what somebody wrote, that the public-room block holds on the
 * server rather than just in the sheet, and that a drawn prompt gives away only
 * itself. Those only exist once the handlers are wired together.
 */

const store = vi.hoisted(() => ({
  rooms: new Map<string, unknown>(),
  secrets: new Map<string, { tokens: Record<string, string>; truthOrDareIdeas?: unknown[] }>(),
}));

vi.mock('@/lib/firebase/server', () => ({
  verifyUid: async () => null,
  adminDb: {},
}));

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

// Storage is the only thing swapped out. Rooms are cloned on the way in and out,
// as a database would, so a handler that forgot to write something down cannot
// pass by mutating an object the test is also holding. Secrets hand back the
// same object every time, like the real per-process cache does.
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
import { TRUTH_OR_DARE_BLOCKED_MESSAGE } from '@/lib/gameRules';

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

/** A room with a host and one guest, both in the lobby. */
async function lobby() {
  const roomId = `TD${++counter}`;
  const created = await call(roomId, { action: 'create', playerName: 'Host' });
  const host: Who = { id: created.body.playerId, token: created.body.token };
  const joined = await call(roomId, { action: 'join', playerName: 'Ada' });
  const ada: Who = { id: joined.body.playerId, token: joined.body.token };
  return { roomId, host, ada };
}

const add = (roomId: string, who: Who, type: 'truth' | 'dare', text: string) =>
  call(roomId, { action: 'truth_or_dare_add_idea', type, text }, who);

const mine = async (roomId: string, who: Who) => (await call(roomId, { action: 'truth_or_dare_my_ideas' }, who)).body.ideas;

const storedRoom = (roomId: string) => JSON.stringify(store.rooms.get(roomId));

beforeEach(() => {
  store.rooms.clear();
  store.secrets.clear();
});

describe('the room’s own ideas', () => {
  it('keeps what people wrote out of the room document, and says only how many', async () => {
    const { roomId, ada } = await lobby();

    const result = await add(roomId, ada, 'truth', 'What is the secret ingredient?');
    expect(result.status).toBe(200);

    // The response the player gets, and everything the room will ever store:
    // neither may carry the words or the author.
    expect(JSON.stringify(result.body.room)).not.toContain('secret ingredient');
    expect(storedRoom(roomId)).not.toContain('secret ingredient');
    expect(storedRoom(roomId)).not.toContain('authorId');
    expect(result.body.room.truthOrDareIdeas).toEqual({ truth: 1, dare: 0 });

    // It is somewhere the room cannot read — with its author.
    const secrets = store.secrets.get(roomId)!;
    expect(secrets.truthOrDareIdeas).toEqual([
      expect.objectContaining({ text: 'What is the secret ingredient?', authorId: ada.id }),
    ]);
  });

  it('shows each player their own ideas and nobody else’s', async () => {
    const { roomId, host, ada } = await lobby();
    await add(roomId, host, 'truth', 'Host wrote this truth');
    await add(roomId, ada, 'dare', 'Ada wrote this dare');

    expect((await mine(roomId, host)).map((i: { text: string }) => i.text)).toEqual(['Host wrote this truth']);
    expect((await mine(roomId, ada)).map((i: { text: string }) => i.text)).toEqual(['Ada wrote this dare']);
  });

  it('lets any player add, though only the host may change the settings', async () => {
    const { roomId, ada } = await lobby();
    expect((await add(roomId, ada, 'truth', 'Anyone can bring one')).status).toBe(200);

    const settings = await call(roomId, { action: 'update_truth_or_dare_settings', promptSource: 'players' }, ada);
    expect(settings.status).toBe(403);
  });

  it('will not add on behalf of somebody else, whatever the body claims', async () => {
    const { roomId, host, ada } = await lobby();
    // The caller is whoever the token says. A body naming somebody else is ignored.
    await call(roomId, { action: 'truth_or_dare_add_idea', type: 'truth', text: 'Written by Ada', playerId: host.id, authorId: host.id }, ada);
    expect(await mine(roomId, host)).toEqual([]);
    expect(await mine(roomId, ada)).toHaveLength(1);
  });

  it('removes your own idea, and leaves everybody else’s alone', async () => {
    const { roomId, host, ada } = await lobby();
    const hostIdea = (await add(roomId, host, 'truth', 'This one is the host’s')).body.ideas[0];
    const adaIdea = (await add(roomId, ada, 'truth', 'This one is Ada’s')).body.ideas[0];

    const tryStealing = await call(roomId, { action: 'truth_or_dare_remove_idea', ideaId: hostIdea.id }, ada);
    expect(tryStealing.status).toBe(200);
    expect(tryStealing.body.room.truthOrDareIdeas).toEqual({ truth: 2, dare: 0 });

    const own = await call(roomId, { action: 'truth_or_dare_remove_idea', ideaId: adaIdea.id }, ada);
    expect(own.body.room.truthOrDareIdeas).toEqual({ truth: 1, dare: 0 });
    expect(own.body.ideas).toEqual([]);
    expect(await mine(roomId, host)).toHaveLength(1);
  });

  it('treats saying the same thing twice as done, not as an error', async () => {
    // Room actions are replayed when two writes collide; a replayed add must not
    // come back as a failure for something that already worked.
    const { roomId, ada } = await lobby();
    const first = await add(roomId, ada, 'dare', 'Do your best robot');
    const again = await add(roomId, ada, 'dare', 'Do your best robot');
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.body.room.truthOrDareIdeas).toEqual({ truth: 0, dare: 1 });
  });

  it('refuses nonsense with a reason the player can read', async () => {
    const { roomId, ada } = await lobby();
    const empty = await add(roomId, ada, 'truth', '   ');
    expect(empty.status).toBe(400);
    expect(empty.body.error).toMatch(/write something/i);

    const noType = await call(roomId, { action: 'truth_or_dare_add_idea', type: 'confession', text: 'A fine idea' }, ada);
    expect(noType.status).toBe(400);
  });

  it('only takes ideas in the lobby', async () => {
    const { roomId, host, ada } = await lobby();
    await call(roomId, { action: 'truth_or_dare_start' }, host);

    const late = await add(roomId, ada, 'truth', 'Too late for this one');
    expect(late.status).toBe(409);
  });
});

describe('public rooms', () => {
  it('will not take ideas, or start, in a room that is listed', async () => {
    const { roomId, host, ada } = await lobby();
    await call(roomId, { action: 'set_visibility', isPublic: true }, host);

    const idea = await add(roomId, ada, 'truth', 'Strangers should not be writing these');
    expect(idea.status).toBe(409);
    expect(idea.body.error).toBe(TRUTH_OR_DARE_BLOCKED_MESSAGE);

    const start = await call(roomId, { action: 'truth_or_dare_start' }, host);
    expect(start.status).toBe(409);
    expect(start.body.error).toBe(TRUTH_OR_DARE_BLOCKED_MESSAGE);
    expect((store.rooms.get(roomId) as { phase: string }).phase).toBe('lobby');
  });

  it('stays closed after the host delists it — the strangers already had a way in', async () => {
    const { roomId, host } = await lobby();
    await call(roomId, { action: 'set_visibility', isPublic: true }, host);
    await call(roomId, { action: 'set_visibility', isPublic: false }, host);

    const start = await call(roomId, { action: 'truth_or_dare_start' }, host);
    expect(start.status).toBe(409);
  });

  it('tells a public room why before it tells it to find a friend', async () => {
    const roomId = `TD${++counter}`;
    const created = await call(roomId, { action: 'create', playerName: 'Solo' });
    const host: Who = { id: created.body.playerId, token: created.body.token };
    await call(roomId, { action: 'set_visibility', isPublic: true }, host);

    const start = await call(roomId, { action: 'truth_or_dare_start' }, host);
    expect(start.body.error).toBe(TRUTH_OR_DARE_BLOCKED_MESSAGE);
  });

  it('still starts in a private room', async () => {
    const { roomId, host } = await lobby();
    const start = await call(roomId, { action: 'truth_or_dare_start' }, host);
    expect(start.status).toBe(200);
    expect(start.body.room.phase).toBe('truth_or_dare_round');
  });
});

describe('where prompts come from', () => {
  it('keeps the source the host chose when an older tab saves settings without one', async () => {
    const { roomId, host } = await lobby();
    await call(roomId, { action: 'update_truth_or_dare_settings', categories: ['silly'], promptSource: 'players' }, host);

    const older = await call(roomId, { action: 'update_truth_or_dare_settings', categories: ['deep'], selectionModes: ['card'] }, host);
    expect(older.body.room.truthOrDareSettings).toMatchObject({ categories: ['deep'], promptSource: 'players' });

    const junk = await call(roomId, { action: 'update_truth_or_dare_settings', categories: ['deep'], promptSource: 'everything' }, host);
    expect(junk.body.room.truthOrDareSettings.promptSource).toBe('players');
  });

  /** Sets the room up to play a card round on the given source, and returns who is up. */
  async function startCardRound(source: 'library' | 'players' | 'both') {
    const { roomId, host, ada } = await lobby();
    await call(
      roomId,
      { action: 'update_truth_or_dare_settings', categories: ['silly'], selectionModes: ['card'], promptSource: source },
      host
    );
    await add(roomId, ada, 'truth', 'Ada’s first truth for the room');
    await add(roomId, ada, 'truth', 'Ada’s second truth for the room');
    await add(roomId, host, 'truth', 'The host’s own truth for the room');
    const ideas = ['Ada’s first truth for the room', 'Ada’s second truth for the room', 'The host’s own truth for the room'];

    const started = await call(roomId, { action: 'truth_or_dare_start' }, host);
    const callerId: string = started.body.room.truthOrDareState.callerId;
    const caller = callerId === host.id ? host : ada;
    return { roomId, caller, ideas };
  }

  async function drawTruth(roomId: string, caller: Who) {
    // A card round: the caller flips their own card, then answers it.
    const selected = await call(roomId, { action: 'truth_or_dare_select' }, caller);
    expect(selected.status).toBe(200);
    return call(roomId, { action: 'truth_or_dare_choose', choice: 'truth' }, caller);
  }

  it('draws the room’s own idea when the source is the players, and gives away only that one', async () => {
    const { roomId, caller, ideas } = await startCardRound('players');
    const drawn = await drawTruth(roomId, caller);
    expect(drawn.status).toBe(200);

    const state = drawn.body.room.truthOrDareState;
    expect(state.promptOrigin).toBe('player');
    expect(state.category).toBeNull();
    expect(state.spicy).toBe(false);
    expect(ideas).toContain(state.promptText);

    // The room now knows the one that was drawn, and none of the ones still to come.
    const shown = JSON.stringify(drawn.body.room);
    for (const idea of ideas) {
      if (idea === state.promptText) expect(shown).toContain(idea);
      else expect(shown).not.toContain(idea);
    }
    expect(storedRoom(roomId)).not.toContain('authorId');
  });

  it('draws from the built-in deck when that is the source, ideas or not', async () => {
    const { roomId, caller, ideas } = await startCardRound('library');
    const drawn = await drawTruth(roomId, caller);

    const state = drawn.body.room.truthOrDareState;
    expect(state.promptOrigin).toBe('library');
    expect(state.category).toBe('silly');
    expect(ideas).not.toContain(state.promptText);
  });
});
