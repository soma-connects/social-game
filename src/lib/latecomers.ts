import type { GamePhase, Player, RoomState } from './types';

/**
 * Joining a room whose match has already started.
 *
 * The room used to take a newcomer straight into whatever was running. The
 * join screen never said a match was on, and the next turn could land on
 * someone who had not seen a single rule: in a playtest, a guest who joined
 * during the board game was handed Asteroid Defense seconds later.
 *
 * A newcomer now watches first. The board game is played in rounds (everyone
 * plays a mini-game, shops, then rolls), so they come in when the next round
 * starts. Every other mode seats its players when it starts (chess and Ludo
 * boards, AI Master lives, Team Battle crews, the Truth or Dare circle), so
 * there they wait for the next match.
 *
 * Shared by the room API, which enforces it, and the screens, which explain it.
 */

/** Phases with no match being played: whoever arrives now is in the next one. */
const BETWEEN_MATCHES = new Set<GamePhase>(['lobby', 'game_over', 'team_battle_select', 'team_battle_recap']);

type MatchView = Pick<RoomState, 'phase' | 'roomType' | 'roundNumber'>;

export type LatecomerPass = NonNullable<Player['latecomer']>;

/** Whether a match is being played right now. */
export function matchInProgress(room: Pick<RoomState, 'phase'>): boolean {
  return !BETWEEN_MATCHES.has(room.phase);
}

/** Only the board game has rounds a newcomer can slot into. */
function playsInRounds(room: Pick<RoomState, 'roomType'>): boolean {
  return room.roomType === 'board_game' || room.roomType == null;
}

/** What someone joining right now is given. Null when they are simply in. */
export function latecomerPass(room: MatchView): LatecomerPass | null {
  if (!matchInProgress(room)) return null;
  return { fromRound: playsInRounds(room) ? (room.roundNumber ?? 1) + 1 : null };
}

/**
 * Whether this player is watching the current match rather than playing it.
 *
 * Reads false whenever no match is running, so a pass left over from an
 * earlier match can never keep anyone out of the lobby.
 */
export function isSittingOut(room: MatchView, player: Pick<Player, 'latecomer'>): boolean {
  const pass = player.latecomer;
  if (!pass || !matchInProgress(room)) return false;
  if (pass.fromRound == null) return true;
  return (room.roundNumber ?? 1) < pass.fromRound;
}

/** When a latecomer gets to play, in a few words. */
export function latecomerWhen(pass: LatecomerPass | null | undefined): string {
  if (!pass) return '';
  return pass.fromRound == null ? 'when the next match starts' : `when round ${pass.fromRound} starts`;
}
