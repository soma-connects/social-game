import { STARTING_LIVES } from './gameRules';
import type { AiMasterState, Player } from './types';

/**
 * What the AI Master says, and what it is told before it says it.
 *
 * The model can be slow, out of quota, or missing its key, and the round has to
 * go on. Everything here is the floor under it: lines that still sound like
 * somebody is paying attention, and the facts that let the model do better than
 * a generic cheer when it is there.
 */

type Line = (name: string) => string;

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export type LineKind = 'survived' | 'bombed' | 'dodged' | 'eliminated' | 'skipped' | 'redirected' | 'spotlight' | 'life';

const LINES: Record<LineKind, Line[]> = {
  survived: [
    (n) => `${n} pulls it off. I am annoyed about it.`,
    (n) => `Fine. ${n} earned that one. Do not let it go to your head.`,
    (n) => `${n} survives. The room has spoken, and it sounded tired.`,
  ],
  bombed: [
    (n) => `${n} bombed it. That cost you a life, and I am not sorry.`,
    (n) => `The room heard ${n} out and voted with its whole chest. Ouch.`,
    (n) => `${n} tried. That is the nicest thing I can say.`,
  ],
  dodged: [
    (n) => `${n} said nothing at all. Bold strategy, zero points.`,
    (n) => `Silence from ${n}. I have had better conversations with the wifi.`,
    (n) => `${n} ghosted the round. No points, no penalty, and no dignity.`,
  ],
  eliminated: [
    (n) => `That is the end of the road for ${n}. You may stay and judge everyone else.`,
    (n) => `${n} is out. Somebody light a candle, and then keep voting.`,
    (n) => `No lives left for ${n}. The exit is behind you, and so is the crowd.`,
  ],
  skipped: [
    (n) => `${n} paid to make it go away. Money talks, and it talked fast.`,
    (n) => `${n} bought their way out. The rest of you can watch that sink in.`,
  ],
  redirected: [
    (n) => `${n} paid good money to make this somebody else's problem.`,
    (n) => `${n} just handed their homework to a friend. Friendship is expensive.`,
  ],
  spotlight: [
    (n) => `${n} paid me to pick on someone. I would say I was above it, but I am not.`,
    (n) => `${n} has bought a victim. The rest of you should look busy.`,
  ],
  life: [
    (n) => `${n} bought a heart back. I hope it was worth every point.`,
    (n) => `${n} is back from the brink, and a lot poorer for it.`,
  ],
};

/** A canned line for when the model is not there. Varied, and always about somebody. */
export function fallbackLine(kind: LineKind, name: string): string {
  return pick(LINES[kind])(name);
}

const HISTORY_LENGTH = 5;

/** Records what the host just said, so the next line can avoid repeating it. */
export function rememberHostLine(state: AiMasterState, line: string | undefined): void {
  const text = (line ?? '').trim();
  if (!text) return;
  state.hostHistory = [...(state.hostHistory ?? []), text].slice(-HISTORY_LENGTH);
}

/**
 * What the host knows, in plain sentences.
 *
 * "Congratulate Ada" gets a stock line. "Ada is on one life and 40 points and
 * you have it in for her" gets a joke about Ada. The state is all already on the
 * server; this only puts it in front of the model.
 */
export function hostFacts(players: Player[], state: AiMasterState | null | undefined, extra: string[] = []): string {
  const rows = players.map((p) => {
    const notes = [
      p.eliminated ? 'OUT of the game' : `${p.lives ?? STARTING_LIVES} of ${STARTING_LIVES} lives`,
      `${p.score ?? 0} points`,
    ];
    if (state && !p.eliminated && p.id === state.grudgeId) notes.push('you have it in for them');
    if (state && !p.eliminated && p.id === state.favorId) notes.push('you are soft on them');
    return `- ${p.name}: ${notes.join(', ')}`;
  });

  const recent = (state?.hostHistory ?? []).slice(-4);
  return [
    `This is round ${state?.round ?? 1}.`,
    'The players:',
    ...rows,
    ...extra,
    recent.length > 0
      ? `Your last few lines were: ${recent.map((l) => `"${l}"`).join(' / ')}. Do not reuse their openings, jokes or phrasing.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** What the person said, cleaned of the placeholder the client sends for silence. */
export function spokenAnswer(response: string | undefined): string {
  const said = (response ?? '').trim();
  return said === '(said nothing)' ? '' : said;
}
