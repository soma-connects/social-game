import { NextResponse } from 'next/server';
import { GamePhase, MiniGameId, Player, RoomState, SocialReactionId, SocialRound } from '@/lib/types';
import { AVATARS } from '@/lib/gameContent';
import {
  DEFAULT_TURN_SECONDS,
  JUDGE_PASS_BONUS,
  MAX_PLAYERS,
  ALL_MINI_GAMES,
  MINIGAME_ICONS,
  MINIGAME_LABELS,
  REACTION_POINTS,
  TOTAL_TILES,
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
} from '@/lib/gameRules';
import { pushEvent, readRoom, writeRoom } from '@/lib/server/roomServer';

export const dynamic = 'force-dynamic';

function makePlayer(name: string, index: number, isHost: boolean): Player {
  return {
    id: `player_${isHost ? 'host' : 'guest'}_${Date.now()}_${index}`,
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
  if (
    room.phase === 'qualifying_voice' ||
    room.phase === 'pitch_bird' ||
    room.phase === 'solfege' ||
    room.phase === 'roast_intermission'
  ) {
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
  if (room.teamMode) {
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

/** Wipes round state and sends everyone back to the mini-game. */
function startNextRound(room: RoomState): void {
  room.roundNumber = (room.roundNumber ?? 0) + 1;
  room.roundResults = [];
  room.rollOrder = [];
  room.rollIndex = 0;
  room.shopReady = [];
  room.turnResult = null;
  pushEvent(room, `🔄 Round ${room.roundNumber} — back to the mini-games`, 'system');
  advanceRoundOrOpenShop(room);
}

function createRoom(roomId: string, hostName: string): { room: RoomState; playerId: string } {
  const host = makePlayer(hostName, 0, true);
  const room: RoomState = {
    roomId,
    hostId: host.id,
    phase: 'lobby',
    players: [host],
    activePlayerIndex: 0,
    // Hausa and Yoruba are parked until there is a recogniser that can hear
    // them; math rounds are gone — this is a voice game, not a quiz.
    selectedLanguages: ['igbo', 'pidgin'],
    mathEnabled: false,
    trapWords: [],
    currentChallenge: null,
    turnTimeLimit: DEFAULT_TURN_SECONDS,
    currentDare: null,
    winner: null,
    theme: 'forest',
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
  writeRoom(room);
  return { room, playerId: host.id };
}

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  const room = readRoom(params.roomId.toUpperCase());
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  // Every client polls this, so it is the natural place to notice that somebody
  // stopped reporting and to unstick a phase that is waiting on them.
  if (prunePresence(room)) writeRoom(room);
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
    const existing = readRoom(roomId);
    if (existing) {
      // Reopening an existing code should not wipe the players already in it.
      return NextResponse.json({ room: existing, playerId: existing.hostId });
    }
    const created = createRoom(roomId, body.playerName);
    return NextResponse.json(created);
  }

  const room = readRoom(roomId);
  if (!room) {
    // Every other action needs a room that already exists. Silently creating one
    // here is what used to make a guest the host of an empty room.
    return NextResponse.json({ error: 'Room not found', roomId }, { status: 404 });
  }

  switch (action) {
    case 'join': {
      const name = String(body.playerName ?? '').trim();
      const existing = room.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        return NextResponse.json({ room: writeRoom(room), playerId: existing.id });
      }
      if (room.players.length >= MAX_PLAYERS) {
        return NextResponse.json({ error: `Room is full (max ${MAX_PLAYERS} players)` }, { status: 409 });
      }
      const player = makePlayer(name, room.players.length, false);
      if (room.teamMode) {
        // Drop them on the smaller crew so a late joiner does not lopside it.
        const red = room.players.filter((p) => p.teamId === 'red').length;
        const blue = room.players.filter((p) => p.teamId === 'blue').length;
        player.teamId = red <= blue ? 'red' : 'blue';
      }
      room.players.push(player);
      pushEvent(room, `🎮 ${player.name} joined the room`, 'system');
      return NextResponse.json({ room: writeRoom(room), playerId: player.id });
    }

    case 'add_trap': {
      const word = String(body.trapWord ?? '').trim();
      if (!word) return NextResponse.json({ error: 'Trap word is required' }, { status: 400 });
      room.trapWords.push({
        id: `trap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        word,
        authorId: body.authorId || '',
        authorName: body.authorName || 'Opponent Player',
        targetPlayerId: body.targetPlayerId,
        used: false,
      });
      pushEvent(room, `⚡ ${body.authorName || 'Someone'} armed a trap word`, 'debuff');
      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'mark_trap_used': {
      const trap = room.trapWords.find((t) => t.id === body.trapId);
      if (trap) trap.used = true;
      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'update_settings': {
      if (Array.isArray(body.languages) && body.languages.length > 0) {
        room.selectedLanguages = body.languages;
      }
      if (typeof body.mathEnabled === 'boolean') room.mathEnabled = body.mathEnabled;
      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'set_theme': {
      if (body.theme) room.theme = body.theme;
      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'set_avatar': {
      const player = room.players.find((p) => p.id === body.playerId);
      const avatar = AVATARS.find((a) => a.id === body.avatarId);
      if (!player || !avatar) {
        return NextResponse.json({ error: 'Player or avatar not found' }, { status: 404 });
      }

      player.avatar = avatar;
      pushEvent(room, `${player.name} switched avatar to ${avatar.name}`, 'social');
      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'update_phase': {
      if (!body.phase) return NextResponse.json({ error: 'Phase is required' }, { status: 400 });
      room.phase = body.phase as GamePhase;
      return NextResponse.json({ room: writeRoom(room) });
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

      return NextResponse.json({ room: writeRoom(room) });
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
      writeRoom(room);
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
      if (room.teamMode && voter.teamId && voter.teamId === target.teamId) {
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
      return NextResponse.json({ room: writeRoom(room) });
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

      active.score += points;
      active.vibeScore = (active.vibeScore ?? 0) + reactionBonus + passVotes * 10;
      const badge = pickSocialBadge(socialRound, performance);
      const gotNewBadge = addBadge(active, badge);
      updatePlayerLevel(active);
      room.turnResult = { game, pointsEarned: points, performance, steps };

      pushEvent(
        room,
        `${MINIGAME_ICONS[game]} ${active.name} scored ${points} in ${MINIGAME_LABELS[game]} → ${steps} step${steps === 1 ? '' : 's'}`,
        points > 0 ? 'point' : 'debuff'
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
        pointsEarned: points,
        performance,
        steps,
        rolled: false,
      });

      // Open the roast so the room can laugh at what just happened.
      room.phase = 'roast_intermission';
      return NextResponse.json({
        room: writeRoom(room),
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
      return NextResponse.json({ room: writeRoom(room) });
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
      return NextResponse.json({ room: writeRoom(room) });
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
      return NextResponse.json({ room: writeRoom(room), waitingOn: waitingOn.map((p) => p.name) });
    }

    case 'roll_dice': {
      const active = room.players[room.activePlayerIndex];
      if (!active) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      // Not random. The dice reveals the movement this player's mini-game
      // earned earlier in the round.
      const entry = (room.roundResults ?? []).find((r) => r.playerId === active.id);
      if (!entry) {
        return NextResponse.json(
          { error: 'Play the mini-game first — the roll comes from your score' },
          { status: 409 }
        );
      }
      if (entry.rolled) {
        return NextResponse.json({ error: 'Already rolled this round' }, { status: 409 });
      }

      const roll = entry.steps;
      entry.rolled = true;
      const landed = Math.min(TOTAL_TILES - 1, active.boardPosition + roll);
      const outcome = resolveTile(landed);
      active.boardPosition = outcome.position;

      pushEvent(room, `🎲 ${active.name} rolled ${roll} → node #${outcome.position + 1}`, 'system');
      if (outcome.banner) {
        pushEvent(room, `${outcome.banner} (${active.name})`, outcome.position < landed ? 'debuff' : 'buff');
      }

      if (outcome.isFinish) {
        room.winner = active;
        room.phase = 'game_over';
        if (room.teamMode && active.teamId) {
          // One player crossing the line wins it for their whole crew.
          room.winningTeam = active.teamId;
          const team = getTeam(active.teamId);
          pushEvent(room, `🏆 ${active.name} took ${team.name} across the finish line!`, 'system');
        } else {
          pushEvent(room, `🏆 ${active.name} won the roadmap!`, 'system');
        }
      }

      return NextResponse.json({ room: writeRoom(room), roll, outcome });
    }

    case 'resolve_dare': {
      const target = room.players.find((p) => p.id === body.targetPlayerId);
      if (target) {
        if (body.passed) {
          target.score += 100;
          pushEvent(room, `🎉 ${target.name} PASSED the dare (+100 pts)`, 'buff');
        } else {
          target.boardPosition = Math.max(0, target.boardPosition - 1);
          pushEvent(room, `💥 ${target.name} FAILED the dare (Whaala!)`, 'debuff');
        }
      }
      room.currentDare = null;
      return NextResponse.json({ room: writeRoom(room) });
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
        active.boardPosition = Math.min(TOTAL_TILES - 1, active.boardPosition + 3);
        pushEvent(room, `🚀 ${active.name} used Rocket Nitro (+3 spaces)`, 'buff');
      } else if (powerupId === 'rewind') {
        active.boardPosition = Math.max(0, active.boardPosition - 2);
        pushEvent(room, `⏪ ${active.name} used Rewind`, 'debuff');
      } else {
        pushEvent(room, `⚡ ${active.name} used ${powerupId}`, 'buff');
      }

      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'set_team_mode': {
      const on = body.teamMode === true;
      room.teamMode = on;
      if (on) {
        // Balance on the way in so nobody has to sort six people by hand.
        const balanced = balanceTeams(room.players);
        room.players.forEach((p, i) => {
          p.teamId = balanced[i].teamId;
        });
        pushEvent(room, `🤝 Team mode on — Red Crew vs Blue Crew`, 'system');
      } else {
        room.players.forEach((p) => {
          p.teamId = undefined;
        });
        room.winningTeam = null;
        pushEvent(room, `👤 Team mode off — every player for themselves`, 'system');
      }
      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'set_team': {
      const player = room.players.find((p) => p.id === body.playerId);
      const teamId = body.teamId === 'red' || body.teamId === 'blue' ? body.teamId : null;
      if (!player || !teamId) {
        return NextResponse.json({ error: 'Invalid team change' }, { status: 400 });
      }
      player.teamId = teamId;
      pushEvent(room, `${getTeam(teamId).icon} ${player.name} joined ${getTeam(teamId).name}`, 'system');
      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'balance_teams': {
      const balanced = balanceTeams(room.players);
      room.players.forEach((p, i) => {
        p.teamId = balanced[i].teamId;
      });
      pushEvent(room, `⚖️ Teams rebalanced`, 'system');
      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'update_minigames': {
      const games = Array.isArray(body.miniGames) ? (body.miniGames as MiniGameId[]) : null;
      const valid = games?.filter((g) => ALL_MINI_GAMES.includes(g)) ?? [];
      if (valid.length === 0) {
        return NextResponse.json({ error: 'Enable at least one mini-game' }, { status: 400 });
      }
      room.enabledMiniGames = valid;
      return NextResponse.json({ room: writeRoom(room) });
    }

    case 'start_match': {
      room.roundNumber = 1;
      room.roundResults = [];
      room.rollOrder = [];
      room.rollIndex = 0;
      room.shopReady = [];
      room.turnResult = null;
      pushEvent(room, `🚀 Round 1 begins`, 'system');
      advanceRoundOrOpenShop(room);
      return NextResponse.json({ room: writeRoom(room) });
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
      return NextResponse.json({ room: writeRoom(room) });
    }

    // ── Presence ─────────────────────────────────────────────────────────────

    /** Called on a timer by every client, so the server can tell who is still here. */
    case 'heartbeat': {
      const me = room.players.find((p) => p.id === body.playerId);
      if (me) {
        me.lastSeen = Date.now();
        if (me.connected === false) {
          me.connected = true;
          pushEvent(room, `🔌 ${me.name} reconnected`, 'system');
        }
      }
      return NextResponse.json({ room: writeRoom(room) });
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
      return NextResponse.json({ room: writeRoom(room) });
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
        return NextResponse.json({ room: writeRoom(room) });
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
      return NextResponse.json({ room: writeRoom(room) });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
