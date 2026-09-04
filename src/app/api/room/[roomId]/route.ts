import { NextResponse } from 'next/server';
import {
  BoardEvent,
  BoardEventKind,
  GamePhase,
  MiniGameId,
  Player,
  RoomState,
  SocialReactionId,
  SocialRound,
  TeamId,
} from '@/lib/types';
import { Chess } from 'chess.js';
import { ChessRoomState, ChessTimeControl, BotDifficulty, ChessPieceColor } from '@/lib/chess/chessTypes';
import { LudoRoomState, LudoColor, LudoPlayer, LudoToken } from '@/lib/ludo/ludoTypes';
import {
  canMoveLudoToken,
  getLudoNextPosition,
  chooseBestLudoMove,
  LUDO_COLOR_ORDER,
  SAFE_POSITIONS,
} from '@/lib/ludo/ludoRules';
import { AVATARS, DARES, DUEL_TOPICS } from '@/lib/gameContent';
import {
  DEFAULT_TURN_SECONDS,
  JUDGE_PASS_BONUS,
  MAX_PLAYERS,
  ALL_MINI_GAMES,
  MINIGAME_ICONS,
  MINIGAME_LABELS,
  REACTION_POINTS,
  BOARD_GRAPH,
  BOMB_DAMAGE,
  FINISH_NODE,
  MINIGAME_FAIL_THRESHOLD,
  MINE_PLANT_DISTANCE,
  MINE_SETBACK,
  STARTING_LIVES,
  loseLife,
  respawnToStart,
  TileOutcome,
  alternateByTeam,
  boardProgress,
  shuffleTeams,
  describePerformance,
  getShopItem,
  getTeam,
  miniGamePhase,
  performanceToSteps,
  pickMiniGame,
  rememberMiniGame,
  resolveTile,
  scoreToPerformance,
  sumReactionBonus,
  walkBack,
  walkForward,
} from '@/lib/gameRules';
import {
  RoomConflictError,
  newToken,
  pushEvent,
  readRoom,
  readSecrets,
  writeRoom,
  writeSecrets,
  type RoomSecrets,
} from '@/lib/server/roomServer';
import { isPlayableTheme } from '@/lib/themeConfig';
import {
  PERFORMER_PHASES,
  clearPhaseDeadline,
  phaseHasStalled,
  syncPhaseDeadline,
} from '@/lib/server/phaseDeadline';
import { archiveMatch } from '@/lib/server/matchArchive';
import { verifyUid } from '@/lib/firebase/server';
import { aiGameMaster } from '@/lib/aiGameMaster';
import { DEFAULT_ROOM_VIBE, ROOM_VIBES } from '@/lib/roomVibes';
import { askHost, coerceVibe, generateChallenge } from '@/lib/server/aiHost';
import { AiMasterBribe, AiMasterCategory, AiMasterState } from '@/lib/types';

export const dynamic = 'force-dynamic';

function makePlayer(name: string, index: number, isHost: boolean): Player {
  return {
    // Random rather than timestamp-based. The old form —
    // `player_guest_<Date.now()>_<index>` — was guessable by anyone who knew
    // roughly when a room started, which is a poor thing for an identifier that
    // decides whose turn it is.
    id: `player_${isHost ? 'host' : 'guest'}_${newToken().slice(0, 16)}`,
    name: name || (isHost ? 'Chief Host' : `Guest Player ${index + 1}`),
    avatar: AVATARS[index % AVATARS.length],
    score: 0,
    level: 1,
    vibeScore: 0,
    badges: [],
    boardPosition: 0,
    lives: STARTING_LIVES,
    inventory: isHost ? ['boost'] : [],
    isHost,
    isReady: true,
  };
}

const REACTION_LABELS: Record<SocialReactionId, string> = {
  laugh: 'big laugh',
  fire: 'fire',
  almost: 'almost had it',
  drama: 'drama mode',
};

function isSocialReaction(value: unknown): value is SocialReactionId {
  return value === 'laugh' || value === 'fire' || value === 'almost' || value === 'drama';
}

function updatePlayerLevel(player: Player): void {
  const progress = player.score + (player.vibeScore ?? 0);
  player.level = Math.max(player.level ?? 1, 1 + Math.floor(progress / 500));
}

function addBadge(player: Player, badge: string): boolean {
  player.badges ??= [];
  if (player.badges.includes(badge)) return false;
  player.badges.push(badge);
  return true;
}

/**
 * Picks the badge for a round.
 *
 * Ordered most-specific first, and deliberately wide: badges dedupe per player,
 * so a narrow ladder means most rounds fall through to the same generic badge
 * and silently award nothing. The reaction *mix* is used, not just the count —
 * a room laughing is a different round from a room impressed.
 */
function pickSocialBadge(round: SocialRound | null, performance: number): string {
  const reactions = round?.reactions ?? [];
  const count = reactions.length;
  const of = (id: SocialReactionId) => reactions.filter((r) => r.reaction === id).length;
  const drama = of('drama');
  const laugh = of('laugh');
  const fire = of('fire');
  const passVotes = round?.judgeVotes.filter((v) => v.vote === 'pass').length ?? 0;
  const failVotes = round?.judgeVotes.filter((v) => v.vote === 'fail').length ?? 0;

  if (drama >= 2) return 'Nollywood Legend';
  if (count >= 4) return 'Room Favorite';
  if (laugh >= 2 && performance < 0.4) return 'Confidence Without Accuracy';
  if (fire >= 2 && performance >= 0.7) return 'Mic Destroyer';
  if (passVotes >= 2 && performance >= 0.6) return 'Crowd Certified';
  if (failVotes > passVotes && count >= 2) return 'Funny Failure';
  if (performance >= 0.9) return 'Voice Legend';
  if (performance >= 0.7) return 'Fastest Mouth';
  if (performance >= 0.4) return 'Almost There';
  if (count > 0) return 'Good Sport';
  return 'Voice Rookie';
}

/** How long a player can go without a heartbeat before we treat them as gone. */
const PRESENCE_TIMEOUT_MS = 25000;

/**
 * Ceiling on a base64 Guess the Voice clip.
 *
 * Firestore caps a document at 1 MiB and the clip shares that with the players,
 * the event feed and every other mini-game's state, so this leaves plenty of
 * headroom. Roughly ten seconds of Opus.
 */
const MAX_CLIP_CHARS = 300_000;

/**
 * Players the game should still wait for.
 *
 * Anyone who closed the tab stops sending heartbeats. Without this the room
 * sits forever on a turn belonging to somebody who is not there.
 */
function activePlayers(room: RoomState): Player[] {
  const now = Date.now();
  return room.players.filter(
    (p) => p.connected !== false && now - (p.lastSeen ?? now) < PRESENCE_TIMEOUT_MS
  );
}

/** Drops players who have gone quiet, and hands the host role on if needed. */
function prunePresence(room: RoomState): boolean {
  const now = Date.now();
  let changed = false;

  for (const player of room.players) {
    const gone = now - (player.lastSeen ?? now) >= PRESENCE_TIMEOUT_MS;
    if (gone && player.connected !== false) {
      player.connected = false;
      changed = true;
      pushEvent(room, `📴 ${player.name} dropped out`, 'system');
    }
  }

  // If the host vanished, promote someone so the room is not left unstartable.
  const host = room.players.find((p) => p.id === room.hostId);
  if (host?.connected === false) {
    const heir = activePlayers(room)[0];
    if (heir) {
      host.isHost = false;
      heir.isHost = true;
      room.hostId = heir.id;
      changed = true;
      pushEvent(room, `👑 ${heir.name} is now the host`, 'system');
    }
  }

  if (changed) unstickPhase(room);
  return changed;
}

/**
 * Nudges the room forward if the phase is now waiting on somebody who left.
 * Called whenever the player set changes.
 */
function unstickPhase(room: RoomState): void {
  const live = activePlayers(room);
  if (live.length === 0 || room.phase === 'lobby' || room.phase === 'game_over') return;

  // Mid mini-game: if the performer is gone, skip their turn.
  if (PERFORMER_PHASES.has(room.phase)) {
    const performer = room.players[room.activePlayerIndex];
    if (!performer || performer.connected === false) {
      advanceRoundOrOpenShop(room);
    }
    return;
  }

  // Shopping: a departed player can no longer press done.
  if (room.phase === 'powerup_shop') {
    const waiting = live.filter((p) => !(room.shopReady ?? []).includes(p.id));
    if (waiting.length === 0) openBoardPhase(room);
    return;
  }

  // Board: drop absentees out of the roll order.
  if (room.phase === 'roadmap_turn') {
    room.rollOrder = (room.rollOrder ?? []).filter((id) =>
      live.some((p) => p.id === id)
    );
    if ((room.rollIndex ?? 0) >= room.rollOrder.length) {
      startNextRound(room);
    } else {
      syncActiveToRollOrder(room);
    }
  }
}

/** Moves to the next player's mini-game, or opens the shop once all have played. */
function advanceRoundOrOpenShop(room: RoomState): void {
  const live = activePlayers(room);
  const played = new Set((room.roundResults ?? []).map((r) => r.playerId));
  const next = live.find((p) => !played.has(p.id));

  if (next) {
    room.activePlayerIndex = room.players.findIndex((p) => p.id === next.id);
    room.turnResult = null;
    // Team Battle plays one chosen game at a time, the same one for everybody,
    // so the series decides it. The board game rolls a fresh game per turn.
    const preferredGames = ROOM_VIBES[room.roomVibe ?? DEFAULT_ROOM_VIBE].preferredGames;
    const game =
      room.roomType === 'team_battle'
        ? currentSeriesGame(room) ??
          pickMiniGame(room.enabledMiniGames ?? ALL_MINI_GAMES, true, room.recentMiniGames, preferredGames)
        : pickMiniGame(room.enabledMiniGames ?? ALL_MINI_GAMES, true, room.recentMiniGames, preferredGames);

    // Only the board game's random picks feed the repeat rule. A Team Battle
    // series is a deliberate playlist — recording it here would make the board
    // game avoid whatever the host had just chosen on purpose.
    if (room.roomType !== 'team_battle') {
      room.recentMiniGames = rememberMiniGame(room.recentMiniGames, game);
    }

    room.currentMiniGame = game;
    room.phase = miniGamePhase(game);
    room.socialRound = { targetPlayerId: next.id, reactions: [], judgeVotes: [] };
    room.liveState = null;
    pushEvent(room, `${MINIGAME_ICONS[game]} ${next.name} is up — ${MINIGAME_LABELS[game]}`, 'system');
    return;
  }

  room.liveState = null;

  // Everyone has played this game.
  //
  // Team Battle has no board and no shop — the series is the whole structure,
  // so it goes straight on to the next game or to the final recap. The board
  // game sends the room shopping before it rolls.
  if (room.roomType === 'team_battle') {
    advanceSeries(room);
    return;
  }

  room.phase = 'powerup_shop';
  room.shopReady = [];
  pushEvent(room, `🛒 Round ${room.roundNumber ?? 1}: everyone to the buff shop`, 'system');
}

/**
 * Closes the roast and hands the mini-game to whoever has not taken it yet.
 *
 * Shared by the performer's own "roast over" tap and by the deadline that fires
 * when it never arrives, so a timed-out roast still awards the badge the room
 * spent the last half-minute earning them.
 */
function finishRoast(room: RoomState): void {
  // Re-pick the badge now the roast reactions are in. A round that only got
  // funny *after* the attempt should still be able to earn Room Favorite.
  const performer = room.players[room.activePlayerIndex];
  const round = room.socialRound?.targetPlayerId === performer?.id ? room.socialRound : null;
  if (performer && round) {
    const badge = pickSocialBadge(round, room.turnResult?.performance ?? 0);
    if (addBadge(performer, badge)) {
      pushEvent(room, `${performer.name} earned badge: ${badge}`, 'social');
    }
  }

  // Hand over to the next player who has not taken the mini-game yet. Only
  // once everybody has played does the room move on to shopping.
  advanceRoundOrOpenShop(room);
}

/** Copies a fresh set of team assignments onto the live player objects. */
function applyTeamAssignment(room: RoomState, assigned: { id: string; teamId?: TeamId }[]): void {
  const byId = new Map(assigned.map((p) => [p.id, p.teamId]));
  for (const player of room.players) {
    const teamId = byId.get(player.id);
    if (teamId) player.teamId = teamId;
  }
}

/** One line naming who ended up with whom, for the event feed. */
function describeCrews(room: RoomState): string {
  const names = (team: TeamId) =>
    room.players
      .filter((p) => p.teamId === team)
      .map((p) => p.name)
      .join(', ') || '—';
  return `${getTeam('red').icon} ${names('red')}  vs  ${getTeam('blue').icon} ${names('blue')}`;
}

/**
 * Puts anybody without a crew on the smaller side.
 *
 * `join` assigns a team, but `createRoom` never did — so the host of a Team
 * Battle room had no `teamId` at all, and since scoring is credited by team,
 * every point the host earned went nowhere. Also covers players who joined
 * before the room was switched into team mode.
 */
function ensureTeams(room: RoomState): void {
  if (room.roomType !== 'team_battle') return;

  for (const player of room.players) {
    if (player.teamId) continue;
    const red = room.players.filter((p) => p.teamId === 'red').length;
    const blue = room.players.filter((p) => p.teamId === 'blue').length;
    player.teamId = red <= blue ? 'red' : 'blue';
  }
}

/** The mini-game the series is currently on. */
function currentSeriesGame(room: RoomState): MiniGameId | null {
  const state = room.teamBattleState;
  if (!state) return null;
  return state.selectedGames[state.currentGameIndex] ?? null;
}

/**
 * Moves the series on once every player has performed the current game.
 *
 * This is the step that never existed: `team_battle_start_series` parked the
 * room in `team_battle_intro` and nothing was capable of moving it forward, so
 * the mode dead-ended on a blank screen the moment the host pressed start.
 */
function advanceSeries(room: RoomState): void {
  const state = room.teamBattleState;
  if (!state) return;

  const finished = currentSeriesGame(room);
  if (finished) {
    const red = room.teamScores?.red ?? 0;
    const blue = room.teamScores?.blue ?? 0;
    pushEvent(
      room,
      `🏁 ${MINIGAME_LABELS[finished]} done — Red ${red}, Blue ${blue}`,
      'system'
    );
  }

  state.currentGameIndex += 1;
  state.currentRound += 1;

  if (state.currentGameIndex >= state.seriesLength) {
    finishSeries(room);
    return;
  }

  room.roundResults = [];
  room.currentMiniGame = state.selectedGames[state.currentGameIndex];
  room.phase = 'team_battle_intro';
}

/** Ends the series and crowns the crew with the most points. */
function finishSeries(room: RoomState): void {
  const red = room.teamScores?.red ?? 0;
  const blue = room.teamScores?.blue ?? 0;

  room.winningTeam = red > blue ? 'red' : blue > red ? 'blue' : null;
  room.phase = 'team_battle_recap';

  if (room.winningTeam) {
    const team = getTeam(room.winningTeam);
    pushEvent(room, `🏆 ${team.name} takes the series ${Math.max(red, blue)}–${Math.min(red, blue)}!`, 'system');
  } else {
    // Prints the same today, since this branch only runs when the two are
    // equal — but it says the wrong thing the moment the tie test changes.
    pushEvent(room, `🤝 The series ends level at ${red}–${blue}`, 'system');
  }
}

/**
 * Credits a performance to the player's crew.
 *
 * Team Battle scoring used to depend on `team_battle_score`, which nothing
 * called and which awarded a flat 100 to a team the client named. Points now
 * come from what the player actually earned, which is the documented intent:
 * everyone still performs solo, the points just feed a shared total.
 */
function creditTeam(room: RoomState, player: Player, coins: number): void {
  if (room.roomType !== 'team_battle' || !player.teamId || coins <= 0) return;
  room.teamScores ??= { red: 0, blue: 0 };
  room.teamScores[player.teamId] += coins;
}

