import { MINIGAME_LABELS } from './gameRules';
import type { MiniGameId } from './types';

/**
 * Where a room was, in words a person reads.
 *
 * Its own module because two very different places need it: the analytics
 * code on the server, and the feedback queue in the browser. The analytics
 * module imports the Firestore admin SDK, which must never reach a browser
 * bundle, so the labels cannot live there.
 */

/**
 * Plain names for the room phases, for anywhere a person reads them.
 *
 * Phase ids are written for the code — `powerup_shop`, `roast_intermission` —
 * and a chart of "where games die" labelled with them reads as a stack trace.
 * Mini-game phases are named from MINIGAME_LABELS instead, so they stay in step
 * with what the game calls them on screen.
 */
const PHASE_LABELS: Record<string, string> = {
  lobby: 'Lobby',
  powerup_shop: 'Power-up shop',
  roadmap_turn: 'Rolling on the board',
  branch_choice: 'Choosing a route',
  peer_dare: 'Peer dare',
  roast_intermission: 'Roast lounge',
  team_battle_select: 'Team Battle setup',
  team_battle_intro: 'Team Battle intro',
  team_battle_recap: 'Team Battle recap',
  chess_match: 'Chess',
  ludo_match: 'Ludo',
  ai_master_round: 'AI Master',
  truth_or_dare_round: 'Truth or Dare',
  game_over: 'Game over screen',
  qualifying_voice: 'Voice Arena',
  'ai_master:announcing': 'AI Master: taking the challenge',
  'ai_master:responding': 'AI Master: answering',
  'ai_master:voting': 'AI Master: the room voting',
  'ai_master:verdict': 'AI Master: verdict',
  'truth_or_dare:selecting': 'Truth or Dare: spinning',
  'truth_or_dare:choosing': 'Truth or Dare: picking truth or dare',
  'truth_or_dare:prompt': 'Truth or Dare: answering',
  'truth_or_dare:resolved': 'Truth or Dare: between turns',
};

/**
 * Where a room was, in words.
 *
 * Inside a mini-game, the mini-game is the useful name: "Trivia Showdown" says
 * what to fix, "qualifying_voice" does not. Only inside one, though —
 * `currentMiniGame` stays set after the game is over, so reading it whenever it
 * is present would report a room that died in the shop as dying in whatever
 * was played before the shop.
 */
export function placeLabel(phase: string | null | undefined, miniGame?: string | null): string {
  if (!phase) return 'Unknown';
  const inMiniGame = phase === 'qualifying_voice' || phase in MINIGAME_LABELS;
  if (inMiniGame && miniGame) return MINIGAME_LABELS[miniGame as MiniGameId] ?? miniGame;
  return PHASE_LABELS[phase] ?? MINIGAME_LABELS[phase as MiniGameId] ?? phase;
}
