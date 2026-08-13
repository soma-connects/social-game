import { NextResponse } from 'next/server';
import { GamePhase, MiniGameId, Player, RoomState, SocialReactionId, SocialRound, TeamId } from '@/lib/types';
import { AVATARS } from '@/lib/gameContent';
import {
  DEFAULT_TURN_SECONDS,
  JUDGE_PASS_BONUS,
  MAX_PLAYERS,
  ALL_MINI_GAMES,
  MINIGAME_ICONS,
  MINIGAME_LABELS,
  REACTION_POINTS,
  BOARD_GRAPH,
  FINISH_NODE,
  alternateByTeam,
  balanceTeams,
  describePerformance,
  getShopItem,
  getTeam,
  miniGamePhase,
  performanceToSteps,
  pickMiniGame,
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
} from '@/lib/server/roomServer';
import { aiGameMaster } from '@/lib/aiGameMaster';

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
 * Phases that are waiting on one specific performer, so losing them means the
 * round has to be skipped rather than waited out.
 *
 * Derived from the mini-game list instead of hand-listed: every game added since
 * this check was written — trivia, asteroid defense, the vote-based rounds —
 * was missing from it, and the room hung when its performer dropped.
 */
const PERFORMER_PHASES = new Set<GamePhase>([
  ...ALL_MINI_GAMES.map(miniGamePhase),
  'roast_intermission',
]);

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
    const game = pickMiniGame(room.enabledMiniGames ?? ALL_MINI_GAMES);
    room.currentMiniGame = game;
    room.phase = miniGamePhase(game);
    room.socialRound = { targetPlayerId: next.id, reactions: [], judgeVotes: [] };
    room.liveState = null;
    pushEvent(room, `${MINIGAME_ICONS[game]} ${next.name} is up — ${MINIGAME_LABELS[game]}`, 'system');
    return;
  }

  // Everyone has played: the whole room shops together.
  room.liveState = null;
  room.phase = 'powerup_shop';
  room.shopReady = [];
  pushEvent(room, `🛒 Round ${room.roundNumber ?? 1}: everyone to the buff shop`, 'system');
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