/** Opens the board, ordering rolls by this round's mini-game performance. */
function openBoardPhase(room: RoomState): void {
  const live = activePlayers(room);
  const results = (room.roundResults ?? []).filter((r) => live.some((p) => p.id === r.playerId));

  // Winner of the mini-game round rolls first.
  room.rollOrder = [...results]
    .sort((a, b) => b.performance - a.performance || b.pointsEarned - a.pointsEarned)
    .map((r) => r.playerId);

  // Anyone with no result (joined mid-round) still gets to roll, at the back.
  for (const p of live) {
    if (!room.rollOrder.includes(p.id)) room.rollOrder.push(p.id);
  }

  // In team mode the sides alternate, otherwise one crew rolls three times in a
  // row and the board swings wildly before the other side touches it.
  if (room.roomType === 'team_battle') {
    const byId = new Map(room.players.map((p) => [p.id, p]));
    room.rollOrder = alternateByTeam(
      room.rollOrder.map((id) => ({ id, teamId: byId.get(id)?.teamId }))
    ).map((entry) => entry.id);
  }

  room.rollIndex = 0;
  room.phase = 'roadmap_turn';
  syncActiveToRollOrder(room);

  const leader = results.length > 0 ? results.sort((a, b) => b.performance - a.performance)[0] : null;
  if (leader) {
    pushEvent(room, `🥇 ${leader.playerName} won the mini-game round and rolls first`, 'buff');
  }
}

/**
 * Points the room at whoever is up in the roll order, skipping frozen players.
 *
 * Ice Freeze sets `skipNextTurn`, which nothing used to read — the powerup was
 * bought, spent and silently ignored. The flag is cleared as it is honoured, so
 * a freeze costs exactly one roll.
 */
function syncActiveToRollOrder(room: RoomState): void {
  const order = room.rollOrder ?? [];

  while ((room.rollIndex ?? 0) < order.length) {
    const id = order[room.rollIndex ?? 0];
    const player = room.players.find((p) => p.id === id);

    if (player?.skipNextTurn) {
      player.skipNextTurn = false;
      pushEvent(room, `❄️ ${player.name} is frozen and loses this roll`, 'debuff');
      pushBoardEvent(room, 'freeze', player, {
        banner: '❄️ FROZEN SOLID',
        message: `${player.name} sits this roll out.`,
      });
      room.rollIndex = (room.rollIndex ?? 0) + 1;
      continue;
    }

    const idx = room.players.findIndex((p) => p.id === id);
    if (idx !== -1) room.activePlayerIndex = idx;
    armRollDeadline(room);
    return;
  }

  // Everybody left in the order was frozen — the round is over.
  startNextRound(room);
}

// ─── who is allowed to do what ──────────────────────────────────────────────
//
// Actions used to act on `activePlayerIndex` regardless of who sent them, so
// any player could roll another player's dice, spend their powerups or end
// their turn. Each mutating request now carries the token issued when that
// browser joined, and the token decides which player the request *is*.
//
// The token is a bearer credential, not a password: it is kept in the room's
// private state, which firestore.rules hides from every client, and it never
// appears in the room document the room subscribes to.

/** Actions any visitor may send, because they are how you get a token at all. */
const UNAUTHENTICATED_ACTIONS = new Set(['create', 'join']);

/** Actions only the host may send. */
const HOST_ONLY_ACTIONS = new Set([
  'update_settings',
  'set_theme',
  'update_minigames',
  'update_room_vibe',
  'ai_master_start',
  'ai_master_verdict',
  'ai_master_next_round',
  'update_phase',
  'start_match',
  'end_match',
  'set_team_mode',
  'set_team',
  'switch_team',
  'balance_teams',
  'shuffle_teams',
  'team_battle_start_series',
  'team_battle_begin_game',
  'team_battle_next_game',
  'kick_player',
]);

/** Actions only the player whose turn it is may send. */
const ACTIVE_PLAYER_ACTIONS = new Set([
  'roll_dice',
  'choose_branch',
  'advance_turn',
  'use_powerup',
  'push_live_state',
  'finish_roast',
  'complete_voice_turn',
  'complete_pitch_bird',
  'complete_solfege',
  'complete_truth_bluff',
  'complete_trap',
  'trivia_answer',
]);

/**
 * Actions whose `playerId` means "me".
 *
 * Everything here has its playerId replaced with the authenticated caller. The
 * actions deliberately left out — kick_player, set_team — use playerId to name
 * somebody *else*, and must keep whatever the body asked for.
 */
const SELF_PLAYER_ID_ACTIONS = new Set([
  'heartbeat',
  'mark_away',
  'leave_room',
  'set_avatar',
  'buy_powerup',
  'finish_shopping',
  'push_live_state',
  'trivia_buzz',
  'truth_bluff_submit_claims',
  'truth_bluff_vote',
  'truth_bluff_reveal',
  'story_builder_start',
  'story_builder_submit',
  'story_builder_submit_sentence',
  'story_builder_vote',
  'story_builder_reveal',
  'debate_start',
  'debate_submit',
  'debate_submit_argument',
  'debate_vote',
  'debate_reveal',
  'guess_voice_submit',
  'guess_voice_vote',
  'add_trap',
  'ai_master_respond',
  'ai_master_vote',
  'ai_master_bribe',
]);

type Caller = { player: Player; isHost: boolean };

/**
 * Resolves the caller from their token and checks they may run this action.
 *
 * Returns an error response to send back, or the caller on success.
 */
function authorize(
  room: RoomState,
  action: string,
  token: string,
  tokens: Record<string, string>
): { caller: Caller } | { error: NextResponse } {
  const playerId = Object.keys(tokens).find((id) => tokens[id] === token);
  const player = playerId ? room.players.find((p) => p.id === playerId) : undefined;

  if (!token || !player) {
    return {
      error: NextResponse.json(
        { error: 'Rejoin the room — this browser is not signed in to it.', code: 'no_session' },
        { status: 401 }
      ),
    };
  }

  const isHost = player.id === room.hostId;

  if (HOST_ONLY_ACTIONS.has(action) && !isHost) {
    return { error: NextResponse.json({ error: 'Only the host can do that' }, { status: 403 }) };
  }

  if (ACTIVE_PLAYER_ACTIONS.has(action)) {
    const active = room.players[room.activePlayerIndex];
    if (!active || active.id !== player.id) {
      return {
        error: NextResponse.json({ error: 'It is not your turn' }, { status: 403 }),
      };
    }
  }

  return { caller: { player, isHost } };
}

/**
 * Records what the board just did, for the whole room to animate.
 *
 * Tile effects used to be drawn from the rolling client's local state, so the
 * other five players watched a token move for no visible reason. This is the
 * shared version of that moment.
 */
