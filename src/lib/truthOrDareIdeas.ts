import type { TruthOrDareIdea } from './types';

/**
 * The room's own truths and dares for Truth or Dare: the rules for who may add
 * what, kept apart from the server so they can be tested without one.
 *
 * The pool lives in the room's private state, not on the room document. The room
 * is public to everyone in it — a snapshot anyone can read in their browser — and
 * a pool of ideas is only worth writing if nobody can read what is coming. So the
 * room learns the counts, and an idea becomes public at the moment it is drawn.
 */

/** An idea as the server keeps it: the idea, and who wrote it. */
export type StoredTruthOrDareIdea = TruthOrDareIdea & { authorId: string };

export const TRUTH_OR_DARE_IDEA_MAX_CHARS = 160;
export const TRUTH_OR_DARE_IDEA_MIN_CHARS = 4;
/** Per player, per kind. Enough to be theirs; not enough for one person to be the deck. */
export const TRUTH_OR_DARE_IDEAS_PER_TYPE = 5;

/**
 * One line of text, capped.
 *
 * The cap is a storage rule as much as a courtesy: the pool is stored verbatim,
 * and a document over Firestore's 1 MiB limit rejects every later write to it.
 * It runs before the whitespace pass so a pasted wall of text cannot make the
 * regex do the work of the whole wall.
 */
export function cleanIdeaText(raw: unknown): string {
  return String(raw ?? '')
    .slice(0, TRUTH_OR_DARE_IDEA_MAX_CHARS * 4)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TRUTH_OR_DARE_IDEA_MAX_CHARS);
}

// A string tag rather than a boolean: this project compiles without
// strictNullChecks, and without it a boolean discriminant does not narrow.
export type AddIdeaResult =
  | { status: 'added'; pool: StoredTruthOrDareIdea[]; idea: TruthOrDareIdea }
  | { status: 'refused'; error: string };

const sameText = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

function newIdeaId(): string {
  // "idea_" keeps these from ever colliding with a library id such as t_silly_3.
  return `idea_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Adds one idea from one author.
 *
 * Saying the same thing twice is a success that changes nothing, not an error.
 * Every room action can be replayed when two writes collide, and an add that
 * failed on its own replay would tell the player it had not worked when it had.
 */
export function addIdea(
  pool: readonly StoredTruthOrDareIdea[],
  authorId: string,
  type: unknown,
  rawText: unknown,
  makeId: () => string = newIdeaId
): AddIdeaResult {
  if (type !== 'truth' && type !== 'dare') {
    return { status: 'refused', error: 'Say whether it is a truth or a dare.' };
  }

  const text = cleanIdeaText(rawText);
  if (text.length < TRUTH_OR_DARE_IDEA_MIN_CHARS) {
    return {
      status: 'refused',
      error: text.length === 0 ? 'Write something first.' : 'That is a bit short — give it a few more words.',
    };
  }

  const mine = pool.filter((i) => i.authorId === authorId && i.type === type);

  const repeat = mine.find((i) => sameText(i.text, text));
  if (repeat) return { status: 'added', pool: [...pool], idea: toIdea(repeat) };

  if (mine.length >= TRUTH_OR_DARE_IDEAS_PER_TYPE) {
    return {
      status: 'refused',
      error: `That is ${TRUTH_OR_DARE_IDEAS_PER_TYPE} ${type}s already — remove one to make room.`,
    };
  }

  const stored: StoredTruthOrDareIdea = { id: makeId(), type, text, authorId };
  return { status: 'added', pool: [...pool, stored], idea: toIdea(stored) };
}

/**
 * Removes one of the caller's own ideas.
 *
 * An id that is not theirs, or is already gone, changes nothing and says
 * nothing — otherwise asking to remove ids one by one would be a way to learn
 * which ones exist.
 */
export function removeIdea(
  pool: readonly StoredTruthOrDareIdea[],
  authorId: string,
  ideaId: unknown
): StoredTruthOrDareIdea[] {
  return pool.filter((i) => !(i.id === ideaId && i.authorId === authorId));
}

function toIdea({ id, type, text }: StoredTruthOrDareIdea): TruthOrDareIdea {
  return { id, type, text };
}

/** What one player is allowed to see of the pool: their own ideas, in the order they wrote them. */
export function ideasBy(pool: readonly StoredTruthOrDareIdea[], authorId: string): TruthOrDareIdea[] {
  return pool.filter((i) => i.authorId === authorId).map(toIdea);
}

/** The pool with its authors taken off — the shape the draw works from. */
export function withoutAuthors(pool: readonly StoredTruthOrDareIdea[]): TruthOrDareIdea[] {
  return pool.map(toIdea);
}

/** The only thing about the pool the room itself is told. */
export function countIdeas(pool: readonly StoredTruthOrDareIdea[]): { truth: number; dare: number } {
  let truth = 0;
  let dare = 0;
  for (const idea of pool) {
    if (idea.type === 'truth') truth++;
    else dare++;
  }
  return { truth, dare };
}
