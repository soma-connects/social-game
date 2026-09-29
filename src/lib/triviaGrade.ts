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

import { soundsLike } from './wordMatch';

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
      if (soundsLike(heardWords.slice(start, start + size).join(' '), target)) {
        return { correct: true, matched: candidate, how: 'close' };
      }
    }
  }
  return { correct: false };
}
