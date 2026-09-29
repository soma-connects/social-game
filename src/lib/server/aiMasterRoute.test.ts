import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the real room API for the AI Master, with storage and the model
 * replaced.
 *
 * The shop and the host's lines are unit-tested on their own. What only shows up
 * once the handlers are wired together is what a round actually does to the
 * people in it: who is congratulated, who loses a life, who pays what, and that
 * the host is handed the words that were said rather than a cheer to read out.
 */

const store = vi.hoisted(() => ({
  rooms: new Map<string, any>(),
  secrets: new Map<string, { tokens: Record<string, string> }>(),
  asked: [] as { task: string; options: any }[],
  challenges: [] as { name: string; options: any; style: any; others: string[] }[],
  judged: [] as { input: any; options: any }[],
  /** What the AI Master rules; null is "could not rule", so the room's vote decides. */
  judgement: null as null | { pass: boolean; line: string },
  /** How many of the next room writes should lose a race, forcing the request to replay. */
  failWrites: 0,
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
  coerceVibe: (vibe: unknown) => vibe ?? 'classic_party',
  askHost: async (_vibe: unknown, task: string, options: unknown) => {
    store.asked.push({ task, options });
    return 'MODEL LINE';
  },
  generateChallenge: async (_vibe: unknown, _category: unknown, name: string, options: unknown, style: unknown, others: string[]) => {
    store.challenges.push({ name, options, style, others });
    return { challenge: `Confess something, ${name}`, hostLine: `Calling ${name}` };
  },
  judgeAnswer: async (_vibe: unknown, input: unknown, options: unknown) => {
    store.judged.push({ input, options });
    return store.judgement;
  },
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
      if (store.failWrites > 0) {
        store.failWrites--;
        throw new actual.RoomConflictError(room.roomId);
      }
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
import { forgetAll } from '@/lib/server/hostMemo';
import { CHALLENGE_STYLES } from '@/lib/challengeStyles';

type Who = { id: string; token: string; name: string };

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

/** Host, Ada and Ben in a room, with the AI Master running. */
async function match() {
  const roomId = `AM${++counter}`;
  const created = await call(roomId, { action: 'create', playerName: 'Host' });
  const host: Who = { id: created.body.playerId, token: created.body.token, name: 'Host' };
  const people: Who[] = [host];
  for (const name of ['Ada', 'Ben']) {
    const joined = await call(roomId, { action: 'join', playerName: name });
    people.push({ id: joined.body.playerId, token: joined.body.token, name });
  }
  const started = await call(roomId, { action: 'ai_master_start' }, host);
  expect(started.status).toBe(200);
  const [, ada, ben] = people;
  return { roomId, host, ada, ben, people };
}

const room = (roomId: string) => store.rooms.get(roomId);
const state = (roomId: string) => room(roomId).aiMasterState;
const playerOf = (roomId: string, id: string) => room(roomId).players.find((p: any) => p.id === id);
/** Whoever the host called out this round. */
const targetOf = (roomId: string, people: Who[]) => people.find((p) => p.id === state(roomId).targetId)!;
const others = (roomId: string, people: Who[]) => people.filter((p) => p.id !== state(roomId).targetId);

beforeEach(() => {
  store.rooms.clear();
  store.secrets.clear();
  store.asked.length = 0;
  store.challenges.length = 0;
  store.judged.length = 0;
  store.judgement = null;
  store.failWrites = 0;
  forgetAll();
});

describe('starting the match', () => {
  it('gives everybody the same purse, whatever the room played before', async () => {
    const roomId = `AM${++counter}`;
    const created = await call(roomId, { action: 'create', playerName: 'Host' });
    const host: Who = { id: created.body.playerId, token: created.body.token, name: 'Host' };
    await call(roomId, { action: 'join', playerName: 'Ada' });
    const r = room(roomId);
    r.players[0].score = 9999;
    r.players[1].score = 3;
    store.rooms.set(roomId, r);

    await call(roomId, { action: 'ai_master_start' }, host);
    expect(room(roomId).players.map((p: any) => p.score)).toEqual([100, 100]);
  });

  it('does not end the match before it begins because a phone was in the background', async () => {
    const roomId = `AM${++counter}`;
    const created = await call(roomId, { action: 'create', playerName: 'Host' });
    const host: Who = { id: created.body.playerId, token: created.body.token, name: 'Host' };
    await call(roomId, { action: 'join', playerName: 'Ada' });
    const r = room(roomId);
    r.players[1].connected = false; // off copying the invite link
    store.rooms.set(roomId, r);

    const res = await call(roomId, { action: 'ai_master_start' }, host);

    // Refused with a reason, not started and instantly won by whoever was left.
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Ada');
    expect(room(roomId).phase).not.toBe('game_over');
    expect(room(roomId).winner).toBeNull();
  });

  it('opens on a round, with the host told who is in the room', async () => {
    const { roomId } = await match();
    expect(room(roomId).phase).toBe('ai_master_round');
    expect(state(roomId).round).toBe(1);
    const facts = store.challenges[0].options.facts as string;
    expect(facts).toContain('Ada: 3 of 3 lives, 100 points');
    expect(facts).toContain('Ben');
  });
});

describe('a round nobody answered', () => {
  it('is not congratulated: the host is told they said nothing, and nothing is paid or taken', async () => {
    const { roomId, host, people } = await match();
    const target = targetOf(roomId, people);
    const before = { ...playerOf(roomId, target.id) };

    // The clock runs out with no answer and no vote — the host forces the verdict.
    await call(roomId, { action: 'ai_master_verdict' }, host);

    expect(state(roomId).phase).toBe('verdict');
    expect(state(roomId).outcome).toBe('dodged');
    expect(state(roomId).passed).toBe(false);
    expect(playerOf(roomId, target.id).score).toBe(before.score);
    expect(playerOf(roomId, target.id).lives).toBe(before.lives);

    const task = store.asked.at(-1)!.task;
    expect(task).toContain('no answer at all');
    expect(task).toContain('Do not congratulate');
  });

  it('is still a dodge if the room voted anyway, and the votes move nothing', async () => {
    const { roomId, host, people } = await match();
    const target = targetOf(roomId, people);
    const voter = others(roomId, people)[0];
    await call(roomId, { action: 'ai_master_respond', response: '(said nothing)' }, target);
    await call(roomId, { action: 'ai_master_vote', verdict: 'fail' }, voter);
    await call(roomId, { action: 'ai_master_verdict' }, host);

    expect(state(roomId).outcome).toBe('dodged');
    expect(playerOf(roomId, target.id).lives).toBe(3);
    expect(playerOf(roomId, target.id).score).toBe(100);
    // Nothing was said, so there is nothing for the AI Master to rule on.
    expect(store.judged).toHaveLength(0);
  });
});

describe('a round somebody answered', () => {
  it('shows the host the actual words and the tally when they survive', async () => {
    const { roomId, people } = await match();
    const target = targetOf(roomId, people);
    await call(roomId, { action: 'ai_master_respond', response: 'I ate the last jollof' }, target);
    const [v1, v2] = others(roomId, people);
    await call(roomId, { action: 'ai_master_vote', verdict: 'pass' }, v1);
    await call(roomId, { action: 'ai_master_vote', verdict: 'pass' }, v2);

    expect(state(roomId).outcome).toBe('survived');
    // 100 to start, +120 for surviving, and two good votes added 15 each.
    expect(playerOf(roomId, target.id).score).toBe(100 + 120 + 30);
    const task = store.asked.at(-1)!.task;
    expect(task).toContain('I ate the last jollof');
    expect(task).toContain('2 to 0');
  });

  it('costs a life and roasts the real answer when the room turns on them', async () => {
    const { roomId, people } = await match();
    const target = targetOf(roomId, people);
    await call(roomId, { action: 'ai_master_respond', response: 'I have no secrets' }, target);
    for (const voter of others(roomId, people)) await call(roomId, { action: 'ai_master_vote', verdict: 'fail' }, voter);

    expect(state(roomId).outcome).toBe('bombed');
    expect(playerOf(roomId, target.id).lives).toBe(2);
    expect(store.asked.at(-1)!.task).toContain('I have no secrets');
    expect(store.asked.at(-1)!.task).toContain('2 lives left');
  });

  it('remembers each line, and tells the host not to repeat them', async () => {
    const { roomId, people } = await match();
    const target = targetOf(roomId, people);
    await call(roomId, { action: 'ai_master_respond', response: 'Something' }, target);
    for (const voter of others(roomId, people)) await call(roomId, { action: 'ai_master_vote', verdict: 'pass' }, voter);

    expect(state(roomId).hostHistory).toContain('MODEL LINE');
    expect(store.asked.at(-1)!.options.facts).toContain('Do not reuse');
  });
});

describe('voting', () => {
  it('pays each voter once, so judging is worth doing and changing your mind is not', async () => {
    const { roomId, people } = await match();
    const [voter] = others(roomId, people);
    await call(roomId, { action: 'ai_master_respond', response: 'Something' }, targetOf(roomId, people));

    await call(roomId, { action: 'ai_master_vote', verdict: 'pass' }, voter);
    expect(playerOf(roomId, voter.id).score).toBe(110);
    await call(roomId, { action: 'ai_master_vote', verdict: 'fail' }, voter);
    expect(playerOf(roomId, voter.id).score).toBe(110);
  });
});

describe('buying from the host', () => {
  it('lets the player on the spot pay to skip, and says how it ended', async () => {
    const { roomId, people } = await match();
    const target = targetOf(roomId, people);

    const res = await call(roomId, { action: 'ai_master_buy', item: 'skip' }, target);

    expect(res.status).toBe(200);
    expect(state(roomId).outcome).toBe('skipped');
    expect(state(roomId).phase).toBe('verdict');
    expect(playerOf(roomId, target.id).score).toBe(0);
    expect(store.asked.at(-1)!.task).toContain('paid 100 points');
  });

  it('refuses a skip from anybody else, and takes nothing', async () => {
    const { roomId, people } = await match();
    const bystander = others(roomId, people)[0];
    const res = await call(roomId, { action: 'ai_master_buy', item: 'skip' }, bystander);
    expect(res.status).toBe(409);
    expect(playerOf(roomId, bystander.id).score).toBe(100);
  });

  it('shoves the challenge onto the player you choose', async () => {
    const { roomId, people } = await match();
    const target = targetOf(roomId, people);
    const [victim] = others(roomId, people);
    const r = room(roomId);
    playerOf(roomId, target.id).score = 500;
    store.rooms.set(roomId, r);

    const res = await call(roomId, { action: 'ai_master_buy', item: 'redirect', targetId: victim.id }, target);

    expect(res.status).toBe(200);
    expect(state(roomId).targetId).toBe(victim.id);
    expect(room(roomId).players[room(roomId).activePlayerIndex].id).toBe(victim.id);
    expect(playerOf(roomId, target.id).score).toBe(350);
  });

  it('cannot be spoofed: the buyer is whoever the token says', async () => {
    const { roomId, people } = await match();
    const target = targetOf(roomId, people);
    const bystander = others(roomId, people)[0];
    // Claims to be the target while holding the bystander's token.
    const res = await call(roomId, { action: 'ai_master_buy', item: 'skip', playerId: target.id }, bystander);
    expect(res.status).toBe(409);
    expect(state(roomId).phase).toBe('announcing');
  });

  it('makes a bought spotlight the next round’s victim, whatever the draw would have been', async () => {
    const { roomId, host, people } = await match();
    const target = targetOf(roomId, people);
    const buyer = others(roomId, people)[0];
    const victim = others(roomId, people)[1];
    const r = room(roomId);
    playerOf(roomId, buyer.id).score = 300;
    store.rooms.set(roomId, r);

    const bought = await call(roomId, { action: 'ai_master_buy', item: 'spotlight', targetId: victim.id }, buyer);
    expect(bought.status).toBe(200);
    expect(state(roomId).spotlight.target).toBe(victim.id);

    await call(roomId, { action: 'ai_master_respond', response: 'Something' }, target);
    await call(roomId, { action: 'ai_master_verdict' }, host);
    await call(roomId, { action: 'ai_master_next_round' }, host);

    expect(state(roomId).round).toBe(2);
    expect(state(roomId).targetId).toBe(victim.id);
    expect(state(roomId).spotlight).toBeNull();
    // The host is told why, so it can say so.
    expect(store.challenges.at(-1)!.options.facts).toContain('paid 120 points to put');
  });

  it('refunds a spotlight whose victim has been knocked out', async () => {
    const { roomId, host, people } = await match();
    const target = targetOf(roomId, people);
    const buyer = others(roomId, people)[0];
    const victim = others(roomId, people)[1];
    const r = room(roomId);
    playerOf(roomId, buyer.id).score = 300;
    store.rooms.set(roomId, r);
    await call(roomId, { action: 'ai_master_buy', item: 'spotlight', targetId: victim.id }, buyer);
    expect(playerOf(roomId, buyer.id).score).toBe(180);

    const after = room(roomId);
    playerOf(roomId, victim.id).eliminated = true;
    store.rooms.set(roomId, after);
    await call(roomId, { action: 'ai_master_respond', response: 'Something' }, target);
    await call(roomId, { action: 'ai_master_verdict' }, host);
    await call(roomId, { action: 'ai_master_next_round' }, host);

    expect(playerOf(roomId, buyer.id).score).toBe(300);
  });
});

describe('calling the next round', () => {
  it('is refused while the round in front of the room is still going', async () => {
    const { roomId, host } = await match();

    const res = await call(roomId, { action: 'ai_master_next_round' }, host);

    expect(res.status).toBe(409);
    expect(state(roomId).round).toBe(1);
    expect(state(roomId).phase).toBe('announcing');
  });

  it('starts exactly one round from a verdict, however many times it is tapped', async () => {
    // Rounds were being replaced five and thirteen seconds after they began: the
    // auto-advance and a tap on NEXT ROUND each started one, and the first was
    // thrown away unfinished.
    const { roomId, host } = await match();
    await call(roomId, { action: 'ai_master_verdict' }, host);
    expect(state(roomId).phase).toBe('verdict');

    const first = await call(roomId, { action: 'ai_master_next_round' }, host);
    const second = await call(roomId, { action: 'ai_master_next_round' }, host);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(state(roomId).round).toBe(2);
    expect(state(roomId).phase).toBe('announcing');
  });
});

describe('what the server logs', () => {
  it('says which action was refused and why, without a token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { roomId, host } = await match();

    await call(roomId, { action: 'ai_master_next_round' }, host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const entry = warn.mock.calls.find((c) => c[0] === 'room action refused');
    expect(entry).toBeDefined();
    expect(entry![1]).toMatchObject({ room: roomId, action: 'ai_master_next_round', status: 409, error: 'The round is not over yet' });
    expect(JSON.stringify(entry)).not.toContain(host.token);
    warn.mockRestore();
  });

  it('records whether a player’s tab was in the foreground, so a drop can be explained', async () => {
    const { roomId, ada } = await match();

    await call(roomId, { action: 'heartbeat', visible: false }, ada);

    expect(playerOf(roomId, ada.id).lastVisible).toBe(false);
  });
});

describe('the AI Master decides who survives', () => {
  /** A round where the target has answered and the two others have voted the same way. */
  async function answered(judgement: { pass: boolean; line: string } | null, votes: 'pass' | 'fail') {
    store.judgement = judgement;
    const game = await match();
    const target = targetOf(game.roomId, game.people);
    await call(game.roomId, { action: 'ai_master_respond', response: 'I once ate a whole pot of jollof alone' }, target);
    for (const voter of others(game.roomId, game.people)) await call(game.roomId, { action: 'ai_master_vote', verdict: votes }, voter);
    return { ...game, target };
  }

  it('spares somebody the room voted against, and the votes only take points off', async () => {
    const { roomId, target } = await answered({ pass: true, line: 'Solo jollof. I respect the commitment.' }, 'fail');

    const s = state(roomId);
    expect(s.outcome).toBe('survived');
    expect(s.verdictBy).toBe('ai');
    expect(playerOf(roomId, target.id).lives).toBe(3);
    // 100 to start, +120 for surviving, and two bad votes took 15 each.
    expect(playerOf(roomId, target.id).score).toBe(100 + 120 - 30);
    expect(s.voteSwing).toBe(-30);
    expect(s.hostLine).toBe('Solo jollof. I respect the commitment.');
  });

  it('takes a life from somebody the room loved, and the votes only add points', async () => {
    const { roomId, target } = await answered({ pass: false, line: 'A pot? A spoonful, maybe. Weak.' }, 'pass');

    const s = state(roomId);
    expect(s.outcome).toBe('bombed');
    expect(s.verdictBy).toBe('ai');
    expect(playerOf(roomId, target.id).lives).toBe(2);
    // No pass bonus, but two good votes still paid 15 each.
    expect(playerOf(roomId, target.id).score).toBe(100 + 30);
    expect(s.hostLine).toBe('A pot? A spoonful, maybe. Weak.');
  });

  it('says the line the AI Master wrote about the answer, not a generic one', async () => {
    const { roomId } = await answered({ pass: true, line: 'Specific to what they said.' }, 'pass');
    expect(state(roomId).hostLine).toBe('Specific to what they said.');
    // No second model call was made to write a congratulation.
    expect(store.asked.some((a) => a.task.includes('so they survive'))).toBe(false);
  });

  it('is shown what was actually said, the challenge, and how many lives are at stake', async () => {
    await answered({ pass: true, line: 'x' }, 'pass');
    const { input } = store.judged[0];
    expect(input.answer).toBe('I once ate a whole pot of jollof alone');
    expect(input.challenge).toContain('Confess something');
    expect(input.livesLeft).toBe(3);
    expect(input.styleLabel).toBeTruthy();
  });

  it('keeps the ruling out of the room document until the reveal', async () => {
    store.judgement = { pass: false, line: 'A secret ruling line.' };
    const { roomId, people } = await match();
    await call(roomId, { action: 'ai_master_respond', response: 'Something' }, targetOf(roomId, people));

    // The room has been told the AI Master has decided - not what it decided.
    expect(state(roomId).judged).toBe(true);
    expect(state(roomId).phase).toBe('voting');
    expect(JSON.stringify(room(roomId))).not.toContain('A secret ruling line.');
    expect(store.secrets.get(roomId)).toBeDefined();
  });

  it('falls back to the room’s vote when the AI Master cannot rule', async () => {
    const { roomId, target } = await answered(null, 'fail');

    expect(state(roomId).verdictBy).toBe('room');
    expect(state(roomId).outcome).toBe('bombed');
    expect(playerOf(roomId, target.id).lives).toBe(2);
  });

  it('does not let an old ruling decide a new round', async () => {
    store.judgement = { pass: true, line: 'Round one is fine.' };
    const { roomId, host, people } = await match();
    const first = targetOf(roomId, people);
    await call(roomId, { action: 'ai_master_respond', response: 'Something' }, first);
    await call(roomId, { action: 'ai_master_verdict' }, host);
    expect(state(roomId).outcome).toBe('survived');

    // Round two: the AI Master is unreachable, so the room must decide this one.
    store.judgement = null;
    await call(roomId, { action: 'ai_master_next_round' }, host);
    const second = targetOf(roomId, people);
    await call(roomId, { action: 'ai_master_respond', response: 'Something else' }, second);
    for (const voter of others(roomId, people)) await call(roomId, { action: 'ai_master_vote', verdict: 'fail' }, voter);

    expect(state(roomId).round).toBe(2);
    expect(state(roomId).verdictBy).toBe('room');
    expect(state(roomId).outcome).toBe('bombed');
  });
});

describe('staying silent', () => {
  it('is forgiven once, but a second silent round in a row costs a life', async () => {
    const { roomId, host, people } = await match();
    const target = targetOf(roomId, people);

    // First silent round: nothing lost.
    await call(roomId, { action: 'ai_master_verdict' }, host);
    expect(state(roomId).outcome).toBe('dodged');
    expect(playerOf(roomId, target.id).lives).toBe(3);
    expect(state(roomId).dodgeStreak?.[target.id]).toBe(1);

    // The same player, silent again.
    const r = room(roomId);
    r.aiMasterState.phase = 'announcing';
    r.aiMasterState.round = 2;
    store.rooms.set(roomId, r);
    await call(roomId, { action: 'ai_master_verdict' }, host);

    expect(state(roomId).outcome).toBe('bombed');
    expect(playerOf(roomId, target.id).lives).toBe(2);
  });

  it('starts over once they speak', async () => {
    store.judgement = { pass: true, line: 'Finally.' };
    const { roomId, people } = await match();
    const target = targetOf(roomId, people);
    const r = room(roomId);
    r.aiMasterState.dodgeStreak = { [target.id]: 1 };
    store.rooms.set(roomId, r);

    await call(roomId, { action: 'ai_master_respond', response: 'I am here now' }, target);
    for (const voter of others(roomId, people)) await call(roomId, { action: 'ai_master_vote', verdict: 'pass' }, voter);

    expect(state(roomId).dodgeStreak?.[target.id]).toBe(0);
  });

  it('knocks somebody out on their last life if they go silent twice', async () => {
    const { roomId, host, people } = await match();
    const target = targetOf(roomId, people);
    const r = room(roomId);
    r.aiMasterState.dodgeStreak = { [target.id]: 1 };
    playerOf(roomId, target.id).lives = 1;
    store.rooms.set(roomId, r);

    await call(roomId, { action: 'ai_master_verdict' }, host);

    expect(playerOf(roomId, target.id).eliminated).toBe(true);
  });
});

describe('what the room is asked', () => {
  it('comes from the menu of the vibe the host picked', async () => {
    const roomId = `AM${++counter}`;
    const created = await call(roomId, { action: 'create', playerName: 'Host' });
    const host: Who = { id: created.body.playerId, token: created.body.token, name: 'Host' };
    await call(roomId, { action: 'join', playerName: 'Ada' });
    await call(roomId, { action: 'update_room_vibe', roomVibe: 'bros_hangout' }, host);
    await call(roomId, { action: 'ai_master_start' }, host);

    const asked = store.challenges[0].style;
    expect(CHALLENGE_STYLES.bros_hangout.map((s) => s.id)).toContain(asked.id);
    expect(state(roomId).styleId).toBe(asked.id);
    expect(state(roomId).styleLabel).toBe(asked.label);
  });

  it('names somebody else in the room the question may involve', async () => {
    await match();
    expect(store.challenges[0].others.length).toBe(2);
    expect(store.challenges[0].others).not.toContain(store.challenges[0].name);
  });

  it('never asks the same kind of thing two rounds running', async () => {
    const { roomId, host } = await match();
    const seen = [state(roomId).styleId];
    for (let i = 0; i < 6; i++) {
      await call(roomId, { action: 'ai_master_verdict' }, host);
      await call(roomId, { action: 'ai_master_next_round' }, host);
      seen.push(state(roomId).styleId);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
});

describe('a request that has to be replayed', () => {
  it('does not ask the model again for the next round', async () => {
    const { roomId, host } = await match();
    await call(roomId, { action: 'ai_master_verdict' }, host);
    const before = store.challenges.length;

    // Somebody else's write lands first, twice, so the request runs three times.
    store.failWrites = 2;
    const res = await call(roomId, { action: 'ai_master_next_round' }, host);

    expect(res.status).toBe(200);
    expect(state(roomId).round).toBe(2);
    expect(store.challenges.length - before).toBe(1);
  });

  it('does not ask the model to judge the same answer again', async () => {
    store.judgement = { pass: true, line: 'x' };
    const { roomId, people } = await match();

    store.failWrites = 2;
    const res = await call(roomId, { action: 'ai_master_respond', response: 'A real answer' }, targetOf(roomId, people));

    expect(res.status).toBe(200);
    expect(store.judged).toHaveLength(1);
  });

  it('does not ask again for a purchase’s line either', async () => {
    const { roomId, people } = await match();
    const target = targetOf(roomId, people);
    const r = room(roomId);
    playerOf(roomId, target.id).score = 500;
    store.rooms.set(roomId, r);
    const before = store.asked.length;

    store.failWrites = 2;
    const res = await call(roomId, { action: 'ai_master_buy', item: 'skip' }, target);

    expect(res.status).toBe(200);
    expect(store.asked.length - before).toBe(1);
  });
});

describe('who can call the next round', () => {
  it('is only the host', async () => {
    const { roomId, host, ada, ben } = await match();
    await call(roomId, { action: 'ai_master_verdict' }, host);
    const res = await call(roomId, { action: 'ai_master_next_round' }, [ada, ben].find((p) => p.id !== host.id)!);
    expect(res.status).toBe(403);
  });
});
