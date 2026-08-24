import { NextResponse } from 'next/server';
import { GamePhase, MiniGameId, Player, RoomState, SocialReactionId, SocialRound } from '@/lib/types';
import { AVATARS } from '@/lib/gameContent';
import {
  DEFAULT_TURN_SECONDS,
  JUDGE_PASS_BONUS,
  MAX_PLAYERS,
  MINIGAME_LABELS,
  REACTION_POINTS,
  TOTAL_TILES,
  describePerformance,
  getShopItem,
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

async function createRoom(roomId: string, hostName: string): Promise<{ room: RoomState; playerId: string }> {
  const host = makePlayer(hostName, 0, true);
  const room: RoomState = {
    roomId,
    hostId: host.id,
    phase: 'lobby',
    players: [host],
    activePlayerIndex: 0,
    selectedLanguages: ['hausa', 'igbo', 'yoruba', 'pidgin'],
    mathEnabled: true,
    trapWords: [],
    currentChallenge: null,
    turnTimeLimit: DEFAULT_TURN_SECONDS,
    currentDare: null,
    winner: null,
    theme: 'forest',
    events: [],
    enabledMiniGames: ['voice_arena', 'pitch_bird'],
    currentMiniGame: 'voice_arena',
    turnResult: null,
    socialRound: null,
  };
  pushEvent(room, `🎮 ${host.name} opened room ${roomId}`, 'system');
  await writeRoom(room);
  return { room, playerId: host.id };
}

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  const room = await readRoom(params.roomId.toUpperCase());
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
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
      // Reopening an existing code should not wipe the players already in it.
      return NextResponse.json({ room: existing, playerId: existing.hostId });
    }
    const created = await createRoom(roomId, body.playerName);
    return NextResponse.json(created);
  }

  const room = await readRoom(roomId);
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
        return NextResponse.json({ room: await writeRoom(room), playerId: existing.id });
      }
      if (room.players.length >= MAX_PLAYERS) {
        return NextResponse.json({ error: `Room is full (max ${MAX_PLAYERS} players)` }, { status: 409 });
      }
      const player = makePlayer(name, room.players.length, false);
      room.players.push(player);
      pushEvent(room, `🎮 ${player.name} joined the room`, 'system');
      return NextResponse.json({ room: await writeRoom(room), playerId: player.id });
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

    // Both mini-games finish through here. The score is banked as points AND
    // converted into the movement the player earned for the board.
    case 'complete_voice_turn':
    case 'complete_pitch_bird': {
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
        `${game === 'pitch_bird' ? '🐦' : '🎙️'} ${active.name} scored ${points} in ${MINIGAME_LABELS[game]} → ${steps} step${steps === 1 ? '' : 's'}`,
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

      // Open 15-second open-mic roast intermission so players can laugh & roast each other.
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

      room.phase = 'powerup_shop';
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'buy_powerup': {
      const active = room.players[room.activePlayerIndex];
      if (!active) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      const item = getShopItem(String(body.powerupId ?? ''));
      if (!item) return NextResponse.json({ error: 'Unknown item' }, { status: 400 });
      if (active.score < item.price) {
        return NextResponse.json({ error: `Not enough points for ${item.name}` }, { status: 409 });
      }

      active.score -= item.price;
      active.inventory.push(item.id);
      pushEvent(room, `🛒 ${active.name} bought ${item.name} (-${item.price} pts)`, 'buff');
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'finish_shopping': {
      room.phase = 'roadmap_turn';
      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'roll_dice': {
      const active = room.players[room.activePlayerIndex];
      if (!active) return NextResponse.json({ error: 'No active player' }, { status: 409 });

      // Not random. The dice reveals the movement the mini-game earned, so a
      // good round is worth six nodes and a missed one is worth one.
      if (!room.turnResult) {
        return NextResponse.json(
          { error: 'Play the mini-game first — the roll comes from your score' },
          { status: 409 }
        );
      }

      const roll = room.turnResult.steps;
      const landed = Math.min(TOTAL_TILES - 1, active.boardPosition + roll);
      const outcome = resolveTile(landed);
      active.boardPosition = outcome.position;
      // Consumed, so the turn cannot be rolled twice.
      room.turnResult = null;

      pushEvent(room, `🎲 ${active.name} rolled ${roll} → node #${outcome.position + 1}`, 'system');
      if (outcome.banner) {
        pushEvent(room, `${outcome.banner} (${active.name})`, outcome.position < landed ? 'debuff' : 'buff');
      }

      if (outcome.isFinish) {
        room.winner = active;
        room.phase = 'game_over';
        pushEvent(room, `🏆 ${active.name} won the roadmap!`, 'system');
      }

      return NextResponse.json({ room: await writeRoom(room), roll, outcome });
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
        active.boardPosition = Math.min(TOTAL_TILES - 1, active.boardPosition + 3);
        pushEvent(room, `🚀 ${active.name} used Rocket Nitro (+3 spaces)`, 'buff');
      } else if (powerupId === 'rewind') {
        active.boardPosition = Math.max(0, active.boardPosition - 2);
        pushEvent(room, `⏪ ${active.name} used Rewind`, 'debuff');
      } else {
        pushEvent(room, `⚡ ${active.name} used ${powerupId}`, 'buff');
      }

      return NextResponse.json({ room: await writeRoom(room) });
    }

    case 'update_minigames': {
      const games = Array.isArray(body.miniGames) ? (body.miniGames as MiniGameId[]) : null;
      const valid = games?.filter((g) => g === 'voice_arena' || g === 'pitch_bird') ?? [];
      if (valid.length === 0) {
        return NextResponse.json({ error: 'Enable at least one mini-game' }, { status: 400 });
      }
      room.enabledMiniGames = valid;
      return NextResponse.json({ room: await writeRoom(room) });
    }

    // Starting the match and ending a turn both hand the next player a freshly
    // picked mini-game, so the qualifying round always comes before the board.
    case 'start_match':
    case 'advance_turn': {
      if (action === 'advance_turn') {
        room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;
      }

      room.turnResult = null;
      const game = pickMiniGame(room.enabledMiniGames ?? ['voice_arena', 'pitch_bird']);
      room.currentMiniGame = game;
      room.phase = game === 'pitch_bird' ? 'pitch_bird' : 'qualifying_voice';

      const next = room.players[room.activePlayerIndex];
      if (next) {
        room.socialRound = { targetPlayerId: next.id, reactions: [], judgeVotes: [] };
      }
      if (next) {
        pushEvent(room, `${game === 'pitch_bird' ? '🐦' : '🎙️'} ${next.name}'s turn — ${MINIGAME_LABELS[game]}`, 'system');
      }
      return NextResponse.json({ room: await writeRoom(room) });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
