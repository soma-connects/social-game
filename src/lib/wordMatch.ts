/**
 * Deciding whether what a recogniser wrote is what the player said.
 *
 * A recogniser does not return what was meant; it returns its best guess at
 * what it heard, and with a Nigerian accent that guess is often a near miss:
 * "tunder" for thunder, "feenix" for phoenix, "Legos" for Lagos. Demanding an
 * exact word made those rounds unwinnable, which reads to the player as the game
 * not listening. This accepts a near miss, but stays tight enough that a
 * different word is still a different word.
 */

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  let curr = new Array<number>(a.length + 1);
  for (let i = 1; i <= b.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j - 1] + cost, curr[j - 1] + 1, prev[j] + 1);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

/**
 * Spellings folded together where accents make the sounds interchangeable.
 * Applied to both sides before they are compared, so it can only make two
 * words closer, never invent a match out of thin air.
 */
export function foldForSound(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/ck/g, 'k')
    // Hard and soft c: "kristal" for crystal, "akra" for Accra, "sity" for city.
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    // x is the two sounds k and s, and a final y is an i: "galaksi" for galaxy.
    .replace(/x/g, 'ks')
    .replace(/y\b/g, 'i')
    .replace(/\bkn/g, 'n')
    .replace(/\bwh/g, 'w')
    // Word-final -er, -or and -ar are one sound to a listener without a rolled r:
    // "thunda" for thunder, "docta" for doctor.
    .replace(/(er|or|ar)\b/g, 'a');
}

/**
 * How alike two words must be, by how long the target is.
 *
 * Short words have no room for error: one wrong letter in "oil" is a different
 * word. From four letters a single slip is allowed, and long names two, since
 * that is where an accent does its work.
 */
export function requiredSimilarity(letters: number): number | null {
  if (letters <= 3) return null;
  return letters <= 7 ? 0.75 : 0.72;
}

/** Whether `heard` is close enough to `target` to be taken for it. */
export function soundsLike(heard: string, target: string): boolean {
  const h = foldForSound(heard);
  const t = foldForSound(target);
  if (!h || !t) return false;
  if (h === t) return true;

  // Room is judged on the word as it was written, not as folded: folding
  // "moon" or "thin" makes them shorter, which would take their room away.
  const need = requiredSimilarity(target.replace(/\s/g, '').length);
  if (need === null) return false;
  // The first letter is the one an accent rarely changes, and it stops
  // unrelated words that happen to share a tail from matching.
  if (h[0] !== t[0]) return false;
  return 1 - editDistance(h, t) / Math.max(h.length, t.length) >= need;
}
