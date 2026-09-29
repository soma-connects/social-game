/**
 * Grades a spoken trivia answer.
 *
 * A recogniser does not hand back what the player meant; it hands back what it
 * thought it heard. With a Nigerian accent that is often a near miss — "Legos"
 * for Lagos, "Abuza" for Abuja — and grading by exact whole-word match marked
 * those wrong, which reads to the player as the game not listening.
 *
 * So an answer counts when it matches an accepted form exactly, appears as whole
 * words inside what was said ("uh, I think it's Lagos"), or is close enough to
 * one that the difference is plausibly the accent rather than a different
 * answer. "Close enough" is deliberately tight: Kano is not Kenya, and Lagos is
 * not Lagoon.
 */

export type GradeResult = { correct: boolean; matched?: string; how?: 'exact' | 'contains' | 'close' };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function distance(a: string, b: string): number {
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
 * How alike two answers must be, by how long the target is.
 *
 * Short words have no room for error: one wrong letter in "oil" is a different
 * word. From four letters a single slip is allowed, and long names two, since
 * that is where an accent does its work ("Naijeria" for Nigeria). It stops well
 * short of Niger for Nigeria, which is a different answer.
 */
function requiredSimilarity(target: string): number | null {
  const letters = target.replace(/\s/g, '').length;
  if (letters <= 3) return null;
  return letters <= 7 ? 0.75 : 0.72;
}

function isClose(heard: string, target: string): boolean {
  const need = requiredSimilarity(target);
  if (need === null) return false;
  // The first letter is the one an accent rarely changes, and it stops
  // unrelated words that happen to share a tail from matching.
  if (heard[0] !== target[0]) return false;
  const longest = Math.max(heard.length, target.length);
  return 1 - distance(heard, target) / longest >= need;
}

export function gradeSpokenAnswer(spoken: string, accepted: string[]): GradeResult {
  const heard = normalize(spoken);
  if (!heard) return { correct: false };
  const heardWords = heard.split(' ');

  for (const candidate of accepted) {
    const target = normalize(candidate);
    if (!target) continue;

    if (heard === target) return { correct: true, matched: candidate, how: 'exact' };

    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(heard)) return { correct: true, matched: candidate, how: 'contains' };

    // Slide a window the size of the answer along what was said, so a sentence
    // that contains a near miss still counts.
    const size = target.split(' ').length;
    for (let start = 0; start + size <= heardWords.length; start++) {
      if (isClose(heardWords.slice(start, start + size).join(' '), target)) {
        return { correct: true, matched: candidate, how: 'close' };
      }
    }
  }
  return { correct: false };
}