function syncActiveToRollOrder(room: RoomState): void {
  const id = (room.rollOrder ?? [])[room.rollIndex ?? 0];
  const idx = room.players.findIndex((p) => p.id === id);
  if (idx !== -1) room.activePlayerIndex = idx;
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
  'update_phase',
  'start_match',
  'set_team_mode',
  'set_team',
  'switch_team',
  'balance_teams',
  'team_battle_start_series',
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

/** Ends the match. In team mode one player crossing wins it for their whole crew. */
function declareWinner(room: RoomState, player: Player): void {
  room.winner = player;
  room.phase = 'game_over';
  if (room.roomType === 'team_battle' && player.teamId) {
    room.winningTeam = player.teamId;
    const team = getTeam(player.teamId);
    pushEvent(room, `🏆 ${player.name} took ${team.name} across the finish line!`, 'system');
  } else {
    pushEvent(room, `🏆 ${player.name} won the roadmap!`, 'system');
  }
}

/** Wipes round state and sends everyone back to the mini-game. */
function startNextRound(room: RoomState): void {
  room.roundNumber = (room.roundNumber ?? 0) + 1;
  room.roundResults = [];
  room.rollOrder = [];
  room.rollIndex = 0;
  room.shopReady = [];
  room.turnResult = null;
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
  roomType: 'board_game' | 'team_battle' = 'board_game'
): Promise<{ room: RoomState; playerId: string; token: string }> {
  const host = makePlayer(hostName, 0, true);
  const room: RoomState = {
    roomId,
    hostId: host.id,
    phase: 'lobby',
    roomType,
    players: [host],
    activePlayerIndex: 0,
    // Hausa and Yoruba are parked until there is a recogniser that can hear
    // them; math rounds are gone — this is a voice game, not a quiz.
    selectedLanguages: ['english', 'spelling_bee'],
    mathEnabled: false,
    trapWords: [],
    currentChallenge: null,
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
      const created = await createRoom(roomId, body.playerName, body.roomType || 'board_game');
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
      return await applyAction(room, action, body);
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
      if (mine) {
        mine.lastSeen = Date.now();
        if (mine.connected === false) mine.connected = true;
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
      if (body.theme) room.theme = body.theme;
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
        prompt: room.currentChallenge?.word || 'Truth or Bluff',
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

    case 'complete_team_battle': {
      room.phase = 'team_battle_recap';
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

      // Open the roast so the room can laugh at what just happened.
      room.phase = 'roast_intermission';
      return NextResponse.json({
        room: await writeRoom(room),
        result: room.turnResult,
        summary: describePerformance(performance),
      });
    }

    case 'finish_roast': {
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

      const outcome = resolveTile(currentId, active.hasShield);
      active.boardPosition = outcome.position;

      if (outcome.grantsShield) active.hasShield = true;
      if (outcome.breaksShield) active.hasShield = false;

      pushEvent(room, `🎲 ${active.name} rolled ${roll} → node #${outcome.position + 1}`, 'system');
      if (outcome.banner) {
        pushEvent(room, `${outcome.banner} (${active.name})`, outcome.setback ? 'debuff' : 'buff');
      }

      if (outcome.isFinish) {
        declareWinner(room, active);
      } else if (outcome.triggersTrap) {
        room.phase = 'debate';
        pushEvent(room, `🚨 SUDDEN DEATH TRAP! ${active.name} triggered a Debate!`, 'system');
      }

      return NextResponse.json({ room: await writeRoom(room), roll, outcome });
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
      room.phase = 'roadmap_turn'; // Back to the normal roadmap turn phase
      const outcome = resolveTile(currentId, active.hasShield);
      active.boardPosition = outcome.position;

      if (outcome.grantsShield) active.hasShield = true;
      if (outcome.breaksShield) active.hasShield = false;

      if (outcome.banner) {
        pushEvent(room, `${outcome.banner} (${active.name})`, outcome.setback ? 'debuff' : 'buff');
      }

      if (outcome.isFinish) {
        declareWinner(room, active);
      } else if (outcome.triggersTrap) {
        room.phase = 'debate';
        pushEvent(room, `🚨 SUDDEN DEATH TRAP! ${active.name} triggered a Debate!`, 'system');
      }

      return NextResponse.json({ room: await writeRoom(room), outcome });
    }

    case 'resolve_dare': {
      const target = room.players.find((p) => p.id === body.targetPlayerId);
      if (target) {
        if (body.passed) {
          target.score += 100;
          pushEvent(room, `🎉 ${target.name} PASSED the dare (+100 pts)`, 'buff');
        } else {
          target.boardPosition = walkBack(target.boardPosition, 1);
          pushEvent(room, `💥 ${target.name} FAILED the dare (Whaala!)`, 'debuff');
        }
      }
      room.currentDare = null;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'use_powerup': {
      const active = room.players[room.activePlayerIndex];
      const powerupId = String(body.powerupId ?? '');
      if (!active) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      const owned = active.inventory.indexOf(powerupId);
      if (owned === -1) {
        return NextResponse.json({ error: 'Powerup not in inventory' }, { status: 409 });
      }
      active.inventory.splice(owned, 1);

      if (powerupId === 'boost') {
        active.boardPosition = walkForward(active.boardPosition, 3);
        pushEvent(room, `🚀 ${active.name} used Rocket Nitro (+3 spaces)`, 'buff');
        if (active.boardPosition === FINISH_NODE) declareWinner(room, active);
      } else if (powerupId === 'rewind') {
        active.boardPosition = walkBack(active.boardPosition, 2);
        pushEvent(room, `⏪ ${active.name} used Rewind`, 'debuff');
      } else {
        pushEvent(room, `⚡ ${active.name} used ${powerupId}`, 'buff');
      }

      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'set_team_mode': {
      const on = body.teamMode === true || body.roomType === 'team_battle';
      room.roomType = on ? 'team_battle' : 'board_game';
      if (on) {
        // Balance on the way in so nobody has to sort six people by hand.
        const balanced = balanceTeams(room.players);
        room.players.forEach((p, i) => {
          p.teamId = balanced[i].teamId;
        });
        pushEvent(room, `🤝 Team mode on — Red Crew vs Blue Crew`, 'system');
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

    case 'balance_teams': {
      const balanced = balanceTeams(room.players);
      room.players.forEach((p, i) => {
        p.teamId = balanced[i].teamId;
      });
      pushEvent(room, `⚖️ Teams rebalanced`, 'system');
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
      room.phase = 'team_battle_intro';
      room.teamBattleState = {
        selectedGames: games,
        currentGameIndex: 0,
        currentRound: 1,
        seriesLength: games.length,
      };
      room.teamScores = { red: 0, blue: 0 };
      room.currentMiniGame = games[0];
      pushEvent(room, `⚔️ Team Battle Series started!`, 'system');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'team_battle_next_game': {
      if (!room.teamBattleState) {
        return NextResponse.json({ error: 'Not in a team battle' }, { status: 400 });
      }
      room.teamBattleState.currentGameIndex++;
      room.teamBattleState.currentRound++;
      if (room.teamBattleState.currentGameIndex >= room.teamBattleState.seriesLength) {
        room.phase = 'team_battle_recap';
        const redScore = room.teamScores?.red ?? 0;
        const blueScore = room.teamScores?.blue ?? 0;
        room.winningTeam = redScore > blueScore ? 'red' : blueScore > redScore ? 'blue' : null;
      } else {
        room.phase = 'team_battle_intro';
        room.currentMiniGame = room.teamBattleState.selectedGames[room.teamBattleState.currentGameIndex];
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'team_battle_score': {
      const winnerTeam = body.winnerTeam as TeamId;
      if (winnerTeam !== 'red' && winnerTeam !== 'blue') {
        return NextResponse.json({ error: 'Invalid winner team' }, { status: 400 });
      }
      if (!room.teamScores) {
        room.teamScores = { red: 0, blue: 0 };
      }
      room.teamScores[winnerTeam] += 100;
      pushEvent(room, `🔥 Team ${winnerTeam.toUpperCase()} scored 100 points!`, 'system');
      // Set to reveal state or next game. We'll set it to roast_intermission as a temporary reveal state.
      room.phase = 'roast_intermission';
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
      room.roundNumber = 1;
      room.roundResults = [];
      room.rollOrder = [];
      room.rollIndex = 0;
      room.shopReady = [];
      room.turnResult = null;

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
        room.phase = 'team_battle_select';
        pushEvent(room, `⚔️ Team Battle begins!`, 'system');
      } else {
        pushEvent(room, `🚀 Round 1 begins`, 'system');
        advanceRoundOrOpenShop(room);
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    /** Hands the dice to the next player in the round's roll order. */
    case 'advance_turn': {
      room.rollIndex = (room.rollIndex ?? 0) + 1;
      if (room.rollIndex >= (room.rollOrder ?? []).length) {
        startNextRound(room);
      } else {
        syncActiveToRollOrder(room);
        const next = room.players[room.activePlayerIndex];
        if (next) pushEvent(room, `🎲 ${next.name} is up to roll`, 'system');
      }
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
      if (!wasAway && !needsRefresh) {
        return NextResponse.json({ ok: true });
      }

      me.lastSeen = now;
      if (wasAway) {
        me.connected = true;
        pushEvent(room, `🔌 ${me.name} reconnected`, 'system');
      }
      prunePresence(room);
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

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
