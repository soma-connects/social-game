import { editDistance, foldForSound, soundsLike } from './wordMatch';

/**
 * Which falling word the player just said.
 *
 * The three-letter words are the hardest to get across: there is no room for a
 * near miss in "sun", so an accent that makes it "son" is simply a miss. Those
 * carry a short list of the ways a recogniser tends to write them instead. The
 * game only ever asks about words that are on screen, which is what keeps a list
 * like this safe: "sap" is only a hit for ZAP while a ZAP is falling.
 */
const HEARD_AS: Record<string, string[]> = {
  SUN: ['son', 'sunn', 'san'],
  ICE: ['eyes', 'ais', 'ace', 'eyce'],
  ZAP: ['zab', 'sap', 'zaf', 'jap'],
};

/**
 * Picks the on-screen word that `heard` refers to, or null.
 *
 * An exact word always wins. Otherwise it has to sound like exactly one of the
 * words on screen — if two are equally close it is ambiguous, and firing on
 * either would destroy something the player did not call.
 */
export function matchAsteroidWord(heard: string, onScreen: string[]): string | null {
  const said = heard.toLowerCase().replace(/[^a-z]/g, '');
  if (!said) return null;

  const words = [...new Set(onScreen.map((w) => w.toUpperCase()))];

  const exact = words.find((w) => w.toLowerCase() === said);
  if (exact) return exact;

  const aliased = words.find((w) => HEARD_AS[w]?.includes(said));
  if (aliased) return aliased;

  const close = words.filter((w) => soundsLike(said, w));
  if (close.length === 0) return null;
  if (close.length === 1) return close[0];

  const distances = close.map((w) => ({ w, d: editDistance(foldForSound(said), foldForSound(w)) })).sort((a, b) => a.d - b.d);
  return distances[0].d < distances[1].d ? distances[0].w : null;
}