function pushBoardEvent(
  room: RoomState,
  kind: BoardEventKind,
  player: Player,
  fields: Partial<Omit<BoardEvent, 'id' | 'kind' | 'playerId' | 'playerName' | 'at'>> = {}
): void {
  room.boardEvent = {
    id: `be_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    playerId: player.id,
    playerName: player.name,
    banner: '',
    message: '',
    at: Date.now(),
    ...fields,
  };
}

/** How long the active player has to roll before the room moves on without them. */
const ROLL_DEADLINE_MS = 60_000;

function armRollDeadline(room: RoomState): void {
  room.rollDeadline = Date.now() + ROLL_DEADLINE_MS;
}

/**
 * Moves the board on when the active player has stopped rolling.
 *
 * Presence pruning only catches players whose tab has gone. Somebody who is
 * still heartbeating but has put their phone down holds the dice forever, and
 * the other five have no way to reach the next round. Ridden on the heartbeat,
 * so it needs no timer of its own and no client to request it.
 */
function expireStalledRoll(room: RoomState, now: number): void {
  // branch_choice counts too: a player who walks away at a fork stalls the room
  // exactly as hard as one who never rolls.
  if (room.phase !== 'roadmap_turn' && room.phase !== 'branch_choice') return;
  if (!room.rollDeadline || now < room.rollDeadline) return;

  const stalled = room.players[room.activePlayerIndex];
  if (stalled) {
    pushEvent(room, `⏳ ${stalled.name} ran out of time to roll`, 'system');
    // A fork left hanging is resolved down the first branch rather than left
    // mid-move, so the token never sits between two nodes.
    if (room.phase === 'branch_choice') {
      const node = BOARD_GRAPH[stalled.boardPosition];
      if (node?.next.length) applyLanding(room, stalled, node.next[0]);
      delete stalled.remainingSteps;
      if (room.phase === 'branch_choice') room.phase = 'roadmap_turn';
    }
  }
  advanceRoll(room);
}

/**
 * Moves the room on when whoever it was waiting for never showed up.
 *
 * Ridden on the heartbeat like `expireStalledRoll`, so it needs no timer of its
 * own and no client willing to send anything.
 */
function expireStalledPhase(room: RoomState, now: number): void {
  if (!phaseHasStalled(room, now)) return;
  clearPhaseDeadline(room);

  if (room.phase === 'powerup_shop') {
    // Anyone who never pressed done is treated as done. They keep their coins;
    // the alternative is the whole room waiting on one person's shopping.
    const waiting = activePlayers(room).filter((p) => !(room.shopReady ?? []).includes(p.id));
    if (waiting.length > 0) {
      pushEvent(room, `⏳ Shop closing — ${waiting.map((p) => p.name).join(', ')} ran out of time`, 'system');
    }
    openBoardPhase(room);
    return;
  }

  if (room.phase === 'roast_intermission') {
    // The result is already banked — only the performer's "roast over" tap is
    // missing, and finishRoast is exactly what that tap does.
    finishRoast(room);
    return;
  }

  const performer = room.players[room.activePlayerIndex];
  if (!performer) {
    advanceRoundOrOpenShop(room);
    return;
  }

  pushEvent(room, `⏳ ${performer.name} ran out of time on ${MINIGAME_LABELS[room.currentMiniGame ?? 'voice_arena']}`, 'system');

  // A forfeit has to be banked, not just skipped. advanceRoundOrOpenShop hands
  // the turn to the first live player with no result this round — so leaving the
  // row empty would hand it straight back to the player who just timed out, and
  // the room would tick between the same two states forever.
  //
  // No life is charged. Losing one is for bombing an attempt you actually made;
  // this player made none, and taking a life for an absence would also let the
  // board punish somebody whose phone simply rang.
  room.roundResults = (room.roundResults ?? []).filter((r) => r.playerId !== performer.id);
  room.roundResults.push({
    playerId: performer.id,
    playerName: performer.name,
    game: room.currentMiniGame ?? 'voice_arena',
    pointsEarned: 0,
    performance: 0,
    steps: 0,
    rolled: false,
  });
  room.turnResult = null;
  advanceRoundOrOpenShop(room);
}

// ─── Buried Mines ───────────────────────────────────────────────────────────
//
// The shop has sold these from the start — 130 coins, with a description, and
// two constants written for how far ahead one is laid and how far back its
// blast throws you. None of it was ever wired up: there was no case for it in
// use_powerup and nothing ever read the `mines` field on the room's secrets, so
// a player bought a Buried Mine, used it, and nothing at all happened.
//
// Mines live in the room's secrets rather than on the room document, for the
// same reason the Truth or Bluff answer does: every browser in the room
// subscribes to the room, and a mine everyone can see is just a tile to walk
// around.

type PlantedMine = NonNullable<RoomSecrets['mines']>[number];

/**
 * Buries a mine up the road from the planter.
 *
 * Deliberately not aimed at a player. It sits on a space and takes a life from
 * whoever stands on it — which, on a board where a Rewind can send you
 * backwards, may well end up being the person who buried it.
 *
 * At a fork the first branch is followed, so a mine is only ever laid on one
 * road; laying it on both would make a 130-coin item a guaranteed hit.
 */
function plantMine(secrets: RoomSecrets, planter: Player): PlantedMine | null {
  const nodeId = walkForward(planter.boardPosition, MINE_PLANT_DISTANCE);
  if (nodeId === planter.boardPosition) return null; // ran out of road
  // walkForward stops *at* the finish, so close to the end this would bury one
  // on the winning space — where it would go off after the win was declared and
  // knock the winner back off it.
  if (nodeId === FINISH_NODE) return null;

  secrets.mines ??= [];
  // One mine to a space. Stacking them would take several lives from one step
  // and read as a bug rather than as bad luck.
  if (secrets.mines.some((m) => m.nodeId === nodeId)) return null;

  const mine = { nodeId, ownerId: planter.id, ownerName: planter.name };
  secrets.mines.push(mine);
  return mine;
}

/** Lifts the mine at a space, if one is buried there. */
function takeMineAt(secrets: RoomSecrets, nodeId: number): PlantedMine | null {
  const mines = secrets.mines ?? [];
  const index = mines.findIndex((m) => m.nodeId === nodeId);
  if (index === -1) return null;
  const [mine] = mines.splice(index, 1);
  secrets.mines = mines;
  return mine;
}

/**
 * Sets off a mine under whoever just landed on it.
 *
 * Costs a life and throws them back, and is announced to the whole room — the
 * blast is the payoff for the coins somebody spent, so it has to be seen.
 *
 * A shield does not stop it. The shield is sold as blocking "the next asteroid,
 * dare or freeze", and quietly having it swallow mines too would make the two
 * items impossible to reason about from their own descriptions.
 */
function detonateMine(room: RoomState, victim: Player, mine: PlantedMine): void {
  const from = victim.boardPosition;
  victim.boardPosition = walkBack(from, MINE_SETBACK);

  const { livesLeft, empty } = loseLife(victim);
  if (empty) respawnToStart(victim);

  const ownName = mine.ownerId === victim.id ? 'their own' : `${mine.ownerName}'s`;
  pushEvent(
    room,
    empty
      ? `💥 ${victim.name} walked into ${ownName} buried mine and ran out of lives — back to the launchpad!`
      : `💥 ${victim.name} walked into ${ownName} buried mine — ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left`,
    'debuff'
  );

  pushBoardEvent(room, 'bomb', victim, {
    banner: '💥 BURIED MINE!',
    message:
      mine.ownerId === victim.id
        ? `${victim.name} stepped on the mine they buried themselves.`
        : `${mine.ownerName} buried it. ${victim.name} found it.`,
    fromNode: from,
    toNode: victim.boardPosition,
  });
}

/**
 * Clears anything buried on the board.
 *
 * A mine outlives the round it was laid in by design, but not the match: a
 * blast from a game two matches ago, charged against a player who never saw it
 * bought, reads as the board being broken.
 */
async function clearMines(roomId: string): Promise<void> {
  const secrets = await readSecrets(roomId);
  if (!secrets.mines?.length) return;
  secrets.mines = [];
  await writeSecrets(roomId, secrets);
}

/**
 * Sets off any mine under a player's final resting place.
 *
 * Called after applyLanding rather than inside it, because the tile itself may
 * move you on again — a wormhole or an asteroid changes where you actually come
 * to rest, and a mine is triggered by standing on it, not by passing over it.
 *
 * Kept out of applyLanding for a second reason: mines live in the room's
 * secrets, which are async to read, and applyLanding is a synchronous helper
 * shared with the heartbeat.
 */
async function resolveMineLanding(
  roomId: string,
  room: RoomState,
  player: Player
): Promise<() => Promise<void>> {
  const noop = async () => {};
  // A win is final. applyLanding may have just declared one, and a mine going
  // off afterwards would take a life off the winner and shove them back down
  // the road they had already finished.
  if (room.phase === 'game_over') return noop;

  const secrets = await readSecrets(roomId);
  const mine = takeMineAt(secrets, player.boardPosition);
  if (!mine) return noop;
  detonateMine(room, player, mine);

  // Handed back rather than written here. This action can still lose its write
  // race and be replayed against fresh state, and a mine already lifted from
  // the secrets would not be there to find on the second run — the player would
  // walk over it and the coins that bought it would be gone for nothing.
  return () => writeSecrets(roomId, secrets);
}

/**
 * Applies everything that happens when a player comes to rest on a node.
 *
 * Shared by `roll_dice` and `choose_branch`, which had grown two near-identical
 * copies of this — and the copies had already drifted, so a tile effect fixed in
 * one path stayed broken in the other.
 */
function applyLanding(room: RoomState, player: Player, node: number): TileOutcome {
  const from = player.boardPosition;
  const outcome = resolveTile(node, player.hasShield);

  player.boardPosition = outcome.position;
  if (outcome.grantsShield) player.hasShield = true;
  if (outcome.breaksShield) player.hasShield = false;
  if (outcome.coins) player.score = Math.max(0, player.score + outcome.coins);

  if (outcome.banner) {
    pushEvent(room, `${outcome.banner} (${player.name})`, outcome.setback ? 'debuff' : 'buff');
  }

  if (outcome.isFinish) {
    pushBoardEvent(room, 'finish', player, {
      banner: outcome.banner ?? '🏆 FINISH LINE REACHED!',
      message: outcome.message,
      fromNode: from,
      toNode: outcome.position,
    });
    declareWinner(room, player);
    return outcome;
  }

  // The kind drives which animation the room plays, so it is derived from what
  // the tile actually did rather than from parsing the banner text.
  const kind: BoardEventKind = outcome.grantsShield
    ? 'shield_gain'
    : outcome.breaksShield
    ? 'shield_block'
    : outcome.coins
    ? 'supply_drop'
    : outcome.triggersDuel
    ? 'duel'
    : outcome.triggersDare
    ? 'dare'
    : outcome.setback
    ? 'asteroid'
    : 'wormhole';

  if (outcome.banner) {
    pushBoardEvent(room, kind, player, {
      banner: outcome.banner,
      message: outcome.message,
      fromNode: from,
      toNode: outcome.position,
      coins: outcome.coins,
    });
  }

  if (outcome.triggersDare) {
    startDare(room, player);
  } else if (outcome.triggersDuel) {
    startDuel(room, player);
  } else if (outcome.triggersTrap) {
    startTrapDebate(room, player);
  }

  return outcome;
}

/**
 * Puts a dare on the table where the whole room can see it.
 *
 * The dare used to be invented inside the modal on the rolling player's screen,
 * which meant nobody else knew what had been asked, and refreshing lost it.
 */
function startDare(room: RoomState, target: Player, challenger?: Player): void {
  const rivals = activePlayers(room).filter((p) => p.id !== target.id);
  const picked = challenger ?? rivals[Math.floor(Math.random() * rivals.length)];
  if (!picked) return;

  room.currentDare = {
    dareText: DARES[Math.floor(Math.random() * DARES.length)],
    targetPlayerId: target.id,
    challengerPlayerId: picked.id,
  };
  room.phase = 'peer_dare';
  pushEvent(room, `🎤 ${picked.name} dares ${target.name}!`, 'dare');
}

/**
 * Pulls a rival into a head-to-head over the duel tile.
 *
 * Reuses the debate round rather than inventing a second head-to-head format:
 * it already pairs two players, gives them a topic and lets the rest of the
 * room vote, which is exactly what a duel wants to be.
 */
function startDuel(room: RoomState, challenger: Player): void {
  const pool = activePlayers(room).filter((p) => p.id !== challenger.id);
  if (pool.length === 0) return;

  // The player closest ahead on the road — a duel should threaten the person
  // you are actually racing, not a random bystander.
  const myDepth = boardProgress(challenger.boardPosition);
  const ahead = pool
    .filter((p) => boardProgress(p.boardPosition) >= myDepth)
    .sort((a, b) => boardProgress(a.boardPosition) - boardProgress(b.boardPosition));
  const rival = ahead[0] ?? pool.sort((a, b) => boardProgress(b.boardPosition) - boardProgress(a.boardPosition))[0];

  const topic = DUEL_TOPICS[Math.floor(Math.random() * DUEL_TOPICS.length)];
  room.debateState = {
    player1Id: challenger.id,
    player2Id: rival.id,
    topic,
    side1: 'For',
    side2: 'Against',
    phase: 'p1_speaking',
    votes: {},
  };
  room.phase = 'debate';
  pushEvent(room, `⚔️ DUEL: ${challenger.name} vs ${rival.name} — ${topic}`, 'system');
}

/** How many extra nodes losing a sudden-death trap debate costs. */
const TRAP_DEBATE_SETBACK = 2;

/** How far a failed dare drags you back — enough to undo a typical roll. */
const DARE_FAIL_SETBACK = 6;

/**
 * Charges a life for bombing the task the room just watched you attempt.
 *
 * Team Battle is scored on the crew total rather than survival, so it opts out
 * — taking lives there would punish a side twice for the same round.
 */
function chargeFailedChallenge(room: RoomState, player: Player, game: MiniGameId): void {
  if (room.roomType === 'team_battle') return;

  const from = player.boardPosition;
  const { livesLeft, empty } = loseLife(player);
  if (empty) respawnToStart(player);

  if (!empty) {
    pushEvent(
      room,
      `💔 ${player.name} bombed ${MINIGAME_LABELS[game]} — ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left`,
      'debuff'
    );
    return;
  }

  pushEvent(room, `☠️ ${player.name} ran out of lives — back to the launchpad with a fresh bar!`, 'debuff');
  pushBoardEvent(room, 'rewind', player, {
    banner: '☠️ WIPED OUT!',
    message: `${player.name} lost their last life and restarts from the launchpad.`,
    fromNode: from,
    toNode: 0,
  });
}

/**
 * Opens the sudden-death debate a trap tile triggers.
 *
 * This used to only flip the phase and leave `debateState` untouched, so the
 * round ran on whatever the client happened to set up next — and the penalty
 * for losing was a coin figure the client computed itself and the server took
 * on trust. The trapped player is player 1, and losing costs them real ground.
 */
function startTrapDebate(room: RoomState, trapped: Player): void {
  const pool = activePlayers(room).filter((p) => p.id !== trapped.id);
  const rival = pool.sort((a, b) => boardProgress(b.boardPosition) - boardProgress(a.boardPosition))[0];
  if (!rival) return;

  const topic = DUEL_TOPICS[Math.floor(Math.random() * DUEL_TOPICS.length)];
  room.debateState = {
    player1Id: trapped.id,
    player2Id: rival.id,
    topic,
    side1: 'For',
    side2: 'Against',
    phase: 'p1_speaking',
    votes: {},
    source: 'trap',
  };
  room.phase = 'debate';
  pushEvent(room, `🚨 SUDDEN DEATH TRAP! ${trapped.name} must out-argue ${rival.name} — ${topic}`, 'system');
}

// ─── AI Master game ─────────────────────────────────────────────────────────

/** Players still holding lives in an AI Master match. */
function survivors(room: RoomState): Player[] {
  return activePlayers(room).filter((p) => !p.eliminated);
}

/** Which vibe this room is running, defaulted for rooms made before vibes existed. */
function roomVibeOf(room: RoomState) {
  return coerceVibe(room.roomVibe);
}

/** Maps the vibe's preferred prompt flavours onto the categories this game sets. */
function pickCategory(room: RoomState): AiMasterCategory {
  const preferred = ROOM_VIBES[roomVibeOf(room)].preferredCategories;
  const mapped: AiMasterCategory[] = [];
  for (const c of preferred) {
    if (c === 'truth_bluff') mapped.push('bluff');
    else if (c === 'icebreaker') mapped.push('truth');
    else if (c === 'dare' || c === 'personality') mapped.push('dare');
    else if (c === 'debate') mapped.push('story');
  }
  // Trivia is always in the mix so a room never gets one note all night.
  const pool: AiMasterCategory[] = mapped.length > 0 ? [...mapped, 'trivia'] : ['truth', 'dare', 'bluff', 'trivia', 'story'];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Chooses who gets called out, letting the host's bias show.
 *
 * The grudge is entered twice and the favourite not at all, so the tilt is real
 * without being absolute — and the previous target is skipped so nobody gets
 * two in a row purely by chance.
 */
function pickTarget(room: RoomState, state: AiMasterState | null | undefined): Player | null {
  const pool = survivors(room);
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const eligible = pool.filter((p) => p.id !== state?.targetId);
  const from = eligible.length > 0 ? eligible : pool;

  const weighted: Player[] = [];
  for (const p of from) {
    weighted.push(p);
    if (p.id === state?.grudgeId) weighted.push(p);
    if (p.id === state?.favorId && weighted.length > 1) weighted.pop();
  }
  const draw = weighted.length > 0 ? weighted : from;
  return draw[Math.floor(Math.random() * draw.length)];
}

/** Occasionally re-rolls who the host likes and who it is out to get. */
function rerollBias(room: RoomState, state: AiMasterState): void {
  const pool = survivors(room);
  if (pool.length < 2) {
    state.favorId = null;
    state.grudgeId = null;
    return;
  }
  // Only sometimes, so the bias persists long enough for a room to notice it.
  if (state.round > 1 && Math.random() > 0.34) return;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  state.favorId = shuffled[0]?.id ?? null;
  state.grudgeId = shuffled[1]?.id ?? null;
}

/** Opens the next round: new target, new task, fresh votes. */
async function startAiMasterRound(room: RoomState): Promise<void> {
  const previous = room.aiMasterState ?? null;
  const left = survivors(room);

  if (left.length <= 1) {
    if (left[0]) declareWinner(room, left[0], 'last_standing');
    return;
  }

  const draft: AiMasterState = {
    round: (previous?.round ?? 0) + 1,
    targetId: '',
    challenge: '',
    category: 'truth',
    phase: 'announcing',
    votes: {},
    favorId: previous?.favorId ?? null,
    grudgeId: previous?.grudgeId ?? null,
    bribes: [],
  };
  rerollBias(room, draft);

  const target = pickTarget(room, previous);
  if (!target) return;

  const category = pickCategory(room);
  const { challenge, hostLine } = await generateChallenge(roomVibeOf(room), category, target.name);

  draft.targetId = target.id;
  draft.category = category;
  draft.challenge = challenge;
  draft.hostLine = hostLine;

  room.aiMasterState = draft;
  room.phase = 'ai_master_round';
  room.activePlayerIndex = Math.max(0, room.players.findIndex((p) => p.id === target.id));
  pushEvent(room, `🎙️ Round ${draft.round}: the AI Master calls out ${target.name}`, 'system');
}

/** Points a passed round is worth, matching the social bonus the board pays. */
const AI_MASTER_PASS_POINTS = 120;

/**
 * Closes a round: tallies the room's verdict and makes it cost something.
 *
 * A tie counts as a fail. Somebody has to actually speak up for you — that is
 * the whole tension of being the one on the mic.
 */
async function resolveAiMasterRound(room: RoomState): Promise<void> {
  const state = room.aiMasterState;
  if (!state) return;

  const target = room.players.find((p) => p.id === state.targetId);
  if (!target) return;

  const verdicts = Object.values(state.votes ?? {});
  const passes = verdicts.filter((v) => v === 'pass').length;
  const fails = verdicts.filter((v) => v === 'fail').length;
  const passed = passes > fails;

  state.phase = 'verdict';
  state.passed = passed;
  state.revealedAt = Date.now();

  if (passed) {
    target.score += AI_MASTER_PASS_POINTS;
    target.vibeScore = (target.vibeScore ?? 0) + passes * 10;
    updatePlayerLevel(target);
    pushEvent(room, `✅ ${target.name} survived the round ${passes}–${fails} (+${AI_MASTER_PASS_POINTS} pts)`, 'buff');
    state.hostLine =
      (await askHost(roomVibeOf(room), `In one short sentence, congratulate ${target.name} for surviving their challenge ${passes} votes to ${fails}.`)) ??
      `${target.name} pulls it off! The room says yes.`;
    return;
  }

  const { livesLeft, empty } = loseLife(target);
  if (empty) {
    target.eliminated = true;
    pushEvent(room, `☠️ ${target.name} is OUT — no lives left!`, 'debuff');
    state.hostLine =
      (await askHost(roomVibeOf(room), `In one short sentence, dramatically announce that ${target.name} has run out of lives and is eliminated.`)) ??
      `That is the end of the road for ${target.name}. Out!`;
  } else {
    pushEvent(
      room,
      `💔 ${target.name} bombed it ${fails}–${passes} — ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left`,
      'debuff'
    );
    state.hostLine =
      (await askHost(roomVibeOf(room), `In one short sentence, tease ${target.name} for failing their challenge. They have ${livesLeft} lives left.`)) ??
      `Not good enough, ${target.name}. That costs you a life.`;
  }
}

/**
 * Decides whether the host takes a bribe.
 *
 * Deliberately not a straight price list: being the current favourite helps,
 * being the grudge hurts, and there is always a chance of a public refusal —
 * a host that always accepts is just a shop.
 */
function judgeBribe(state: AiMasterState, player: Player, amount: number): boolean {
  let odds = Math.min(0.75, amount / 400);
  if (player.id === state.favorId) odds += 0.2;
  if (player.id === state.grudgeId) odds -= 0.25;
  return Math.random() < Math.max(0.05, Math.min(0.9, odds));
}

/** Ends the match. In team mode one player crossing wins it for their whole crew. */
function declareWinner(room: RoomState, player: Player, reason: 'finish' | 'last_standing' = 'finish'): void {
  room.winner = player;
  room.phase = 'game_over';
  if (room.roomType === 'team_battle' && player.teamId) {
    room.winningTeam = player.teamId;
    const team = getTeam(player.teamId);
    pushEvent(room, `🏆 ${player.name} took ${team.name} across the finish line!`, 'system');
  } else if (reason === 'last_standing') {
    pushEvent(room, `🏆 ${player.name} is the last one standing!`, 'system');
  } else {
    pushEvent(room, `🏆 ${player.name} won the roadmap!`, 'system');
  }
}

/** Hands the dice to the next player, or starts the next round if that was the last. */
function advanceRoll(room: RoomState): void {
  room.rollIndex = (room.rollIndex ?? 0) + 1;
  room.boardEvent = null;

  if (room.rollIndex >= (room.rollOrder ?? []).length) {
    startNextRound(room);
    return;
  }

  syncActiveToRollOrder(room);
  // syncActiveToRollOrder may have run off the end skipping frozen players and
  // started the next round, in which case there is nobody to announce.
  if (room.phase !== 'roadmap_turn') return;

  const next = room.players[room.activePlayerIndex];
  if (next) pushEvent(room, `🎲 ${next.name} is up to roll`, 'system');
}

/** Wipes round state and sends everyone back to the mini-game. */
function startNextRound(room: RoomState): void {
  room.roundNumber = (room.roundNumber ?? 0) + 1;
  room.roundResults = [];
  room.rollOrder = [];
  room.rollIndex = 0;
  room.shopReady = [];
  room.turnResult = null;
  room.rollDeadline = null;
  clearPhaseDeadline(room);
  room.boardEvent = null;
  room.truthBluffState = null;
  room.storyBuilderState = null;
  room.debateState = null;
  room.triviaState = null;
  room.guessTheVoiceState = null;
  pushEvent(room, `🔄 Round ${room.roundNumber} — back to the mini-games`, 'system');
  advanceRoundOrOpenShop(room);
}

async function createRoom(
  roomId: string,
  hostName: string,
  roomType: 'board_game' | 'team_battle' = 'board_game',
  hostUid?: string | null
): Promise<{ room: RoomState; playerId: string; token: string }> {
  const host = makePlayer(hostName, 0, true);
  if (hostUid) host.uid = hostUid;
  const room: RoomState = {
    roomId,
    hostId: host.id,
    phase: 'lobby',
    roomType,
    roomVibe: DEFAULT_ROOM_VIBE,
    players: [host],
    activePlayerIndex: 0,
    // Hausa and Yoruba are parked until there is a recogniser that can hear
    // them; math rounds are gone — this is a voice game, not a quiz.
    selectedLanguages: ['english', 'spelling_bee'],
    mathEnabled: false,
    trapWords: [],
    turnTimeLimit: DEFAULT_TURN_SECONDS,
    currentDare: null,
    winner: null,
    theme: 'space',
    events: [],
    enabledMiniGames: ALL_MINI_GAMES,
    currentMiniGame: 'voice_arena',
    turnResult: null,
    socialRound: null,
    roundNumber: 0,
    roundResults: [],
    rollOrder: [],
    rollIndex: 0,
    shopReady: [],
  };
  pushEvent(room, `🎮 ${host.name} opened room ${roomId}`, 'system');
  await writeRoom(room);

  const token = newToken();
  await writeSecrets(roomId, { tokens: { [host.id]: token } });

  return { room, playerId: host.id, token };
}

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  const room = await readRoom(params.roomId.toUpperCase());
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  // Clients read the room from Firestore directly, so this is only a debugging
  // and health-check surface now. Presence pruning rides on the heartbeat.
  if (prunePresence(room)) await writeRoom(room);
  return NextResponse.json(room);
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  const roomId = params.roomId.toUpperCase();

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  const { action } = body;

  if (action === 'create') {
    const existing = await readRoom(roomId);
    if (existing) {
      // Reopening an existing code must not wipe the players already in it, and
      // must not hand the caller the host's identity either — creating a room
      // that someone else already owns makes you a guest, not the host.
      return NextResponse.json({ room: existing });
    }
    try {
      const created = await createRoom(
        roomId,
        body.playerName,
        body.roomType || 'board_game',
        await verifyUid(body.idToken)
      );
      return NextResponse.json(created);
    } catch (error) {
      if (!(error instanceof RoomConflictError)) throw error;
      // Somebody claimed this code between our check and our write.
      const claimed = await readRoom(roomId);
      return claimed
        ? NextResponse.json({ room: claimed })
        : NextResponse.json({ error: 'Could not open that room' }, { status: 409 });
    }
  }

  // Read, mutate, write — retried when somebody else wrote in between.
  //
  // Every action is a pure function of (room, body), so a losing attempt is
  // discarded and simply replayed against the room it lost to. The alternative
  // is what this used to do: read outside any transaction and blind-overwrite
  // the whole document, so two players acting at once silently erased one
  // another. With six players heartbeating, reacting and voting, that is not a
  // rare race — it is the normal case.
  for (let attempt = 1; ; attempt++) {
    const room = await readRoom(roomId);
    if (!room) {
      // Every other action needs a room that already exists. Silently creating
      // one here is what used to make a guest the host of an empty room.
      return NextResponse.json({ error: 'Room not found', roomId }, { status: 404 });
    }

    if (!UNAUTHENTICATED_ACTIONS.has(action)) {
      const { tokens } = await readSecrets(roomId);
      const auth = authorize(room, action, String(body.token ?? ''), tokens);
      if ('error' in auth) return auth.error;
      const callerId = auth.caller.player.id;

      // Overwrite the identity fields rather than trusting the body. Note this
      // is deliberately NOT a blanket `body.playerId = callerId`: for
      // kick_player and set_team, playerId is the *target*, and clobbering it
      // would have the host kicking themselves.
      if (SELF_PLAYER_ID_ACTIONS.has(action)) body.playerId = callerId;
      body.voterId = callerId;
      body.requesterId = callerId;
      body.callerId = callerId;
    }

    try {
      const response = await applyAction(room, action, body);

      // Matches are won deep inside synchronous helpers (a tile landing, a
      // powerup shove), which cannot await a Firestore write. This is the one
      // point every one of those paths passes through with the room already
      // written and its final state in hand.
      //
      // After the response is built, so recording a match never delays the
      // game-over screen, and guarded by archiveMatch's own idempotency rather
      // than by anything this loop tracks.
      if (room.phase === 'game_over' && !room.matchArchived) {
        await archiveMatch(room, 'winner');
      }

      return response;
    } catch (error) {
      if (!(error instanceof RoomConflictError)) throw error;
      // Spectator detail is disposable — another frame is along in a moment, so
      // never spend retries (or make the performer wait) on it.
      if (action === 'push_live_state') return NextResponse.json({ ok: true });
      if (attempt >= MAX_WRITE_ATTEMPTS) {
        return NextResponse.json(
          { error: 'The room is busy right now — try that again.' },
          { status: 409 }
        );
      }
    }
  }
}

/** How many times a losing write is replayed before the caller is told to retry. */
const MAX_WRITE_ATTEMPTS = 5;

/**
 * Applies one action to a room and builds the response.
 *
 * Throws RoomConflictError if the room changed underneath it, which POST catches
 * and replays. Handlers must therefore stay free of side effects outside `room`.
 */
async function applyAction(
  room: RoomState,
  action: string,
  body: Record<string, any>
): Promise<NextResponse> {
  const roomId = room.roomId;

  switch (action) {
    case 'join': {
      const name = String(body.playerName ?? '').trim();

      // A refresh or a reconnect re-claims the seat this browser already holds.
      // Matching on the *name* instead — which is what this used to do — meant
      // two people who both typed "Mike" were handed the same player, sharing
      // one score, one inventory and one turn.
      // Re-claiming requires the token, not just the id: player ids are visible
      // to everyone in the room, so an id alone would let anybody take over any
      // seat simply by asking to join as them.
      const secrets = await readSecrets(roomId);
      const claimedId = String(body.playerId ?? '');
      const claimedToken = String(body.token ?? '');
      const mine =
        claimedId && claimedToken && secrets.tokens[claimedId] === claimedToken
          ? room.players.find((p) => p.id === claimedId)
          : undefined;
      // Verified, never taken on trust — a uid in a request body is just a
      // string the browser chose. Null when auth is off or the token is stale,
      // which costs the player their permanent record and nothing else.
      const uid = await verifyUid(body.idToken);

      if (mine) {
        mine.lastSeen = Date.now();
        if (mine.connected === false) mine.connected = true;
        // A reconnect is the second chance to attach identity: auth may have
        // still been resolving when they first joined.
        if (uid) mine.uid = uid;
        return NextResponse.json({
          room: await writeRoom(room),
          playerId: mine.id,
          token: claimedToken,
        });
      }

      if (room.players.length >= MAX_PLAYERS) {
        return NextResponse.json({ error: `Room is full (max ${MAX_PLAYERS} players)` }, { status: 409 });
      }

      // Names are how the room tells people apart on screen, so keep them
      // distinct — but by numbering the duplicate, never by merging the seats.
      let displayName = name;
      for (let n = 2; room.players.some((p) => p.name.toLowerCase() === displayName.toLowerCase()); n++) {
        displayName = `${name} (${n})`;
      }

      const player = makePlayer(displayName, room.players.length, false);
      if (uid) player.uid = uid;
      if (room.roomType === 'team_battle') {
        // Drop them on the smaller crew so a late joiner does not lopside it.
        const red = room.players.filter((p) => p.teamId === 'red').length;
        const blue = room.players.filter((p) => p.teamId === 'blue').length;
        player.teamId = red <= blue ? 'red' : 'blue';
      }
      room.players.push(player);
      pushEvent(room, `🎮 ${player.name} joined the room`, 'system');

      // The room is written first. If that loses a write race the whole action
      // is replayed, and issuing the token beforehand would leave a credential
      // behind for a player that never joined.
      const saved = await writeRoom(room);

      const token = newToken();
      secrets.tokens[player.id] = token;
      await writeSecrets(roomId, secrets);

      return NextResponse.json({ room: saved, playerId: player.id, token });
    }

    case 'add_trap': {
      const word = String(body.trapWord ?? '').trim();
      if (!word) return NextResponse.json({ error: 'Trap word is required' }, { status: 400 });
      // Authorship comes from the authenticated caller, not from the body —
      // otherwise a trap can be planted in somebody else's name.
      const author = room.players.find((p) => p.id === body.callerId);
      room.trapWords.push({
        id: `trap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        word,
        authorId: author?.id ?? '',
        authorName: author?.name ?? 'Opponent Player',
        targetPlayerId: body.targetPlayerId,
        used: false,
      });
      pushEvent(room, `⚡ ${author?.name ?? 'Someone'} armed a trap word`, 'debuff');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'mark_trap_used': {
      const trap = room.trapWords.find((t) => t.id === body.trapId);
      if (trap) trap.used = true;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'update_settings': {
      if (Array.isArray(body.languages) && body.languages.length > 0) {
        room.selectedLanguages = body.languages;
      }
      if (typeof body.mathEnabled === 'boolean') room.mathEnabled = body.mathEnabled;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'set_theme': {
      // Validated rather than trusted: the picker only offers themes that have
      // art, and a theme without one silently renders as outer space with a few
      // recoloured tiles.
      if (!isPlayableTheme(body.theme)) {
        return NextResponse.json({ error: 'That map is not available yet' }, { status: 400 });
      }
      room.theme = body.theme;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'set_avatar': {
      const player = room.players.find((p) => p.id === body.playerId);
      const avatar = AVATARS.find((a) => a.id === body.avatarId);
      if (!player || !avatar) {
        return NextResponse.json({ error: 'Player or avatar not found' }, { status: 404 });
      }

      player.avatar = avatar;
      pushEvent(room, `${player.name} switched avatar to ${avatar.name}`, 'social');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'update_phase': {
      if (!body.phase) return NextResponse.json({ error: 'Phase is required' }, { status: 400 });
      room.phase = body.phase as GamePhase;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'add_social_reaction': {
      const voter = room.players.find((p) => p.id === body.voterId);
      const target = room.players.find((p) => p.id === body.targetPlayerId);
      if (!voter || !target) {
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }
      if (voter.id === target.id) {
        return NextResponse.json({ error: 'React to another player, not yourself' }, { status: 400 });
      }
      if (!isSocialReaction(body.reaction)) {
        return NextResponse.json({ error: 'Unknown reaction' }, { status: 400 });
      }

      if (!room.socialRound || room.socialRound.targetPlayerId !== target.id) {
        room.socialRound = { targetPlayerId: target.id, reactions: [], judgeVotes: [] };
      }

      const alreadyReacted = room.socialRound.reactions.some(
        (r) => r.voterId === voter.id && r.reaction === body.reaction
      );
      if (!alreadyReacted) {
        room.socialRound.reactions.push({
          id: `react_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          reaction: body.reaction,
          voterId: voter.id,
          voterName: voter.name,
          targetPlayerId: target.id,
          timestamp: new Date().toISOString(),
        });
        pushEvent(room, `${voter.name} gave ${target.name} a ${REACTION_LABELS[body.reaction]}`, 'social');

        // The roast intermission is the moment the room is actually watching and
        // reacting, but by then the turn is scored and the dice locked. Board
        // movement stays earned by accuracy — late reactions pay out in vibe,
        // which drives levels and badges. Without this the roast buttons record
        // a reaction and award nothing at all.
        if (room.phase === 'roast_intermission') {
          target.vibeScore = (target.vibeScore ?? 0) + REACTION_POINTS[body.reaction];
          updatePlayerLevel(target);
        }
      }

      return NextResponse.json({ room: await writeRoom(room) });
    }

    /** Live glimpse of the performer's attempt, for everyone else to watch. */
    case 'push_live_state': {
      const active = room.players[room.activePlayerIndex];
      if (!active || active.id !== body.playerId) {
        return NextResponse.json(
          { error: 'Only the active player reports live state' },
          { status: 403 }
        );
      }
      room.liveState = {
        ...(body.state ?? {}),
        playerId: active.id,
        game: room.currentMiniGame ?? 'voice_arena',
        at: Date.now(),
      };
      // Not an event-worthy change — write without pushing to the feed.
      await writeRoom(room);
      return NextResponse.json({ ok: true });
    }

    case 'add_judge_vote': {
      const voter = room.players.find((p) => p.id === body.voterId);
      const target = room.players.find((p) => p.id === body.targetPlayerId);
      const vote = body.vote === 'fail' ? 'fail' : body.vote === 'pass' ? 'pass' : null;
      if (!voter || !target || !vote) {
        return NextResponse.json({ error: 'Invalid judge vote' }, { status: 400 });
      }
      if (voter.id === target.id) {
        return NextResponse.json({ error: 'Players cannot judge their own round' }, { status: 400 });
      }
      // Teammates would simply wave each other through, so judging crosses the
      // divide. Reactions stay open to everyone — cheering your own crew on is
      // the point of having one.
      if (room.roomType === 'team_battle' && voter.teamId && voter.teamId === target.teamId) {
        return NextResponse.json(
          { error: 'Your own crew cannot judge you — the other side decides' },
          { status: 400 }
        );
      }

      if (!room.socialRound || room.socialRound.targetPlayerId !== target.id) {
        room.socialRound = { targetPlayerId: target.id, reactions: [], judgeVotes: [] };
      }

      const existing = room.socialRound.judgeVotes.find((v) => v.voterId === voter.id);
      if (existing) {
        existing.vote = vote;
      } else {
        room.socialRound.judgeVotes.push({
          voterId: voter.id,
          voterName: voter.name,
          targetPlayerId: target.id,
          vote,
        });
      }
      pushEvent(room, `${voter.name} judged ${target.name}: ${vote.toUpperCase()}`, vote === 'pass' ? 'buff' : 'debuff');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'truth_bluff_submit_claims': {
      const claims = Array.isArray(body.claims) ? body.claims.map(String) : [];
      const lieIndex = Number(body.lieIndex);
      if (claims.length < 2 || !Number.isInteger(lieIndex) || lieIndex < 0 || lieIndex >= claims.length) {
        return NextResponse.json({ error: 'Two claims and a valid lie are required' }, { status: 400 });
      }

      // The lie is held back, not published: everyone in the room subscribes to
      // this document, so putting it here would let anyone read the answer.
      const secrets = await readSecrets(roomId);
      secrets.lieIndex = lieIndex;
      await writeSecrets(roomId, secrets);

      room.truthBluffState = {
        performerId: body.playerId,
        // `room.currentChallenge` used to be read here and was never assigned
        // anywhere — it was null for the life of every room, so this line only
        // ever produced its own fallback string.
        prompt: String(body.prompt ?? '').trim() || 'Truth or Bluff',
        claims,
        votes: {},
        phase: 'voting',
      };
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'truth_bluff_vote': {
      if (room.truthBluffState) {
        if (!room.truthBluffState.votes) room.truthBluffState.votes = {};
        room.truthBluffState.votes[body.playerId] = body.voteIndex;
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /** Opens a Story Builder round with the prompt the active player drew. */
    case 'story_builder_start': {
      const prompt = String(body.prompt ?? '').trim();
      if (!prompt) return NextResponse.json({ error: 'A starting prompt is required' }, { status: 400 });

      room.storyBuilderState = {
        prompt,
        story: [],
        currentPlayerIndex: 0,
        phase: 'speaking',
        votes: {},
      };
      pushEvent(room, `📖 Story Builder: "${prompt}"`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'story_builder_submit':
    case 'story_builder_submit_sentence': {
      const state = room.storyBuilderState;
      if (!state) return NextResponse.json({ error: 'No story in progress' }, { status: 409 });

      const sentence = String(body.sentence ?? '').trim();
      const author = room.players.find((p) => p.id === body.playerId);
      if (!sentence || !author) {
        return NextResponse.json({ error: 'A sentence and a known player are required' }, { status: 400 });
      }
      // The turn order is the player list, so only whoever is up may add a line.
      const expected = room.players[state.currentPlayerIndex];
      if (expected && expected.id !== author.id) {
        return NextResponse.json({ error: `It is ${expected.name}'s line` }, { status: 409 });
      }

      state.story.push({ playerId: author.id, sentence });
      state.currentPlayerIndex += 1;

      // Everybody has added a line — put it to the room for the funniest vote.
      if (state.currentPlayerIndex >= room.players.length) {
        state.currentPlayerIndex = 0;
        state.phase = 'voting';
        pushEvent(room, `🗳️ Story complete — vote for the funniest line`, 'system');
      }
      if (body.phase) state.phase = body.phase;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'story_builder_vote': {
      const state = room.storyBuilderState;
      if (!state) return NextResponse.json({ error: 'No story in progress' }, { status: 409 });

      // Clients have sent these under two different names; accept both.
      const voterId = String(body.voterId ?? body.playerId ?? '');
      const votedForId = String(body.votedPlayerId ?? body.votePlayerId ?? '');
      const voter = room.players.find((p) => p.id === voterId);
      const votedFor = room.players.find((p) => p.id === votedForId);
      if (!voter || !votedFor) {
        return NextResponse.json({ error: 'Unknown voter or target' }, { status: 400 });
      }
      if (voter.id === votedFor.id) {
        return NextResponse.json({ error: 'Vote for someone else' }, { status: 400 });
      }

      state.votes ??= {};
      state.votes[voter.id] = votedFor.id;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'story_builder_reveal': {
      const state = room.storyBuilderState;
      if (!state) return NextResponse.json({ error: 'No story in progress' }, { status: 409 });

      state.phase = 'reveal';
      state.revealedAt = Date.now();

      // Bank the story for Who Said It? callbacks later in the session.
      room.sessionMemory ??= [];
      for (const entry of state.story) {
        const author = room.players.find((p) => p.id === entry.playerId);
        room.sessionMemory.push({
          playerId: entry.playerId,
          playerName: author?.name ?? 'Player',
          category: 'story',
          text: entry.sentence,
          timestamp: Date.now(),
        });
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /** Pairs the active player against an opponent and opens the debate. */
    case 'debate_start': {
      const topic = String(body.topic ?? '').trim();
      if (!topic) return NextResponse.json({ error: 'A debate topic is required' }, { status: 400 });

      const starter = room.players.find((p) => p.id === body.playerId) ?? room.players[room.activePlayerIndex];
      if (!starter) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      // In team mode the challenger comes from the other crew, so the debate is
      // actually a contest rather than two teammates agreeing with each other.
      const pool = activePlayers(room).filter((p) => p.id !== starter.id);
      const opponents =
        room.roomType === 'team_battle' && starter.teamId
          ? pool.filter((p) => p.teamId && p.teamId !== starter.teamId)
          : pool;
      const challenger = (opponents.length > 0 ? opponents : pool)[0];
      if (!challenger) {
        return NextResponse.json({ error: 'A debate needs a second player' }, { status: 409 });
      }

      room.debateState = {
        player1Id: starter.id,
        player2Id: challenger.id,
        topic,
        side1: String(body.side1 ?? 'Pro'),
        side2: String(body.side2 ?? 'Against'),
        phase: 'p1_speaking',
        votes: {},
      };
      pushEvent(room, `⚖️ ${starter.name} vs ${challenger.name} — ${topic}`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'debate_submit':
    case 'debate_submit_argument': {
      const state = room.debateState;
      if (!state) return NextResponse.json({ error: 'No debate in progress' }, { status: 409 });

      // An explicit phase from the client still wins, so the older
      // `debate_submit` callers keep working.
      if (body.phase) {
        state.phase = body.phase;
      } else if (state.phase === 'p1_speaking') {
        state.phase = 'p2_speaking';
      } else if (state.phase === 'p2_speaking') {
        state.phase = 'voting';
        pushEvent(room, `🗳️ Both sides have spoken — the room votes`, 'system');
      }

      const argument = String(body.argument ?? '').trim();
      if (argument) {
        const speaker = room.players.find((p) => p.id === body.playerId);
        room.sessionMemory ??= [];
        room.sessionMemory.push({
          playerId: String(body.playerId ?? ''),
          playerName: speaker?.name ?? 'Player',
          category: 'debate',
          text: argument,
          timestamp: Date.now(),
        });
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'debate_vote': {
      const state = room.debateState;
      if (!state) return NextResponse.json({ error: 'No debate in progress' }, { status: 409 });

      const voterId = String(body.voterId ?? body.playerId ?? '');
      const voter = room.players.find((p) => p.id === voterId);
      const vote = Number(body.vote);
      if (!voter || (vote !== 1 && vote !== 2)) {
        return NextResponse.json({ error: 'Invalid debate vote' }, { status: 400 });
      }
      // The two debaters do not get to vote for themselves.
      if (voter.id === state.player1Id || voter.id === state.player2Id) {
        return NextResponse.json({ error: 'Debaters do not vote — the room decides' }, { status: 400 });
      }

      state.votes ??= {};
      state.votes[voter.id] = vote;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'debate_reveal': {
      const state = room.debateState;
      if (!state) return NextResponse.json({ error: 'No debate in progress' }, { status: 409 });

      state.phase = 'reveal';
      state.revealedAt = Date.now();

      const votes = Object.values(state.votes ?? {});
      const forOne = votes.filter((v) => v === 1).length;
      const forTwo = votes.filter((v) => v === 2).length;
      const winnerId = forOne > forTwo ? state.player1Id : forTwo > forOne ? state.player2Id : null;
      const winner = room.players.find((p) => p.id === winnerId);
      pushEvent(
        room,
        winner ? `⚖️ ${winner.name} won the debate ${Math.max(forOne, forTwo)}–${Math.min(forOne, forTwo)}` : `⚖️ The debate ended in a draw`,
        winner ? 'buff' : 'system'
      );

      // Sudden death means the trapped player has to be talked out of it. If the
      // room did not back them — including a two-player room where nobody is
      // eligible to vote at all — the trap takes its due. Decided here from the
      // stored votes rather than from a number the client sends.
      if (state.source === 'trap' && winnerId !== state.player1Id) {
        const trapped = room.players.find((p) => p.id === state.player1Id);
        if (trapped) {
          const from = trapped.boardPosition;
          trapped.boardPosition = walkBack(from, TRAP_DEBATE_SETBACK);
          pushEvent(room, `🚨 ${trapped.name} lost the sudden death — dragged back ${TRAP_DEBATE_SETBACK} spaces`, 'debuff');
          pushBoardEvent(room, 'asteroid', trapped, {
            banner: '🚨 SUDDEN DEATH LOST!',
            message: `${trapped.name} could not talk their way out of the trap.`,
            fromNode: from,
            toNode: trapped.boardPosition,
          });
        }
      }

      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'guess_voice_submit': {
      const state = room.guessTheVoiceState;
      if (!state) return NextResponse.json({ error: 'No round in progress' }, { status: 409 });

      const clip = typeof body.audioBlobUrl === 'string' ? body.audioBlobUrl : '';
      if (clip) {
        // The clip rides inside the room document, and Firestore caps a document
        // at 1 MiB total — players, events and every other mini-game's state
        // share that budget. Reject an oversized take rather than letting the
        // write fail and take the whole room down with it.
        if (clip.length > MAX_CLIP_CHARS) {
          return NextResponse.json(
            { error: 'That take is too long — keep it under about 10 seconds' },
            { status: 413 }
          );
        }
        state.audioBlobUrl = clip;
        if (body.playerId) state.performerId = String(body.playerId);
        if (!body.phase) state.phase = 'playback';
      }
      if (body.phase) state.phase = body.phase;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'guess_voice_vote': {
      const state = room.guessTheVoiceState;
      if (!state) return NextResponse.json({ error: 'No round in progress' }, { status: 409 });

      const voterId = String(body.voterId ?? body.playerId ?? '');
      const guessedId = String(body.guessedPlayerId ?? body.vote ?? '');
      const voter = room.players.find((p) => p.id === voterId);
      const guessed = room.players.find((p) => p.id === guessedId);
      if (!voter || !guessed) {
        return NextResponse.json({ error: 'Unknown voter or guess' }, { status: 400 });
      }

      state.votes ??= {};
      state.votes[voter.id] = guessed.id;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'truth_bluff_reveal': {
      if (room.truthBluffState) {
        const secrets = await readSecrets(roomId);
        const lieIndex = secrets.lieIndex ?? null;

        room.truthBluffState.phase = 'reveal';
        room.truthBluffState.revealedAt = Date.now();
        // Published only now that the round is over.
        room.truthBluffState.lieIndex = lieIndex;

        // Whichever claims were not the lie. Picking "index 0 or 1" only worked
        // while a round was hard-coded to exactly two claims.
        const { claims } = room.truthBluffState;
        const truthText = claims.filter((_, i) => i !== lieIndex).join(' · ');
        const event = {
          playerId: body.playerId,
          playerName: room.players.find((p) => p.id === body.playerId)?.name || 'Player',
          category: 'truth_bluff' as const,
          text: truthText,
          timestamp: Date.now(),
        };
        if (!room.sessionMemory) room.sessionMemory = [];
        room.sessionMemory.push(event);
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'trivia_generate': {
      if (!room.triviaState) {
        const trivia = await aiGameMaster.generateTriviaQuestion(room.theme);

        // Only the question goes out. The answer stays server-side and grading
        // happens in `trivia_answer`, so it is never on the wire before the
        // reveal — it used to ride along in the same document as the question.
        const secrets = await readSecrets(roomId);
        secrets.triviaAnswer = trivia.answer;
        secrets.triviaFunFact = trivia.funFact;
        await writeSecrets(roomId, secrets);

        room.triviaState = {
          question: trivia.question,
          buzzedPlayerId: null,
          phase: 'asking',
          winnerId: null,
        };
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /**
     * Grades a spoken trivia answer.
     *
     * Server-side because the client cannot be given the answer to compare
     * against, and because a client that grades itself can simply claim it won.
     */
    case 'trivia_answer': {
      const state = room.triviaState;
      if (!state || state.phase === 'reveal') {
        return NextResponse.json({ error: 'No trivia round to answer' }, { status: 409 });
      }

      const secrets = await readSecrets(roomId);
      const target = secrets.triviaAnswer ?? '';
      const spoken = String(body.answerText ?? '');

      // Speech recognition hands back a whole sentence ("uh, I think it's
      // Lagos"), so the answer counts when it appears as a whole word inside
      // what was said. Testing containment the other way round as well — which
      // the client used to do — made "a" a correct answer to anything with an A.
      const normalize = (text: string) =>
        text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const cleanSpoken = normalize(spoken);
      const cleanTarget = normalize(target);
      const isCorrect =
        cleanSpoken.length > 0 &&
        cleanTarget.length > 0 &&
        (cleanSpoken === cleanTarget ||
          new RegExp(`\\b${cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(cleanSpoken));

      state.phase = 'reveal';
      state.revealedAt = Date.now();
      state.lastAnswerText = spoken;
      state.winnerId = isCorrect ? state.buzzedPlayerId ?? room.players[room.activePlayerIndex]?.id ?? null : null;
      // Safe to publish now.
      state.answer = target;
      state.funFact = secrets.triviaFunFact;

      const answerer = room.players.find((p) => p.id === state.winnerId) ?? room.players[room.activePlayerIndex];
      if (answerer) {
        pushEvent(
          room,
          `${answerer.name} answered: ${isCorrect ? 'CORRECT! ✅' : 'WRONG! ❌'}`,
          isCorrect ? 'buff' : 'debuff'
        );
      }

      return NextResponse.json({ room: await writeRoom(room), isCorrect, answer: target });
    }

    case 'trivia_buzz': {
      if (room.triviaState && room.triviaState.phase === 'asking') {
        room.triviaState.buzzedPlayerId = body.playerId;
        room.triviaState.phase = 'answering';
        const buzzer = room.players.find(p => p.id === body.playerId);
        if (buzzer) {
          pushEvent(room, `🚨 ${buzzer.name} buzzed in!`, 'system');
        }
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    // `trivia_submit` used to take the client's word for whether it had answered
    // correctly. Grading now happens in `trivia_answer` against the stored
    // answer, so this only survives to keep an older client from erroring.
    case 'trivia_submit': {
      return NextResponse.json(
        { error: 'Send the spoken answer to trivia_answer instead' },
        { status: 410 }
      );
    }

    case 'complete_truth_bluff': {
      const active = room.players[room.activePlayerIndex];
      if (!active) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      const game: MiniGameId = 'truth_or_bluff';
      const basePoints = 100;

      const lieIndex = (await readSecrets(roomId)).lieIndex;
      const votes = room.truthBluffState?.votes || {};
      let correctGuessersCount = 0;
      if (lieIndex !== undefined && lieIndex !== null) {
        for (const voterId in votes) {
          if (votes[voterId] === lieIndex) {
            correctGuessersCount++;
          }
        }
      }

      const bluffBonus = correctGuessersCount === 0 ? 80 : 0;
      const socialRound = room.socialRound?.targetPlayerId === active.id ? room.socialRound : null;
      const reactionBonus = sumReactionBonus(socialRound?.reactions ?? []);
      const passVotes = socialRound?.judgeVotes.filter((vote) => vote.vote === 'pass').length ?? 0;
      const failVotes = socialRound?.judgeVotes.filter((vote) => vote.vote === 'fail').length ?? 0;
      const judgeBonus = passVotes > failVotes ? JUDGE_PASS_BONUS : 0;
      const points = basePoints + bluffBonus + reactionBonus + judgeBonus;
      const performance = scoreToPerformance(game, points);
      const steps = performanceToSteps(performance);
      const coinsEarned = Math.floor(performance * 100);

      active.score += coinsEarned;
      // In Team Battle the same points also feed the crew total, which is what
      // the series is actually won on.
      creditTeam(room, active, coinsEarned);
      active.vibeScore = (active.vibeScore ?? 0) + reactionBonus + passVotes * 10;
      const badge = pickSocialBadge(socialRound, performance);
      const gotNewBadge = addBadge(active, badge);
      updatePlayerLevel(active);
      room.turnResult = { game, pointsEarned: coinsEarned, performance, steps };

      pushEvent(
        room,
        `${MINIGAME_ICONS[game]} ${active.name} earned ${coinsEarned} coins in ${MINIGAME_LABELS[game]} → ${steps} step${steps === 1 ? '' : 's'}`,
        coinsEarned > 0 ? 'point' : 'debuff'
      );

      pushEvent(
        room,
        `${active.name}: ${basePoints + bluffBonus} performance + ${reactionBonus + judgeBonus} social bonus`,
        reactionBonus + judgeBonus > 0 ? 'social' : 'system'
      );
      if (gotNewBadge) {
        pushEvent(room, `${active.name} earned badge: ${badge}`, 'social');
      }

      room.roundResults = (room.roundResults ?? []).filter((r) => r.playerId !== active.id);
      room.roundResults.push({
        playerId: active.id,
        playerName: active.name,
        game,
        pointsEarned: coinsEarned,
        performance,
        steps,
        rolled: false,
      });

      if (performance <= MINIGAME_FAIL_THRESHOLD) chargeFailedChallenge(room, active, game);

      room.phase = 'roast_intermission';
      return NextResponse.json({
        room: await writeRoom(room),
        result: room.turnResult,
        summary: describePerformance(performance),
      });
    }

    case 'complete_trap': {
      const active = room.players[room.activePlayerIndex];
      if (!active) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      const coinsLost = body.coinsLost || 0;
      if (coinsLost > 0) {
        active.score = Math.max(0, active.score - coinsLost);
        pushEvent(room, `💸 ${active.name} lost ${coinsLost} coins to the trap!`, 'debuff');
      }

      room.phase = 'roadmap_turn';
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /**
     * Kept for the debate round, which finishes through here in team mode.
     *
     * It used to jump straight to the final recap, ending the whole series on
     * the first game that used it. It now closes out the player's turn like any
     * other mini-game and lets the series decide whether anything follows.
     */
    case 'complete_team_battle': {
      advanceRoundOrOpenShop(room);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    // Every mini-game finishes through here. The score is banked as points AND
    // converted into the movement the player earned for the board.
    case 'complete_voice_turn':
    case 'complete_pitch_bird':
    case 'complete_solfege': {
      const active = room.players[room.activePlayerIndex];
      if (!active) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      // Taken from room state, not from which action the client called. The two
      // mini-games normalise against different maxima (310 vs 1200), so trusting
      // the client here would let a PitchBird score be graded on the voice scale
      // and buy a full six-node move.
      const game: MiniGameId = room.currentMiniGame ?? 'voice_arena';
      const basePoints = Math.max(0, Number(body.pointsEarned) || 0);
      const socialRound = room.socialRound?.targetPlayerId === active.id ? room.socialRound : null;
      const reactionBonus = sumReactionBonus(socialRound?.reactions ?? []);
      const passVotes = socialRound?.judgeVotes.filter((vote) => vote.vote === 'pass').length ?? 0;
      const failVotes = socialRound?.judgeVotes.filter((vote) => vote.vote === 'fail').length ?? 0;
      const judgeBonus = passVotes > failVotes ? JUDGE_PASS_BONUS : 0;
      const points = basePoints + reactionBonus + judgeBonus;
      const performance = scoreToPerformance(game, points);
      const steps = performanceToSteps(performance);
      const coinsEarned = Math.floor(performance * 100);

      active.score += coinsEarned;
      // In Team Battle the same points also feed the crew total, which is what
      // the series is actually won on.
      creditTeam(room, active, coinsEarned);
      active.vibeScore = (active.vibeScore ?? 0) + reactionBonus + passVotes * 10;
      const badge = pickSocialBadge(socialRound, performance);
      const gotNewBadge = addBadge(active, badge);
      updatePlayerLevel(active);
      room.turnResult = { game, pointsEarned: coinsEarned, performance, steps };

      pushEvent(
        room,
        `${MINIGAME_ICONS[game]} ${active.name} earned ${coinsEarned} coins in ${MINIGAME_LABELS[game]} → ${steps} step${steps === 1 ? '' : 's'}`,
        coinsEarned > 0 ? 'point' : 'debuff'
      );

      pushEvent(
        room,
        `${active.name}: ${basePoints} skill + ${reactionBonus + judgeBonus} social bonus`,
        reactionBonus + judgeBonus > 0 ? 'social' : 'system'
      );
      if (gotNewBadge) {
        pushEvent(room, `${active.name} earned badge: ${badge}`, 'social');
      }

      // Bank it against the round. Everyone plays the mini-game before anyone
      // shops or rolls, so results accumulate here rather than being spent
      // immediately.
      room.roundResults = (room.roundResults ?? []).filter((r) => r.playerId !== active.id);
      room.roundResults.push({
        playerId: active.id,
        playerName: active.name,
        game,
        pointsEarned: coinsEarned,
        performance,
        steps,
        rolled: false,
      });

      if (performance <= MINIGAME_FAIL_THRESHOLD) chargeFailedChallenge(room, active, game);

      // Open the roast so the room can laugh at what just happened.
      room.phase = 'roast_intermission';
      return NextResponse.json({
        room: await writeRoom(room),
        result: room.turnResult,
        summary: describePerformance(performance),
      });
    }

    case 'finish_roast': {
      finishRoast(room);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'buy_powerup': {
      // Everyone shops at the same time now, so the buyer is whoever asked —
      // not whoever happens to be the active player.
      const buyer = room.players.find((p) => p.id === body.playerId);
      if (!buyer) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

      const item = getShopItem(String(body.powerupId ?? ''));
      if (!item) return NextResponse.json({ error: 'Unknown item' }, { status: 400 });
      if (buyer.score < item.price) {
        return NextResponse.json({ error: `Not enough points for ${item.name}` }, { status: 409 });
      }

      buyer.score -= item.price;
      buyer.inventory.push(item.id);
      pushEvent(room, `🛒 ${buyer.name} bought ${item.name} (-${item.price} pts)`, 'buff');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'finish_shopping': {
      const playerId = String(body.playerId ?? '');
      if (!room.players.some((p) => p.id === playerId)) {
        return NextResponse.json({ error: 'Player not found' }, { status: 404 });
      }

      room.shopReady = [...new Set([...(room.shopReady ?? []), playerId])];

      // The board opens when everyone still connected has finished buying.
      const waitingOn = activePlayers(room).filter((p) => !room.shopReady!.includes(p.id));
      if (waitingOn.length === 0) {
        openBoardPhase(room);
      }
      return NextResponse.json({ room: await writeRoom(room), waitingOn: waitingOn.map((p) => p.name) });
    }

    case 'roll_dice': {
      const active = room.players[room.activePlayerIndex];
      if (!active) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      // The mini-game decides roll order; the dice movement itself stays random.
      const entry = (room.roundResults ?? []).find((r) => r.playerId === active.id);
      if (entry) {
        if (entry.rolled) {
          return NextResponse.json({ error: 'Already rolled this round' }, { status: 409 });
        }
        entry.rolled = true;
      }

      const die1 = Math.floor(Math.random() * 6) + 1;
      const die2 = Math.floor(Math.random() * 6) + 1;
      const roll = die1 + die2;

      let currentId = active.boardPosition;
      let remaining = roll;

      while (remaining > 0) {
        const node = BOARD_GRAPH[currentId];
        if (!node || node.next.length === 0) {
          break;
        }
        if (node.next.length > 1) {
          active.boardPosition = currentId;
          active.remainingSteps = remaining;
          room.phase = 'branch_choice';
          pushEvent(room, `🎲 ${active.name} rolled ${roll} and reached a fork in the road!`, 'system');
          return NextResponse.json({ room: await writeRoom(room), roll, waitingForBranch: true });
        }
        currentId = node.next[0];
        remaining--;
      }

      pushEvent(room, `🎲 ${active.name} rolled ${roll}`, 'system');
      const outcome = applyLanding(room, active, currentId);
      const commitMine = await resolveMineLanding(roomId, room, active);
      const rolled = await writeRoom(room);
      await commitMine();

      return NextResponse.json({ room: rolled, roll, outcome });
    }

    case 'choose_branch': {
      const active = room.players[room.activePlayerIndex];
      if (!active || room.phase !== 'branch_choice') {
        return NextResponse.json({ error: 'Invalid branch choice state' }, { status: 400 });
      }

      const chosenNodeId = body.nodeId;
      const currentNode = BOARD_GRAPH[active.boardPosition];

      if (!currentNode || !currentNode.next.includes(chosenNodeId)) {
        return NextResponse.json({ error: 'Invalid branch selection' }, { status: 400 });
      }

      let currentId = chosenNodeId;
      let remaining = (active.remainingSteps ?? 1) - 1; // Consume one step for the chosen node

      while (remaining > 0) {
        const node = BOARD_GRAPH[currentId];
        if (!node || node.next.length === 0) {
          break; // Finish line
        }
        if (node.next.length > 1) {
          // Another fork!
          active.boardPosition = currentId;
          active.remainingSteps = remaining;
          pushEvent(room, `🧭 ${active.name} reached another fork!`, 'system');
          return NextResponse.json({ room: await writeRoom(room), waitingForBranch: true });
        }
        currentId = node.next[0];
        remaining--;
      }

      // Reached the end of remaining steps
      delete active.remainingSteps;
      // Back to the normal roadmap turn phase — applyLanding may move it on
      // again if the tile starts a dare, a duel or the sudden-death trap.
      room.phase = 'roadmap_turn';
      const outcome = applyLanding(room, active, currentId);
      const commitMine = await resolveMineLanding(roomId, room, active);
      const branched = await writeRoom(room);
      await commitMine();

      return NextResponse.json({ room: branched, outcome });
    }

    case 'resolve_dare': {
      const target = room.players.find((p) => p.id === body.targetPlayerId);
      if (target) {
        if (body.passed) {
          target.score += 100;
          pushEvent(room, `🎉 ${target.name} PASSED the dare (+100 pts)`, 'buff');
        } else {
          // Failing used to cost a single node, which a 2–12 roll swallows whole
          // — the dare read as having no consequence at all. Bombing it now
          // undoes the move that landed you here and holds you off the next
          // roll, so a failed dare actually stops you advancing.
          const from = target.boardPosition;
          target.boardPosition = walkBack(from, DARE_FAIL_SETBACK);
          target.skipNextTurn = true;
          pushEvent(
            room,
            `💥 ${target.name} FAILED the dare — back ${DARE_FAIL_SETBACK} spaces and loses the next roll!`,
            'debuff'
          );
          pushBoardEvent(room, 'asteroid', target, {
            banner: '💥 DARE FAILED!',
            message: `${target.name} could not pull it off — dragged back and benched for a turn.`,
            fromNode: from,
            toNode: target.boardPosition,
          });
        }
      }
      room.currentDare = null;
      // Hand the board back. startDare parks the room in `peer_dare`, so
      // without this the game would sit on a resolved dare forever.
      if (room.phase === 'peer_dare') {
        room.phase = 'roadmap_turn';
        armRollDeadline(room);
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /**
     * Spends a powerup.
     *
     * Four of the six used to fall through to a log line that changed nothing —
     * the shop sold shields, dare guns, freezes and bombs that did not exist.
     * Each now has a real effect, and the offensive ones require a target that
     * the server validates rather than trusting.
     */
    case 'use_powerup': {
      const active = room.players[room.activePlayerIndex];
      const powerupId = String(body.powerupId ?? '');
      if (!active) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      const item = getShopItem(powerupId);
      if (!item) return NextResponse.json({ error: 'Unknown powerup' }, { status: 400 });

      const owned = active.inventory.indexOf(powerupId);
      if (owned === -1) {
        return NextResponse.json({ error: 'Powerup not in inventory' }, { status: 409 });
      }

      // Resolve the victim before spending anything, so a bad target does not
      // consume the item.
      let target: Player | undefined;
      if (item.target === 'opponent') {
        target = room.players.find((p) => p.id === String(body.targetPlayerId ?? ''));
        if (!target || target.id === active.id) {
          return NextResponse.json({ error: 'Choose an opponent to use that on' }, { status: 400 });
        }
        if (target.connected === false) {
          return NextResponse.json({ error: `${target.name} has dropped out` }, { status: 409 });
        }
      } else if (item.target === 'leader') {
        target = [...activePlayers(room)].sort((a, b) => b.score - a.score)[0];
        if (!target) return NextResponse.json({ error: 'Nobody to target' }, { status: 409 });
      }

      active.inventory.splice(owned, 1);

      // A shield on the victim eats the whole effect. This is the promise the
      // shop makes — "block the next asteroid, dare or freeze" — and it applies
      // to incoming powerups, not just to tiles.
      const shielded = !!target && target.id !== active.id && !!target.hasShield;
      if (shielded && target) {
        target.hasShield = false;
        pushEvent(room, `🛡️ ${target.name} blocked ${active.name}'s ${item.name}!`, 'buff');
        pushBoardEvent(room, 'shield_block', active, {
          targetPlayerId: target.id,
          targetPlayerName: target.name,
          banner: '🛡️ BLOCKED!',
          message: `${target.name}'s shield absorbed the ${item.name}.`,
        });
        return NextResponse.json({ room: await writeRoom(room), blocked: true });
      }

      switch (powerupId) {
        case 'boost': {
          const from = active.boardPosition;
          active.boardPosition = walkForward(from, 3);
          pushEvent(room, `🚀 ${active.name} used Rocket Nitro (+3 spaces)`, 'buff');
          pushBoardEvent(room, 'boost', active, {
            banner: '🚀 ROCKET NITRO!',
            message: `${active.name} burns 3 spaces further down the road.`,
            fromNode: from,
            toNode: active.boardPosition,
          });
          if (active.boardPosition === FINISH_NODE) declareWinner(room, active);
          break;
        }

        case 'rewind': {
          if (!target) break;
          const from = target.boardPosition;
          target.boardPosition = walkBack(from, 2);
          pushEvent(room, `⏪ ${active.name} shoved ${target.name} back 2 spaces`, 'debuff');
          pushBoardEvent(room, 'rewind', active, {
            targetPlayerId: target.id,
            targetPlayerName: target.name,
            banner: '⏪ REWIND TRAP!',
            message: `${active.name} shoved ${target.name} back 2 spaces.`,
            fromNode: from,
            toNode: target.boardPosition,
          });
          break;
        }

        case 'shield': {
          active.hasShield = true;
          pushEvent(room, `🛡️ ${active.name} raised a Magic Shield`, 'buff');
          pushBoardEvent(room, 'shield_up', active, {
            banner: '🛡️ SHIELD UP!',
            message: `${active.name} is protected from the next hit.`,
          });
          break;
        }

        case 'dare_gun': {
          if (!target) break;
          startDare(room, target, active);
          pushBoardEvent(room, 'dare', active, {
            targetPlayerId: target.id,
            targetPlayerName: target.name,
            banner: '🎤 DARE GUN!',
            message: `${active.name} put ${target.name} on the spot.`,
          });
          break;
        }

        case 'freeze': {
          if (!target) break;
          target.skipNextTurn = true;
          pushEvent(room, `❄️ ${active.name} froze ${target.name} — they miss their next roll`, 'debuff');
          pushBoardEvent(room, 'freeze', active, {
            targetPlayerId: target.id,
            targetPlayerName: target.name,
            banner: '❄️ ICE FREEZE!',
            message: `${target.name} misses their next roll.`,
          });
          break;
        }

        case 'bomb': {
          if (!target) break;
          const damage = Math.min(BOMB_DAMAGE, target.score);
          target.score -= damage;
          pushEvent(room, `💣 ${active.name} bombed ${target.name} for ${damage} coins`, 'debuff');
          pushBoardEvent(room, 'bomb', active, {
            targetPlayerId: target.id,
            targetPlayerName: target.name,
            banner: '💣 POINT BOMB!',
            message: `${target.name} lost ${damage} coins off the top.`,
            coins: -damage,
          });
          break;
        }

        case 'mine': {
          const secrets = await readSecrets(roomId);
          const mine = plantMine(secrets, active);
          if (!mine) {
            // Give the item back rather than charging for nothing — which is
            // exactly what this powerup did in every case before today.
            active.inventory.push(powerupId);
            return NextResponse.json(
              { error: 'No clear ground up the road to bury that in' },
              { status: 409 }
            );
          }
          await writeSecrets(roomId, secrets);

          // The room is told a mine exists but never where. Half the value of
          // the item is everyone walking the next few spaces nervously.
          pushEvent(room, `💥 ${active.name} buried something up the road…`, 'debuff');
          // The planter alone gets the space, in the response rather than in
          // room state — the room document is readable by every browser in it.
          return NextResponse.json({ room: await writeRoom(room), minePlantedAt: mine.nodeId });
        }
      }

      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'set_team_mode': {
      const on = body.teamMode === true || body.roomType === 'team_battle';
      room.roomType = on ? 'team_battle' : 'board_game';
      if (on) {
        // Drawn at random on the way in, so the room is looking at a real set of
        // crews the moment team mode turns on rather than sorting six people by
        // hand. The host can re-roll or swap individuals from there.
        applyTeamAssignment(room, shuffleTeams(room.players));
        pushEvent(room, `🤝 Team mode on — crews drawn at random`, 'system');
        pushEvent(room, describeCrews(room), 'system');
      } else {
        // Deleted rather than set to undefined: Firestore treats an explicit
        // undefined as an error, not as "no value".
        room.players.forEach((p) => {
          delete p.teamId;
        });
        room.winningTeam = null;
        pushEvent(room, `👤 Team mode off — every player for themselves`, 'system');
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'set_team': {
      const player = room.players.find((p) => p.id === body.playerId);
      const teamId = body.teamId === 'red' || body.teamId === 'blue' ? body.teamId : null;
      if (!player || !teamId) {
        return NextResponse.json({ error: 'Invalid team change' }, { status: 400 });
      }
      player.teamId = teamId;
      pushEvent(room, `${getTeam(teamId).icon} ${player.name} joined ${getTeam(teamId).name}`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /**
     * Re-draws both crews at random.
     *
     * Named `balance_teams` for the clients that already call it. It used to
     * alternate by array index, which meant it produced the same two crews every
     * single time — pressing it twice did nothing at all.
     */
    case 'balance_teams':
    case 'shuffle_teams': {
      if (room.players.length < 2) {
        return NextResponse.json({ error: 'Need at least two players to make crews' }, { status: 409 });
      }
      // Only before the whistle. Re-drawing crews mid-series would move points
      // that have already been banked to a team.
      if (room.phase !== 'lobby' && room.phase !== 'team_battle_select') {
        return NextResponse.json(
          { error: 'Crews are locked once the battle has started' },
          { status: 409 }
        );
      }

      applyTeamAssignment(room, shuffleTeams(room.players));
      pushEvent(room, `🎲 Crews re-drawn at random`, 'system');
      pushEvent(room, describeCrews(room), 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'switch_team': {
      const target = room.players.find((p) => p.id === body.targetPlayerId);
      const teamId = body.teamId === 'red' || body.teamId === 'blue' ? body.teamId : null;
      if (!target || !teamId) {
        return NextResponse.json({ error: 'Invalid team change' }, { status: 400 });
      }
      target.teamId = teamId;
      pushEvent(room, `${getTeam(teamId).icon} ${target.name} switched to ${getTeam(teamId).name}`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'team_battle_start_series': {
      const games = Array.isArray(body.selectedGames) ? (body.selectedGames as MiniGameId[]) : [];
      if (games.length === 0) {
        return NextResponse.json({ error: 'No games selected' }, { status: 400 });
      }
      // Nobody may sit the series out teamless — their points would vanish.
      ensureTeams(room);

      room.phase = 'team_battle_intro';
      room.teamBattleState = {
        selectedGames: games,
        currentGameIndex: 0,
        currentRound: 1,
        seriesLength: games.length,
      };
      room.teamScores = { red: 0, blue: 0 };
      room.roundResults = [];
      room.currentMiniGame = games[0];
      pushEvent(
        room,
        `⚔️ Team Battle: ${games.length} game${games.length === 1 ? '' : 's'}, Red Crew vs Blue Crew`,
        'system'
      );
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /**
     * Starts the game the series is currently sitting on.
     *
     * This is the missing link. `team_battle_start_series` left the room in
     * `team_battle_intro` and nothing existed to take it further, so the mode
     * stopped dead on the intro screen.
     */
    case 'team_battle_begin_game': {
      if (!room.teamBattleState) {
        return NextResponse.json({ error: 'Not in a team battle' }, { status: 400 });
      }
      if (room.phase !== 'team_battle_intro') {
        return NextResponse.json({ error: 'The game has already started' }, { status: 409 });
      }

      const game = currentSeriesGame(room);
      if (!game) return NextResponse.json({ error: 'The series is finished' }, { status: 409 });

      // Everyone performs this game once, one at a time.
      room.roundResults = [];
      room.currentMiniGame = game;
      pushEvent(
        room,
        `⚔️ Game ${room.teamBattleState.currentGameIndex + 1} of ${room.teamBattleState.seriesLength}: ${MINIGAME_LABELS[game]}`,
        'system'
      );
      advanceRoundOrOpenShop(room);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /** Host override to cut a game short and move the series on. */
    case 'team_battle_next_game': {
      if (!room.teamBattleState) {
        return NextResponse.json({ error: 'Not in a team battle' }, { status: 400 });
      }
      advanceSeries(room);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    // ── AI Master game ────────────────────────────────────────────────────
    case 'ai_master_start': {
      if (room.players.length < 2) {
        return NextResponse.json({ error: 'The AI Master needs at least 2 players' }, { status: 409 });
      }
      room.roomType = 'ai_master';
      room.matchId = `${room.roomId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      room.matchStartedAt = Date.now();
      room.matchArchived = false;
      room.winner = null;
      room.aiMasterState = null;
      for (const player of room.players) {
        player.lives = STARTING_LIVES;
        delete player.eliminated;
      }
      pushEvent(room, `🤖 The AI Master takes the stage — ${ROOM_VIBES[roomVibeOf(room)].label}`, 'system');
      await startAiMasterRound(room);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'ai_master_respond': {
      const state = room.aiMasterState;
      if (!state || state.phase !== 'announcing') {
        return NextResponse.json({ error: 'Nothing to answer right now' }, { status: 409 });
      }
      const responder = room.players.find((p) => p.id === body.playerId);
      if (!responder || responder.id !== state.targetId) {
        return NextResponse.json({ error: 'It is not your challenge' }, { status: 403 });
      }
      state.response = String(body.response ?? '').slice(0, 600);
      state.phase = 'voting';
      pushEvent(room, `🎤 ${responder.name} answered — the room decides`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'ai_master_vote': {
      const state = room.aiMasterState;
      if (!state || state.phase !== 'voting') {
        return NextResponse.json({ error: 'No vote is open' }, { status: 409 });
      }
      // Eliminated players keep their vote on purpose — it is the only thing
      // that makes staying in the room after a knockout worth anything.
      const voter = room.players.find((p) => p.id === body.playerId);
      if (!voter) return NextResponse.json({ error: 'Unknown voter' }, { status: 403 });
      if (voter.id === state.targetId) {
        return NextResponse.json({ error: 'You cannot vote on your own round' }, { status: 403 });
      }
      const verdict = body.verdict === 'pass' ? 'pass' : 'fail';
      state.votes = { ...(state.votes ?? {}), [voter.id]: verdict };

      // Close automatically once everybody entitled to a say has had one.
      const eligible = activePlayers(room).filter((p) => p.id !== state.targetId).length;
      if (Object.keys(state.votes).length >= eligible) await resolveAiMasterRound(room);

      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'ai_master_verdict': {
      const state = room.aiMasterState;
      if (!state || state.phase === 'verdict') {
        return NextResponse.json({ error: 'Round already resolved' }, { status: 409 });
      }
      await resolveAiMasterRound(room);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'ai_master_next_round': {
      if (!room.aiMasterState) {
        return NextResponse.json({ error: 'No AI Master game in progress' }, { status: 409 });
      }
      await startAiMasterRound(room);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'ai_master_bribe': {
      const state = room.aiMasterState;
      if (!state) return NextResponse.json({ error: 'No AI Master game in progress' }, { status: 409 });

      const player = room.players.find((p) => p.id === body.playerId);
      if (!player) return NextResponse.json({ error: 'Unknown player' }, { status: 403 });
      const amount = Math.max(1, Math.floor(Number(body.amount) || 0));
      const ask: AiMasterBribe['ask'] =
        body.ask === 'life' || body.ask === 'redirect' ? body.ask : 'skip';

      if (player.score < amount) {
        return NextResponse.json({ error: 'You cannot afford that' }, { status: 409 });
      }
      if (ask === 'life' && (player.lives ?? STARTING_LIVES) >= STARTING_LIVES) {
        return NextResponse.json({ error: 'Your lives are already full' }, { status: 409 });
      }

      const accepted = judgeBribe(state, player, amount);
      // A refusal still costs something. Trying to buy the host and walking away
      // with your money back would make offering one a free roll.
      const cost = accepted ? amount : Math.ceil(amount / 3);
      player.score = Math.max(0, player.score - cost);

      const record: AiMasterBribe = { playerId: player.id, playerName: player.name, amount, ask, accepted };

      if (accepted) {
        if (ask === 'life') {
          player.lives = Math.min(STARTING_LIVES, (player.lives ?? STARTING_LIVES) + 1);
          if (player.lives > 0) delete player.eliminated;
        } else if (ask === 'skip' && state.targetId === player.id && state.phase !== 'verdict') {
          state.phase = 'verdict';
          state.passed = true;
          state.revealedAt = Date.now();
        } else if (ask === 'redirect' && state.targetId === player.id && state.phase === 'announcing') {
          const victim = survivors(room).filter((p) => p.id !== player.id)[
            Math.floor(Math.random() * Math.max(1, survivors(room).length - 1))
          ];
          if (victim) {
            state.targetId = victim.id;
            state.votes = {};
            room.activePlayerIndex = Math.max(0, room.players.findIndex((p) => p.id === victim.id));
            pushEvent(room, `🔀 ${player.name} paid to shove the challenge onto ${victim.name}!`, 'debuff');
          }
        }
        record.hostLine =
          (await askHost(roomVibeOf(room), `In one short sentence, corruptly accept ${player.name}'s bribe of ${amount} points. Be shameless about it.`)) ??
          `${player.name}, your generosity has been noted. Consider it handled.`;
        pushEvent(room, `🤝 The AI Master took ${player.name}'s ${cost} points…`, 'social');
      } else {
        record.hostLine =
          (await askHost(roomVibeOf(room), `In one short sentence, publicly refuse ${player.name}'s bribe of ${amount} points and mock them for trying.`)) ??
          `${player.name} tried to buy me off. Adorable. Keep playing.`;
        pushEvent(room, `🚫 ${player.name} tried to bribe the AI Master and lost ${cost} points`, 'social');
      }

      state.bribes = [...(state.bribes ?? []), record].slice(-8);
      state.hostLine = record.hostLine;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'update_room_vibe': {
      const vibe = body.roomVibe;
      if (typeof vibe !== 'string' || !(vibe in ROOM_VIBES)) {
        return NextResponse.json({ error: 'Unknown room vibe' }, { status: 400 });
      }
      room.roomVibe = vibe as keyof typeof ROOM_VIBES;
      pushEvent(room, `${ROOM_VIBES[room.roomVibe].emoji} Room vibe set to ${ROOM_VIBES[room.roomVibe].label}`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'update_minigames': {
      const games = Array.isArray(body.miniGames) ? (body.miniGames as MiniGameId[]) : null;
      const valid = games?.filter((g) => ALL_MINI_GAMES.includes(g)) ?? [];
      if (valid.length === 0) {
        return NextResponse.json({ error: 'Enable at least one mini-game' }, { status: 400 });
      }
      room.enabledMiniGames = valid;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'start_match': {
      await clearMines(roomId);
      // Identifies this match in the permanent `matches` collection. Minted
      // here rather than at archive time so every row is traceable back to the
      // room and the moment it started, and so a match that ends twice cannot
      // produce two rows.
      room.matchId = `${room.roomId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      room.matchStartedAt = Date.now();
      room.matchArchived = false;

      // This action starts the board game and Team Battle only — chess, ludo
      // and AI Master each have their own. Without this a room that had just
      // played one of those would start a board match still labelled with the
      // old mode, and the game-over screen would read it back.
      if (room.roomType !== 'team_battle') room.roomType = 'board_game';

      room.roundNumber = 1;
      room.roundResults = [];
      room.rollOrder = [];
      room.rollIndex = 0;
      room.shopReady = [];
      room.turnResult = null;
      for (const player of room.players) {
        player.lives = STARTING_LIVES;
        delete player.eliminated;
      }

      if (room.enabledMiniGames?.includes('story_builder')) {
        room.storyBuilderState = { prompt: '', story: [], currentPlayerIndex: 0, phase: 'prompting', votes: {} };
      }
      if (room.enabledMiniGames?.includes('debate')) {
        room.debateState = { player1Id: '', player2Id: '', topic: '', side1: '', side2: '', phase: 'intro', votes: {} };
      }
      if (room.enabledMiniGames?.includes('guess_the_voice')) {
        room.guessTheVoiceState = { performerId: '', prompt: '', audioBlobUrl: null, phase: 'prompting', votes: {} };
      }

      if (room.roomType === 'team_battle') {
        ensureTeams(room);
        room.phase = 'team_battle_select';
        pushEvent(room, `⚔️ Team Battle begins!`, 'system');
      } else {
        pushEvent(room, `🚀 Round 1 begins`, 'system');
        advanceRoundOrOpenShop(room);
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /**
     * Ends the current match and returns the room to the lobby.
     *
     * The only exit before this was "leave game", which removes you from the
     * room altogether — so a group who wanted to abandon a match and start a
     * different mode had to disband and re-share the code. This keeps everyone
     * where they are and just clears the board.
     *
     * Per-match state is wiped so the next match starts fresh; social
     * progression (level, vibe, badges) is earned by the person, not the match,
     * and survives.
     */
    case 'end_match': {
      if (room.phase === 'lobby') {
        return NextResponse.json({ error: 'Already in the lobby' }, { status: 409 });
      }

      await clearMines(roomId);

      // Before the wipe below, not after — the reset clears scores, positions
      // and the winner, which is most of what the record is made of. If this
      // match already ended with a winner it was archived then, and
      // archiveMatch's create() makes the second call a no-op.
      await archiveMatch(room, room.winner ? 'winner' : 'ended_early');

      for (const player of room.players) {
        player.boardPosition = 0;
        player.score = 0;
        player.lives = STARTING_LIVES;
        player.inventory = [];
        delete player.hasShield;
        delete player.skipNextTurn;
        delete player.remainingSteps;
        delete player.eliminated;
      }

      room.phase = 'lobby';
      room.matchId = null;
      room.matchStartedAt = null;
      room.matchArchived = false;
      room.winner = null;
      room.winningTeam = null;
      room.teamScores = room.roomType === 'team_battle' ? { red: 0, blue: 0 } : undefined;
      room.teamBattleState = null;
      room.roundNumber = 0;
      room.roundResults = [];
      room.rollOrder = [];
      room.rollIndex = 0;
      room.shopReady = [];
      room.turnResult = null;
      room.boardEvent = null;
      room.rollDeadline = null;
      clearPhaseDeadline(room);
      room.currentDare = null;
      room.socialRound = null;
      room.liveState = null;
      room.recentMiniGames = [];
      room.truthBluffState = null;
      room.storyBuilderState = null;
      room.debateState = null;
      room.triviaState = null;
      room.guessTheVoiceState = null;
      room.aiMasterState = null;

      pushEvent(room, `🏁 ${room.players.find((p) => p.id === body.callerId)?.name ?? 'The host'} ended the match — back to the lobby`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /** Hands the dice to the next player in the round's roll order. */
    case 'advance_turn': {
      advanceRoll(room);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    // ── Presence ─────────────────────────────────────────────────────────────

    /**
     * Called on a timer by every client, so the server can tell who is still here.
     *
     * This is also where absentees get pruned. It used to happen in GET, but
     * clients read the room straight from Firestore now and nothing calls GET —
     * which left the heartbeat timeout dead and rounds hanging on players who
     * had closed the tab.
     */
    case 'heartbeat': {
      const me = room.players.find((p) => p.id === body.playerId);
      if (!me) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

      const now = Date.now();
      const wasAway = me.connected === false;
      // Only persist once the stored timestamp is going stale. Writing the whole
      // room document on every beat from every player pushes a snapshot to the
      // entire room several times a second to move one number.
      const needsRefresh = now - (me.lastSeen ?? 0) > PRESENCE_TIMEOUT_MS / 3;
      // A blown roll deadline has to break out of the skip too, otherwise the
      // stall is only noticed on whichever heartbeat happens to also be due a
      // timestamp refresh — up to twice as long as the deadline the room was
      // shown on the clock.
      const rollStalled =
        (room.phase === 'roadmap_turn' || room.phase === 'branch_choice') &&
        !!room.rollDeadline &&
        now >= room.rollDeadline;
      // Same reasoning for the waits before the board: a blown deadline that is
      // only noticed on whichever beat happens to also be due a refresh leaves
      // the room sitting there for up to PRESENCE_TIMEOUT_MS/3 longer.
      const phaseStalled = phaseHasStalled(room, now);

      if (!wasAway && !needsRefresh && !rollStalled && !phaseStalled) {
        return NextResponse.json({ ok: true });
      }

      me.lastSeen = now;
      if (wasAway) {
        me.connected = true;
        pushEvent(room, `🔌 ${me.name} reconnected`, 'system');
      }
      prunePresence(room);
      expireStalledRoll(room, now);
      expireStalledPhase(room, now);
      // Arm the clock for whatever the room is waiting on now. Last, so it sees
      // the phase the two expiries above may have just moved it into, and so a
      // fresh wait is never handed a deadline that has already passed.
      syncPhaseDeadline(room, now);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /**
     * "This tab is going away" — sent by the unload beacon.
     *
     * Deliberately does NOT remove the player: `pagehide` also fires on a plain
     * refresh, and ejecting someone from their own game because they reloaded
     * is far worse than waiting out the heartbeat. Marking them away skips their
     * turn immediately, and a reload re-registers them within a second.
     */
    case 'mark_away': {
      const me = room.players.find((p) => p.id === body.playerId);
      if (me && me.connected !== false) {
        me.connected = false;
        me.lastSeen = 0;
        unstickPhase(room);
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'leave_room':
    case 'kick_player': {
      const targetId = String(body.playerId ?? '');
      const target = room.players.find((p) => p.id === targetId);
      if (!target) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

      if (action === 'kick_player') {
        // Only the host removes other people.
        if (body.requesterId !== room.hostId) {
          return NextResponse.json({ error: 'Only the host can remove players' }, { status: 403 });
        }
        if (targetId === room.hostId) {
          return NextResponse.json({ error: 'The host cannot be removed' }, { status: 400 });
        }
      }

      room.players = room.players.filter((p) => p.id !== targetId);
      room.roundResults = (room.roundResults ?? []).filter((r) => r.playerId !== targetId);
      room.rollOrder = (room.rollOrder ?? []).filter((id) => id !== targetId);
      room.shopReady = (room.shopReady ?? []).filter((id) => id !== targetId);
      pushEvent(
        room,
        action === 'kick_player' ? `🚫 ${target.name} was removed` : `👋 ${target.name} left the game`,
        'system'
      );

      if (room.players.length === 0) {
        // Nobody left — park it back in the lobby rather than a broken turn.
        room.phase = 'lobby';
        return NextResponse.json({ room: await writeRoom(room) });
      }

      // Hand on the host badge if the host is the one who left.
      if (targetId === room.hostId) {
        const heir = room.players[0];
        heir.isHost = true;
        room.hostId = heir.id;
        pushEvent(room, `👑 ${heir.name} is now the host`, 'system');
      }

      if (room.activePlayerIndex >= room.players.length) room.activePlayerIndex = 0;
      unstickPhase(room);
      return NextResponse.json({ room: await writeRoom(room) });
    }

    // ── Chess Game Actions ──────────────────────────────────────────────────
    case 'chess_start_match': {
      const mode = (body.mode as '1v1' | '2v2' | 'vs_ai') || '1v1';
      const timeControl = (body.timeControl as ChessTimeControl) || 'blitz_5m';
      const botDifficulty = (body.botDifficulty as BotDifficulty) || 'navigator';

      let baseTimeMs = 300_000;
      let incMs = 0;
      if (timeControl === 'bullet_1m') { baseTimeMs = 60_000; incMs = 0; }
      else if (timeControl === 'blitz_3m') { baseTimeMs = 180_000; incMs = 2_000; }
      else if (timeControl === 'blitz_5m') { baseTimeMs = 300_000; incMs = 3_000; }
      else if (timeControl === 'rapid_10m') { baseTimeMs = 600_000; incMs = 5_000; }
      else if (timeControl === 'casual') { baseTimeMs = 86_400_000; incMs = 0; } // 24h

      const chess = new Chess();
      const whitePlayers: any[] = [];
      const blackPlayers: any[] = [];
      const spectators: string[] = [];

      if (mode === 'vs_ai') {
        const human = room.players[0] || makePlayer('Player', 0, true);
        whitePlayers.push({ playerId: human.id, name: human.name, avatar: human.avatar?.faceUrl, color: 'w', teamSlot: 1 });
        blackPlayers.push({ playerId: 'bot_ai', name: `Deep Star (${botDifficulty.toUpperCase()})`, avatar: '/avatars/robot_face.jpg', color: 'b', teamSlot: 1, isAi: true });
      } else if (mode === '1v1') {
        const p1 = room.players[0];
        const p2 = room.players[1] || { id: 'p2_temp', name: 'Opponent' };
        if (p1) whitePlayers.push({ playerId: p1.id, name: p1.name, avatar: p1.avatar?.faceUrl, color: 'w', teamSlot: 1 });
        if (p2) blackPlayers.push({ playerId: p2.id, name: p2.name, avatar: (p2 as any).avatar?.faceUrl, color: 'b', teamSlot: 1 });
        for (let i = 2; i < room.players.length; i++) spectators.push(room.players[i].id);
      } else if (mode === '2v2') {
        // 2v2 consultation mode
        const p1 = room.players[0];
        const p2 = room.players[1];
        const p3 = room.players[2];
        const p4 = room.players[3];
        if (p1) whitePlayers.push({ playerId: p1.id, name: p1.name, avatar: p1.avatar?.faceUrl, color: 'w', teamSlot: 1 });
        if (p2) whitePlayers.push({ playerId: p2.id, name: p2.name, avatar: p2.avatar?.faceUrl, color: 'w', teamSlot: 2 });
        if (p3) blackPlayers.push({ playerId: p3.id, name: p3.name, avatar: p3.avatar?.faceUrl, color: 'b', teamSlot: 1 });
        if (p4) blackPlayers.push({ playerId: p4.id, name: p4.name, avatar: p4.avatar?.faceUrl, color: 'b', teamSlot: 2 });
        for (let i = 4; i < room.players.length; i++) spectators.push(room.players[i].id);
      }

      room.roomType = 'chess';
      room.phase = 'chess_match';
      room.chessState = {
        mode,
        timeControl,
        fen: chess.fen(),
        pgn: '',
        history: [],
        turn: 'w',
        isCheck: false,
        isCheckmate: false,
        isDraw: false,
        isStalemate: false,
        whitePlayers,
        blackPlayers,
        spectators,
        clocks: {
          whiteTimeMs: baseTimeMs,
          blackTimeMs: baseTimeMs,
          incrementMs: incMs,
          lastTickTimestamp: Date.now(),
          activeColor: 'w',
          isRunning: timeControl !== 'casual',
        },
        proposals: { w: null, b: null },
        botDifficulty,
        lastMove: null,
      };

      pushEvent(room, `♟️ Chess Match started! Mode: ${mode.toUpperCase()}`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'chess_make_move': {
      if (!room.chessState) {
        return NextResponse.json({ error: 'No active chess match' }, { status: 400 });
      }

      const { from, to, promotion } = body;
      const cs = room.chessState;
      const chess = new Chess(cs.fen);

      // Verify the caller is on the side to move.
      //
      // `|| cs.mode === 'vs_ai'` used to short-circuit this entirely, so in a
      // match against the computer ANY caller — including a spectator — could
      // play moves for either colour. The bot is now allowed only on Black's
      // turn, and only from the client that drives it (the host).
      const callerId = body.callerId ?? body.playerId;
      const activeSlots = cs.turn === 'w' ? cs.whitePlayers : cs.blackPlayers;
      const isOnActiveSide = activeSlots.some((s) => s.playerId === callerId);
      const isBotMove = cs.mode === 'vs_ai' && cs.turn === 'b' && callerId === room.hostId;

      if (!isOnActiveSide && !isBotMove) {
        return NextResponse.json({ error: 'It is not your turn to move' }, { status: 403 });
      }

      try {
        const move = chess.move({ from, to, promotion: promotion || 'q' });
        if (!move) {
          return NextResponse.json({ error: 'Illegal move' }, { status: 400 });
        }

        // Update Clock
        const now = Date.now();
        const elapsed = now - cs.clocks.lastTickTimestamp;
        if (cs.clocks.isRunning) {
          if (cs.turn === 'w') {
            cs.clocks.whiteTimeMs = Math.max(0, cs.clocks.whiteTimeMs - elapsed + cs.clocks.incrementMs);
          } else {
            cs.clocks.blackTimeMs = Math.max(0, cs.clocks.blackTimeMs - elapsed + cs.clocks.incrementMs);
          }
        }
        cs.clocks.lastTickTimestamp = now;
        cs.clocks.activeColor = chess.turn();

        cs.fen = chess.fen();
        cs.pgn = chess.pgn();
        cs.history.push(move.san);
        cs.turn = chess.turn();
        cs.isCheck = chess.inCheck();
        cs.isCheckmate = chess.isCheckmate();
        cs.isDraw = chess.isDraw();
        cs.isStalemate = chess.isStalemate();
        cs.lastMove = { from: move.from, to: move.to, san: move.san };

        // Clear team proposals for the side that just moved
        if (move.color === 'w') cs.proposals.w = null;
        else cs.proposals.b = null;

        if (cs.isCheckmate) {
          cs.winner = move.color;
          cs.winReason = 'Checkmate';
          cs.clocks.isRunning = false;
          pushEvent(room, `👑 Checkmate! ${move.color === 'w' ? 'White' : 'Black'} wins!`, 'system');
        } else if (cs.isDraw || cs.isStalemate) {
          cs.winner = 'draw';
          cs.winReason = cs.isStalemate ? 'Stalemate' : 'Draw';
          cs.clocks.isRunning = false;
          pushEvent(room, `🤝 Game drawn (${cs.winReason})`, 'system');
        } else if (cs.isCheck) {
          pushEvent(room, `⚔️ ${move.san} - Check!`, 'system');
        }

        return NextResponse.json({ room: await writeRoom(room) });
      } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Invalid move' }, { status: 400 });
      }
    }

    case 'chess_propose_move': {
      if (!room.chessState || room.chessState.mode !== '2v2') {
        return NextResponse.json({ error: '2v2 consultation mode required' }, { status: 400 });
      }
      const { from, to, promotion, san } = body;
      const callerId = body.playerId;
      const cs = room.chessState;
      const player = room.players.find((p) => p.id === callerId);

      const isWhite = cs.whitePlayers.some((p) => p.playerId === callerId);
      const isBlack = cs.blackPlayers.some((p) => p.playerId === callerId);

      if (!isWhite && !isBlack) {
        return NextResponse.json({ error: 'Only active team members can propose moves' }, { status: 403 });
      }

      const proposal = {
        proposerId: callerId,
        proposerName: player?.name || 'Teammate',
        from,
        to,
        promotion,
        san,
        timestamp: Date.now(),
      };

      if (isWhite) cs.proposals.w = proposal;
      else cs.proposals.b = proposal;

      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'chess_resign': {
      if (!room.chessState) return NextResponse.json({ error: 'No chess game active' }, { status: 400 });
      const cs = room.chessState;
      const callerId = body.playerId;
      const isWhite = cs.whitePlayers.some((p) => p.playerId === callerId);
      const isBlack = cs.blackPlayers.some((p) => p.playerId === callerId);

      if (!isWhite && !isBlack) return NextResponse.json({ error: 'Only players can resign' }, { status: 403 });

      cs.winner = isWhite ? 'b' : 'w';
      cs.winReason = 'Resignation';
      cs.clocks.isRunning = false;
      pushEvent(room, `🏳️ ${isWhite ? 'White' : 'Black'} resigned.`, 'system');

      return NextResponse.json({ room: await writeRoom(room) });
    }

    /**
     * Ends a match on time.
     *
     * The clock only ever moved when somebody made a move, so a player who ran
     * out simply sat at 0:00 forever and the game could not finish. The server
     * re-derives the remaining time rather than trusting the client that
     * noticed — a browser claiming "they flagged" is not evidence.
     */
    case 'chess_timeout': {
      const cs = room.chessState;
      if (!cs) return NextResponse.json({ error: 'No chess game active' }, { status: 400 });
      if (cs.winner) return NextResponse.json({ room, alreadyOver: true });
      if (!cs.clocks.isRunning) {
        return NextResponse.json({ error: 'The clock is not running' }, { status: 409 });
      }

      const elapsed = Date.now() - cs.clocks.lastTickTimestamp;
      const remaining =
        cs.turn === 'w' ? cs.clocks.whiteTimeMs - elapsed : cs.clocks.blackTimeMs - elapsed;

      if (remaining > 0) {
        return NextResponse.json({ error: 'That side still has time', remaining }, { status: 409 });
      }

      if (cs.turn === 'w') cs.clocks.whiteTimeMs = 0;
      else cs.clocks.blackTimeMs = 0;

      cs.winner = cs.turn === 'w' ? 'b' : 'w';
      cs.winReason = 'Timeout';
      cs.clocks.isRunning = false;
      pushEvent(room, `⏰ ${cs.turn === 'w' ? 'White' : 'Black'} ran out of time.`, 'system');

      return NextResponse.json({ room: await writeRoom(room) });
    }

    /** Withdraws a 2v2 move suggestion so the pair are not stuck with it. */
    case 'chess_clear_proposal': {
      const cs = room.chessState;
      if (!cs) return NextResponse.json({ error: 'No chess game active' }, { status: 400 });

      const callerId = body.callerId ?? body.playerId;
      const isWhite = cs.whitePlayers.some((p) => p.playerId === callerId);
      const isBlack = cs.blackPlayers.some((p) => p.playerId === callerId);
      if (!isWhite && !isBlack) {
        return NextResponse.json({ error: 'Only players on that side can clear it' }, { status: 403 });
      }

      if (isWhite) cs.proposals.w = null;
      else cs.proposals.b = null;

      return NextResponse.json({ room: await writeRoom(room) });
    }

    // ── Ludo Game Actions ───────────────────────────────────────────────────
    case 'ludo_start_match': {
      const colors: LudoColor[] = ['red', 'green', 'yellow', 'blue'];
      const players: LudoPlayer[] = [];

      // Assign existing human players to colors, fill remainder with bots
      for (let i = 0; i < 4; i++) {
        const color = colors[i];
        if (i < room.players.length) {
          const human = room.players[i];
          players.push({
            playerId: human.id,
            name: human.name,
            avatar: human.avatar?.faceUrl,
            color,
            isAi: false,
          });
        } else {
          players.push({
            playerId: `bot_${color}`,
            name: `Bot ${color.toUpperCase()}`,
            avatar: '/avatars/robot_face.jpg',
            color,
            isAi: true,
          });
        }
      }

      const tokens: Record<LudoColor, LudoToken[]> = {
        red: [0, 1, 2, 3].map((id) => ({ id, color: 'red', position: -1 })),
        green: [0, 1, 2, 3].map((id) => ({ id, color: 'green', position: -1 })),
        yellow: [0, 1, 2, 3].map((id) => ({ id, color: 'yellow', position: -1 })),
        blue: [0, 1, 2, 3].map((id) => ({ id, color: 'blue', position: -1 })),
      };

      room.roomType = 'ludo';
      room.phase = 'ludo_match';
      room.ludoState = {
        players,
        activeColor: 'red',
        diceValue: null,
        hasRolled: false,
        consecutiveSixes: 0,
        tokens,
        winner: null,
        rankings: [],
        lastActionText: 'Game started! Red rolls first.',
      };

      pushEvent(room, `🎲 Ludo Match started! 4 Players ready.`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'ludo_roll_dice': {
      if (!room.ludoState) return NextResponse.json({ error: 'No active Ludo match' }, { status: 400 });
      const ls = room.ludoState;
      if (ls.hasRolled) return NextResponse.json({ error: 'Already rolled this turn' }, { status: 400 });

      const roll = Math.floor(Math.random() * 6) + 1;
      ls.diceValue = roll;
      ls.hasRolled = true;

      const activeColor = ls.activeColor;
      const myTokens = ls.tokens[activeColor];

      if (roll === 6) {
        ls.consecutiveSixes += 1;
      } else {
        ls.consecutiveSixes = 0;
      }

      // Three consecutive 6s penalty -> forfeit turn immediately
      if (ls.consecutiveSixes >= 3) {
        ls.consecutiveSixes = 0;
        ls.hasRolled = false;
        ls.diceValue = null;
        ls.lastActionText = `3 consecutive 6s! ${activeColor.toUpperCase()} forfeits turn.`;
        // Advance turn
        const nextIdx = (LUDO_COLOR_ORDER.indexOf(activeColor) + 1) % 4;
        ls.activeColor = LUDO_COLOR_ORDER[nextIdx];
        return NextResponse.json({ room: await writeRoom(room) });
      }

      const validMoves = myTokens.filter((t) => canMoveLudoToken(t, roll));

      if (validMoves.length === 0) {
        // No legal moves: pass turn to next color
        ls.lastActionText = `${activeColor.toUpperCase()} rolled a ${roll} (no moves).`;
        ls.hasRolled = false;
        ls.diceValue = null;
        const nextIdx = (LUDO_COLOR_ORDER.indexOf(activeColor) + 1) % 4;
        ls.activeColor = LUDO_COLOR_ORDER[nextIdx];
      } else if (validMoves.length === 1) {
        // Auto-move single option for speedy mobile play!
        const token = validMoves[0];
        const nextPos = getLudoNextPosition(token, roll);
        token.position = nextPos;

        // Check capture
        let captured = false;
        if (nextPos >= 0 && nextPos < 52 && !SAFE_POSITIONS.has(nextPos)) {
          for (const [color, enemyTokens] of Object.entries(ls.tokens)) {
            if (color === activeColor) continue;
            for (const enemy of enemyTokens) {
              if (enemy.position === nextPos) {
                enemy.position = -1; // Sent home!
                captured = true;
                pushEvent(room, `💥 ${activeColor.toUpperCase()} captured ${color.toUpperCase()}!`, 'debuff');
              }
            }
          }
        }

        // Check victory
        const isFinished = myTokens.every((t) => t.position === 999);
        if (isFinished && !ls.winner) {
          ls.winner = activeColor;
          ls.rankings.push(activeColor);
          pushEvent(room, `🏆 ${activeColor.toUpperCase()} won the Ludo Match!`, 'system');
        }

        ls.lastActionText = `${activeColor.toUpperCase()} moved token ${token.id + 1} with a ${roll}!`;

        // Grant bonus turn on 6 or capture
        if (roll === 6 || captured) {
          ls.hasRolled = false;
          ls.diceValue = null;
          ls.lastActionText += ' (Bonus Roll!)';
        } else {
          ls.hasRolled = false;
          ls.diceValue = null;
          const nextIdx = (LUDO_COLOR_ORDER.indexOf(activeColor) + 1) % 4;
          ls.activeColor = LUDO_COLOR_ORDER[nextIdx];
        }
      }

      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'ludo_move_token': {
      if (!room.ludoState) return NextResponse.json({ error: 'No active Ludo match' }, { status: 400 });
      const ls = room.ludoState;
      const { tokenId } = body;
      const roll = ls.diceValue;

      if (!ls.hasRolled || !roll) {
        return NextResponse.json({ error: 'Must roll dice first' }, { status: 400 });
      }

      const activeColor = ls.activeColor;
      const token = ls.tokens[activeColor].find((t) => t.id === tokenId);
      if (!token || !canMoveLudoToken(token, roll)) {
        return NextResponse.json({ error: 'Invalid token move' }, { status: 400 });
      }

      const nextPos = getLudoNextPosition(token, roll);
      token.position = nextPos;

      // Check capture
      let captured = false;
      if (nextPos >= 0 && nextPos < 52 && !SAFE_POSITIONS.has(nextPos)) {
        for (const [color, enemyTokens] of Object.entries(ls.tokens)) {
          if (color === activeColor) continue;
          for (const enemy of enemyTokens) {
            if (enemy.position === nextPos) {
              enemy.position = -1;
              captured = true;
              pushEvent(room, `💥 ${activeColor.toUpperCase()} captured ${color.toUpperCase()}!`, 'debuff');
            }
          }
        }
      }

      // Check victory
      const isFinished = ls.tokens[activeColor].every((t) => t.position === 999);
      if (isFinished && !ls.winner) {
        ls.winner = activeColor;
        ls.rankings.push(activeColor);
        pushEvent(room, `🏆 ${activeColor.toUpperCase()} won the Ludo Match!`, 'system');
      }

      ls.lastActionText = `${activeColor.toUpperCase()} moved token ${token.id + 1} with a ${roll}!`;

      // Bonus roll if 6 or capture
      if (roll === 6 || captured) {
        ls.hasRolled = false;
        ls.diceValue = null;
        ls.lastActionText += ' (Bonus Roll!)';
      } else {
        ls.hasRolled = false;
        ls.diceValue = null;
        const nextIdx = (LUDO_COLOR_ORDER.indexOf(activeColor) + 1) % 4;
        ls.activeColor = LUDO_COLOR_ORDER[nextIdx];
      }

      return NextResponse.json({ room: await writeRoom(room) });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
