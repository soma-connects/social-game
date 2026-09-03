'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import GameHeader from '@/components/GameHeader';
import LeftSidebar from '@/components/LeftSidebar';
import RightSidebar from '@/components/RightSidebar';
import MapRenderer from '@/components/MapRenderer';
import RoomLobby from '@/components/RoomLobby';
import VoiceGameController from '@/components/VoiceGameController';
import PitchBirdCanvas from '@/components/PitchBirdCanvas';
import SolfegeGame from '@/components/SolfegeGame';
import SpellingBeeGame from '@/components/SpellingBeeGame';
import TruthOrBluffGame from '@/components/TruthOrBluffGame';
import StoryBuilderGame from '@/components/StoryBuilderGame';
import DebateGame from '@/components/DebateGame';
import GuessTheVoiceGame from '@/components/GuessTheVoiceGame';
import TriviaShowdownGame from '@/components/TriviaShowdownGame';
import AsteroidDefenseGame from '@/components/AsteroidDefenseGame';
import dynamic from 'next/dynamic';

const ChessGame = dynamic(() => import('@/components/chess/ChessGame'), {
  loading: () => <div className="p-8 text-center text-cyan-400 font-bold animate-pulse">Loading Chess Arena...</div>,
});

const LudoGame = dynamic(() => import('@/components/ludo/LudoGame'), {
  loading: () => <div className="p-8 text-center text-amber-400 font-bold animate-pulse">Loading Ludo Arena...</div>,
});
import PowerupShop from '@/components/PowerupShop';
import RoadmapBoard from '@/components/RoadmapBoard';
import TrapWordPicker from '@/components/TrapWordPicker';
import PeerReviewDareModal from '@/components/PeerReviewDareModal';
import AvatarIllustration from '@/components/AvatarIllustration';
import VoiceCallBar from '@/components/VoiceCallBar';
import AiGameMasterBanner from '@/components/AiGameMasterBanner';
import GeminiAiMasterStage from '@/components/GeminiAiMasterStage';
import AiMasterGame from '@/components/AiMasterGame';
import SocialVoicePanel from '@/components/SocialVoicePanel';
import SpectatorView from '@/components/SpectatorView';
import RoastIntermission from '@/components/RoastIntermission';
import BattleScoreboard from '@/components/BattleScoreboard';
import TeamBattleGameSelect from '@/components/TeamBattleGameSelect';
import TeamBattleIntro from '@/components/TeamBattleIntro';
import TeamBattleRecap from '@/components/TeamBattleRecap';
import { aiGameMaster, AiHostPrompt } from '@/lib/aiGameMaster';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { roomStore, RoomSnapshot } from '@/lib/roomStore';
import { DEFAULT_THEME, isPlayableTheme } from '@/lib/themeConfig';
import { MapTheme, MiniGameId, Player } from '@/lib/types';
import { MAX_PLAYERS, BOARD_GRAPH, SHOP_ITEMS, ShopItem, getShopItem, getTeam } from '@/lib/gameRules';
import PowerupTargetPicker from '@/components/PowerupTargetPicker';
import MiniGameBriefing, { useMiniGameBriefing } from '@/components/MiniGameBriefing';
import { MINIGAME_BRIEFINGS } from '@/lib/miniGameBriefings';
import { audioSFX } from '@/lib/audioFeedback';
import { speechEngine } from '@/lib/speechService';
import { voiceChat } from '@/lib/voiceChat';
import { micStream } from '@/lib/micStream';
import {
  UserPlus,
  Sparkles,
  AlertTriangle,
  Trophy,
  RotateCcw,
  Users,
  ScrollText,
  Zap,
  X,
  Map,
  Package,
  ChevronDown,
} from 'lucide-react';

export default function GameRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = ((params?.roomId as string) || 'NJA-ROOM').toUpperCase();

  const [snapshot, setSnapshot] = useState<RoomSnapshot>({ room: null, status: 'connecting', error: null });
  const [showTrapPicker, setShowTrapPicker] = useState(false);
  const [showMobilePlayers, setShowMobilePlayers] = useState(false);
  const [showMobileFeed, setShowMobileFeed] = useState(false);
  const [showMobileInventory, setShowMobileInventory] = useState(false);
  const [showGeminiMode, setShowGeminiMode] = useState(false);
  const [comingSoonTitle, setComingSoonTitle] = useState<string | null>(null);
  const [activeDareTarget, setActiveDareTarget] = useState<Player | null>(null);
  /** Set while an offensive powerup is waiting for a target to be chosen. */
  const [pendingPowerup, setPendingPowerup] = useState<ShopItem | null>(null);
  const [guestNameInput, setGuestNameInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = roomStore.subscribe(setSnapshot);
    roomStore.startPolling(roomId);
    return () => {
      unsubscribe();
      roomStore.stopPolling();
      speechEngine.release();
      voiceChat.leave();
      micStream.stop();
    };
  }, [roomId]);

  const { room, status, error } = snapshot;

  // â”€â”€ Voice replay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Passed explicitly: identity is stored per room, and this reads during the
  // first render, before the effect below tells the store which room we watch.
  const myPlayerId = roomStore.getMyPlayerId(roomId);
  const performer = room?.players[room.activePlayerIndex] ?? null;
  const isPerformer = !!performer && performer.id === myPlayerId;
  const isAttemptPhase =
    room?.phase === 'qualifying_voice' || room?.phase === 'pitch_bird' || room?.phase === 'solfege';

  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!isAttemptPhase || !performer) {
      setCaptureStream(null);
      return;
    }
    const resolve = () =>
      setCaptureStream(isPerformer ? micStream.getStream() : voiceChat.getRemoteStream(performer.id));
    resolve();
    const timer = setInterval(resolve, 600);
    return () => clearInterval(timer);
  }, [isAttemptPhase, isPerformer, performer?.id]);

  const { clip: replayClip, isRecording: isCapturing } = useVoiceRecorder({
    stream: captureStream,
    active: isAttemptPhase && !!captureStream,
    /**
     * A clip belongs to exactly one attempt: this performer, this round, this
     * game. Any of those changing discards it.
     *
     * The game id matters as much as the performer. Keying on performer and
     * round alone left the clip alive when the same player moved to a different
     * mini-game â€” which is the common case in a Team Battle series, and the one
     * where the wrong audio is most confusing.
     */
    sessionKey: `${room?.roundNumber ?? 0}:${performer?.id ?? 'none'}:${room?.currentMiniGame ?? 'none'}`,
  });

  // â”€â”€ Presence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!myPlayerId) return;

    void roomStore.heartbeat(roomId, myPlayerId);
    const timer = setInterval(() => void roomStore.heartbeat(roomId, myPlayerId), 8000);

    const onUnload = () => roomStore.markAwayOnUnload(roomId, myPlayerId);
    window.addEventListener('pagehide', onUnload);

    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [roomId, myPlayerId]);

  /**
   * First-time explanation for whichever mini-game is on screen.
   *
   * Spectators get it too â€” they are about to play the same game next turn, and
   * watching something you do not understand is worse than playing it.
   */
  const inMiniGame = !!room && !!room.currentMiniGame && !!MINIGAME_BRIEFINGS[room.currentMiniGame];
  const {
    showing: briefingGame,
    dismiss: dismissBriefing,
    open: openBriefing,
  } = useMiniGameBriefing(room?.currentMiniGame, inMiniGame);
  const [reviewingBriefing, setReviewingBriefing] = useState(false);

  const handleLeaveGame = useCallback(async () => {
    if (myPlayerId) await roomStore.leaveRoom(roomId, myPlayerId);
    voiceChat.leave();
    micStream.stop();
    router.push('/');
  }, [roomId, myPlayerId, router]);

  const handleJoinAsGuest = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = guestNameInput.trim();
      if (!name) return;

      setIsJoining(true);
      setJoinError(null);
      const result = await roomStore.joinRoom(roomId, name);
      setIsJoining(false);

      if (result.error) {
        setJoinError(result.error);
        return;
      }
      audioSFX.playChoiSuccess();
    },
    [guestNameInput, roomId]
  );

  // ------------------------------------------------------------- connecting

  if (!room && status === 'connecting') {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-partyDark">
        <div className="text-center space-y-3">
          <div className="animate-spin text-5xl">ðŸŽ™ï¸</div>
          <p className="text-sm font-mono text-partyYellow">CONNECTING TO ROOM {roomId}â€¦</p>
        </div>
      </div>
    );
  }

  if (!room || status === 'missing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-partyDark">
        <div className="glass-card max-w-md w-full rounded-3xl p-8 border border-amber-500/50 space-y-5 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h2 className="text-2xl font-black text-white">ROOM {roomId} IS NOT OPEN</h2>
          <p className="text-sm text-gray-300">
            The host may have closed it, or the server restarted. Ask for a fresh link, or start your own room.
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-base py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            <span>BACK TO HOME</span>
          </button>
        </div>
      </div>
    );
  }

  const myPlayer = room.players.find((p) => p.id === myPlayerId);

  // ------------------------------------------------------------- guest join

  if (!myPlayer) {
    const isFull = room.players.length >= MAX_PLAYERS;
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-partyDark relative overflow-hidden">
        <div className="glass-card max-w-md w-full rounded-3xl p-6 sm:p-8 border border-partyYellow/40 space-y-6 text-center shadow-2xl relative z-10 backdrop-blur-xl bg-slate-900/80">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-partyYellow/20 text-partyYellow px-3 py-1 rounded-full text-xs font-black tracking-wider border border-partyYellow/30">
              <Sparkles className="w-3.5 h-3.5" /> JOINING ROOM: {roomId}
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">JOIN AS GUEST PLAYER</h2>
            <p className="text-xs text-gray-300">
              {room.players[0]?.name || 'The host'} invited you to the Voice Party Roadmap Game.
            </p>
          </div>

          {isFull ? (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/50 text-sm text-amber-200">
              This room is full ({MAX_PLAYERS} players). Ask the host to start a new one.
            </div>
          ) : (
            <form onSubmit={handleJoinAsGuest} className="space-y-4 text-left">
              <div className="space-y-2">
                <label className="text-xs font-extrabold text-gray-300 uppercase tracking-wider block">
                  ENTER YOUR PLAYER NAME:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sisi Vibe, Sharp Guyâ€¦"
                  value={guestNameInput}
                  onChange={(e) => setGuestNameInput(e.target.value)}
                  maxLength={20}
                  required
                  className="w-full bg-partyDark/90 border border-white/25 rounded-2xl px-5 py-3.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400 font-bold"
                />
              </div>

              {joinError && (
                <p className="text-xs text-red-300 bg-red-500/15 border border-red-500/40 rounded-xl px-3 py-2">
                  {joinError}
                </p>
              )}

              <button
                type="submit"
                disabled={isJoining || !guestNameInput.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-partyDark font-black text-base py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl glow-emerald"
              >
                <UserPlus className="w-5 h-5" />
                <span>{isJoining ? 'JOININGâ€¦' : `JOIN AS PLAYER ${room.players.length + 1}`}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------- game

  const activePlayer = room.players[room.activePlayerIndex] || room.players[0];
  const leaderPlayer = [...room.players].sort((a, b) => b.score - a.score)[0] || room.players[0];
  const currentTheme: MapTheme = isPlayableTheme(room.theme) ? room.theme : DEFAULT_THEME;
  const isMyTurn = activePlayer?.id === myPlayer.id;

  const handleStartMatch = () => {
    audioSFX.playNollywoodBrass();
    roomStore.startMatch(roomId);
  };

  const handleSelectMode = async (mode: 'board' | 'karaoke' | 'hangout' | 'ai_master' | 'team_battle' | 'chess' | 'ludo') => {
    if (mode === 'board') {
      handleStartMatch();
    } else if (mode === 'chess') {
      audioSFX.playChoiSuccess();
      const numPlayers = room.players.length;
      const chessMode = numPlayers >= 4 ? '2v2' : numPlayers === 1 ? 'vs_ai' : '1v1';
      await roomStore.startChessMatch(roomId, chessMode, 'blitz_5m', 'navigator');
    } else if (mode === 'ludo') {
      audioSFX.playChoiSuccess();
      await roomStore.startLudoMatch(roomId);
    } else if (mode === 'team_battle') {
      // Two steps. Switching the room into team mode reveals the crew roster in
      // the lobby; starting immediately would skip past the one chance anybody
      // has to arrange sides.
      if (room.roomType !== 'team_battle') {
        await roomStore.setTeamMode(roomId, true);
        return;
      }
      handleStartMatch();
    } else if (mode === 'ai_master') {
      audioSFX.playNollywoodBrass();
      await roomStore.startAiMaster(roomId);
    } else if (mode === 'karaoke') {
      setComingSoonTitle('ðŸŽ¤ Karaoke & Pitch Arcade Mode');
    } else if (mode === 'hangout') {
      setComingSoonTitle('ðŸ» 15s Roast & Open-Mic Lounge Mode');
    }
  };

  const handleMiniGameComplete = (game: MiniGameId) => (pointsEarned: number) => {
    roomStore.completeMiniGame(roomId, game, pointsEarned);
  };

  const handleFinishRoast = () => {
    roomStore.finishRoast(roomId);
  };

  const handleFinishShopping = () => {
    roomStore.finishShopping(roomId, myPlayer.id);
  };

  const handleFinishRoadmapTurn = () => {
    roomStore.advanceTurn(roomId);
  };

  /**
   * Spends a powerup, asking who it hits when the item needs a victim.
   *
   * Self items fire straight away; the offensive ones open the picker, because
   * the server now requires a target and rejects the request without one.
   */
  const handleUsePowerup = (powerupId: string) => {
    const item = getShopItem(powerupId);
    if (!item) return;

    if (item.target === 'opponent') {
      setPendingPowerup(item);
      return;
    }
    audioSFX.playPowerUpZap();
    roomStore.usePowerup(roomId, powerupId);
  };

  const handlePickTarget = (target: Player) => {
    if (!pendingPowerup) return;
    audioSFX.playPowerUpZap();
    roomStore.usePowerup(roomId, pendingPowerup.id, target.id);
    setPendingPowerup(null);
  };

  const handleResolveDare = (passed: boolean) => {
    if (room.currentDare) {
      roomStore.resolveDare(roomId, room.currentDare.targetPlayerId, passed);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-partyDark text-white">
      <GameHeader
        roomId={roomId}
        currentTheme={currentTheme}
        onSelectTheme={(t) => roomStore.setTheme(roomId, t)}
        onOpenTrapPicker={() => setShowTrapPicker(true)}
        onGoHome={() => router.push('/')}
        onLeaveGame={handleLeaveGame}
        onEndMatch={() => roomStore.endMatch(roomId)}
        canEndMatch={myPlayer.isHost && room.phase !== 'lobby'}
        showThemeSelector={room.phase !== 'lobby'}
      />

      {status === 'error' && error && (
        <div className="bg-amber-500/20 border-b border-amber-500/50 text-amber-200 text-xs font-bold px-4 py-2 text-center flex items-center justify-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      <div className="max-w-[1700px] mx-auto w-full p-4 sm:p-6 flex flex-col lg:flex-row gap-5 xl:gap-6 flex-1">
        <LeftSidebar
          roomId={roomId}
          players={room.players}
          activePlayerId={activePlayer.id}
          leaderId={leaderPlayer.id}
          myPlayerId={myPlayer.id}
          canManage={myPlayer.isHost}
          roomType={room.roomType}
          onKickPlayer={(p) => roomStore.kickPlayer(roomId, p.id, myPlayer.id)}
        />

        <main className="flex-1 space-y-6">
          <VoiceCallBar
            roomId={roomId}
            players={room.players}
            myPlayer={myPlayer}
            duckRemote={isAttemptPhase && isMyTurn}
            autoMute={isAttemptPhase && !isMyTurn}
            compact={isAttemptPhase}
            autoJoin={room.players.length >= 2}
          />

          {showGeminiMode && (
            <GeminiAiMasterStage
              room={room}
              activePlayer={activePlayer}
              myPlayer={myPlayer}
              onExit={() => setShowGeminiMode(false)}
            />
          )}

          {comingSoonTitle && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
              <div className="glass-card rounded-3xl p-6 sm:p-8 max-w-md w-full border border-partyYellow text-center space-y-4">
                <div className="text-4xl">ðŸš€</div>
                <h3 className="text-xl font-black text-white">{comingSoonTitle}</h3>
                <p className="text-xs text-gray-300">
                  This dedicated mode feature is currently in active development for the next update. Launch Board Game or AI Master Mode to play right now!
                </p>
                <button
                  onClick={() => setComingSoonTitle(null)}
                  className="w-full bg-partyYellow text-partyDark font-black text-sm py-3.5 rounded-xl hover:bg-yellow-400 transition-all shadow-lg"
                >
                  BACK TO LOBBY
                </button>
              </div>
            </div>
          )}

          {room.phase === 'lobby' && (
            <RoomLobby
              room={room}
              myPlayer={myPlayer}
              onStartGame={handleStartMatch}
              onSelectMode={handleSelectMode}
            />
          )}

          {/* The intro and the recap both carry their own, larger scoreboard,
              so the compact bar would just be a second copy on those screens. */}
          {room.roomType === 'team_battle' &&
            room.phase !== 'lobby' &&
            room.phase !== 'game_over' &&
            room.phase !== 'team_battle_intro' &&
            room.phase !== 'team_battle_recap' && <BattleScoreboard room={room} />}

          {room.phase === 'team_battle_select' && (
            <TeamBattleGameSelect room={room} myPlayerId={myPlayer.id} />
          )}

          {room.phase === 'team_battle_intro' && (
            <TeamBattleIntro room={room} myPlayer={myPlayer} />
          )}

          {room.phase === 'team_battle_recap' && (
            <TeamBattleRecap room={room} myPlayer={myPlayer} onGoHome={() => router.push('/')} />
          )}

          {room.phase === 'qualifying_voice' && (
            <div className="space-y-6">
              {isMyTurn ? (
                <VoiceGameController
                  room={room}
                  activePlayer={activePlayer}
                  onCompleteTurn={handleMiniGameComplete('voice_arena')}
                />
              ) : (
                <SpectatorView
                  activePlayer={activePlayer}
                  live={room.liveState ?? null}
                  movingOnAt={room.phaseDeadline ?? null}
                  label="is in the Voice Arena"
                />
              )}
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              {room.roomType !== 'team_battle' && <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />}
            </div>
          )}

          {room.phase === 'pitch_bird' && (
            <div className="space-y-6">
              {isMyTurn ? (
                <PitchBirdCanvas
                  player={activePlayer}
                  roomId={roomId}
                  onComplete={handleMiniGameComplete('pitch_bird')}
                />
              ) : (
                <SpectatorView
                  activePlayer={activePlayer}
                  live={room.liveState ?? null}
                  movingOnAt={room.phaseDeadline ?? null}
                  label="is flying in PitchBird ðŸ¦"
                />
              )}
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              {room.roomType !== 'team_battle' && <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />}
            </div>
          )}

          {room.phase === 'roast_intermission' && (
            <div className="space-y-6">
              <RoastIntermission
                room={room}
                activePlayer={activePlayer}
                myPlayer={myPlayer}
                replayClip={replayClip}
                onFinishRoast={handleFinishRoast}
              />
              {room.roomType !== 'team_battle' && <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />}
            </div>
          )}

          {room.phase === 'solfege' && (
            <div className="space-y-6">
              {isMyTurn ? (
                <SolfegeGame
                  player={activePlayer}
                  roomId={roomId}
                  onComplete={handleMiniGameComplete('solfege')}
                />
              ) : (
                <SpectatorView
                  activePlayer={activePlayer}
                  live={room.liveState ?? null}
                  movingOnAt={room.phaseDeadline ?? null}
                  label="is on the karaoke mic ðŸŽµ"
                />
              )}
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              {room.roomType !== 'team_battle' && <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />}
            </div>
          )}

          {room.phase === 'spelling_bee' && (
            <div className="space-y-6">
              {isMyTurn ? (
                <SpellingBeeGame
                  room={room}
                  activePlayer={activePlayer}
                  onCompleteTurn={handleMiniGameComplete('spelling_bee')}
                />
              ) : (
                <SpectatorView
                  activePlayer={activePlayer}
                  live={room.liveState ?? null}
                  movingOnAt={room.phaseDeadline ?? null}
                  label="is spelling in the Spelling Bee ðŸ"
                />
              )}
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />
            </div>
          )}

          {room.phase === 'truth_or_bluff' && (
            <div className="space-y-6">
              <TruthOrBluffGame
                room={room}
                activePlayer={activePlayer}
                myPlayer={myPlayer}
                isMyTurn={isMyTurn}
                roomId={roomId}
              />
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              {room.roomType !== 'team_battle' && <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />}
            </div>
          )}

          {room.phase === 'story_builder' && (
            <div className="space-y-6">
              <StoryBuilderGame
                room={room}
                activePlayer={activePlayer}
                myPlayer={myPlayer}
                isMyTurn={isMyTurn}
                roomId={roomId}
              />
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
            </div>
          )}

          {room.phase === 'debate' && (
            <div className="space-y-6">
              <DebateGame
                room={room}
                activePlayer={activePlayer}
                myPlayer={myPlayer}
                isMyTurn={isMyTurn}
                roomId={roomId}
              />
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
            </div>
          )}

          {room.phase === 'guess_the_voice' && (
            <div className="space-y-6">
              <GuessTheVoiceGame
                room={room}
                activePlayer={activePlayer}
                myPlayer={myPlayer}
                isMyTurn={isMyTurn}
                roomId={roomId}
              />
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
            </div>
          )}

          {room.phase === 'trivia_showdown' && (
            <div className="space-y-6">
              {isMyTurn ? (
                <TriviaShowdownGame
                  room={room}
                  activePlayer={activePlayer}
                  onCompleteTurn={handleMiniGameComplete('trivia_showdown')}
                />
              ) : (
                <SpectatorView
                  activePlayer={activePlayer}
                  live={room.liveState ?? null}
                  movingOnAt={room.phaseDeadline ?? null}
                  label="is answering Trivia in Trivia Showdown ðŸ§ "
                />
              )}
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />
            </div>
          )}

          {room.phase === 'asteroid_defense' && (
            <div className="space-y-6">
              {isMyTurn ? (
                <AsteroidDefenseGame
                  room={room}
                  activePlayer={activePlayer}
                  onCompleteTurn={handleMiniGameComplete('asteroid_defense')}
                />
              ) : (
                <SpectatorView
                  activePlayer={activePlayer}
                  live={room.liveState ?? null}
                  movingOnAt={room.phaseDeadline ?? null}
                  label="is defending the station from ASTEROIDS â˜„ï¸"
                />
              )}
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />
            </div>
          )}

          {room.phase === 'chess_match' && (
            <div className="space-y-6">
              <ChessGame room={room} myPlayer={myPlayer} roomId={roomId} />
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
            </div>
          )}

          {room.phase === 'ludo_match' && (
            <div className="space-y-6">
              <LudoGame room={room} myPlayer={myPlayer} roomId={roomId} />
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
            </div>
          )}

          {room.phase === 'ai_master_round' && (
            <div className="space-y-6">
              <AiMasterGame room={room} myPlayer={myPlayer} roomId={roomId} />
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
            </div>
          )}

          {room.phase === 'powerup_shop' && (
            <div className="space-y-6">
              <PowerupShop
                roomId={roomId}
                myPlayer={myPlayer}
                myResult={(room.roundResults ?? []).find((r) => r.playerId === myPlayer.id) ?? null}
                closingAt={room.phaseDeadline ?? null}
                ready={(room.shopReady ?? []).includes(myPlayer.id)}
                waitingOn={room.players
                  .filter((p) => !(room.shopReady ?? []).includes(p.id) && p.id !== myPlayer.id)
                  .map((p) => p.name)}
                onDone={handleFinishShopping}
              />
              <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />
            </div>
          )}

          {/* Step 3 â€” move on the main board */}
          {(room.phase === 'roadmap_turn' || room.phase === 'branch_choice') && (
            <>
              <RoadmapBoard
                room={room}
                activePlayer={activePlayer}
                canRoll={isMyTurn && room.phase === 'roadmap_turn'}
                onNextTurn={handleFinishRoadmapTurn}
              />
              {room.phase === 'branch_choice' && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-partyYellow rounded-3xl p-6 max-w-md w-full text-center space-y-6 shadow-2xl">
                    <Map className="w-12 h-12 text-partyYellow mx-auto animate-bounce" />
                    <h2 className="text-2xl font-black text-white">FORK IN THE ROAD!</h2>
                    {isMyTurn ? (
                      <>
                        <p className="text-gray-300">Choose your path wisely to proceed.</p>
                        <div className="flex flex-col gap-3">
                          {BOARD_GRAPH[activePlayer.boardPosition]?.next.map((nextId) => {
                            const node = BOARD_GRAPH[nextId];
                            if (!node) return null;
                            const isRisky = node.type === 'debuff' || node.type === 'trap' || node.type === 'duel';
                            return (
                              <button
                                key={nextId}
                                onClick={() => {
                                  audioSFX.playPop();
                                  void roomStore.send(roomId, { action: 'choose_branch', nodeId: nextId });
                                }}
                                className={`w-full py-4 px-6 rounded-2xl font-black text-white transition-all transform hover:scale-105 active:scale-95 border-2 flex justify-between items-center ${
                                  isRisky 
                                    ? 'bg-red-500/20 border-red-500 hover:bg-red-500/40 text-red-200' 
                                    : 'bg-emerald-500/20 border-emerald-500 hover:bg-emerald-500/40 text-emerald-200'
                                }`}
                              >
                                <span>{isRisky ? 'ðŸ’€ RISKY PATH' : 'ðŸŒ± SAFE PATH'}</span>
                                <span className="opacity-60 text-sm">Node #{nextId + 1}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-300">Waiting for {activePlayer.name} to choose a path...</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {room.phase === 'game_over' && room.winner && (() => {
            // In team mode the crew takes the win, with the player who crossed
            // the line credited underneath.
            const team = room.roomType === 'team_battle' && room.winningTeam ? getTeam(room.winningTeam) : null;
            const crew = team ? room.players.filter((p) => p.teamId === team.id) : [];

            return (
              <div
                className="glass-card rounded-3xl p-8 border text-center space-y-5 glow-yellow"
                style={{ borderColor: team ? team.color : undefined }}
              >
                <Trophy
                  className="w-16 h-16 mx-auto animate-bounce"
                  style={{ color: team ? team.color : '#FFD000' }}
                />
                <h2 className="text-4xl font-black text-white">
                  {team ? `${team.icon} ${team.name.toUpperCase()} WINS!` : `${room.winner.name} WINS!`}
                </h2>

                {team ? (
                  <>
                    <div className="flex justify-center flex-wrap gap-3">
                      {crew.map((member) => (
                        <div key={member.id} className="text-center">
                          <AvatarIllustration avatar={member.avatar} variant="card" size="sm" />
                          <p className="text-[11px] font-black text-white mt-1">{member.name}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm font-bold" style={{ color: team.color }}>
                      Crew total: {crew.reduce((sum, m) => sum + m.score, 0)} points
                    </p>
                    <p className="text-xs text-gray-300">
                      {room.winner.name} crossed the finish line
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-center">
                      <AvatarIllustration avatar={room.winner.avatar} variant="card" size="md" />
                    </div>
                    <p className="text-sm text-partyCyan font-bold">
                      Final score: {room.winner.score} points
                    </p>
                  </>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  {myPlayer.isHost ? (
                    <button
                      onClick={() => roomStore.endMatch(roomId)}
                      className="w-full sm:w-auto bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-base px-8 py-3.5 rounded-2xl transition-all"
                    >
                      BACK TO LOBBY
                    </button>
                  ) : (
                    <p className="text-xs text-gray-300 font-bold">
                      Waiting for the host to take everyone back to the lobby…
                    </p>
                  )}

                  <button
                    onClick={() => router.push('/')}
                    className={`w-full sm:w-auto font-black text-base px-8 py-3.5 rounded-2xl transition-all ${
                      myPlayer.isHost
                        ? 'glass-pill hover:bg-white/15 text-gray-200 border border-white/20'
                        : 'bg-partyYellow hover:bg-yellow-400 text-partyDark'
                    }`}
                  >
                    BACK TO HOME
                  </button>
                </div>
              </div>
            );
          })()}
        </main>

        {room.phase !== 'lobby' && (
          <RightSidebar
            activePlayer={activePlayer}
            myPlayer={myPlayer}
            events={room.events ?? []}
            onUsePowerup={handleUsePowerup}
          />
        )}
      </div>

      {/* Mobile-Only Bottom Action Bar (Keeps mobile game view 100% clean & decluttered!) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-white/15 p-2 px-4 flex items-center justify-around backdrop-blur-xl shadow-2xl">
        <button
          onClick={() => setShowMobilePlayers(true)}
          className="flex flex-col items-center gap-0.5 text-gray-300 hover:text-partyYellow active:scale-95 transition-all"
        >
          <Users className="w-5 h-5 text-partyYellow" />
          <span className="text-[10px] font-black uppercase">ROSTER ({room.players.length})</span>
        </button>

        <button
          onClick={() => setShowMobileFeed(true)}
          className="flex flex-col items-center gap-0.5 text-gray-300 hover:text-partyCyan active:scale-95 transition-all"
        >
          <ScrollText className="w-5 h-5 text-partyCyan" />
          <span className="text-[10px] font-black uppercase">FEED ({room.events?.length ?? 0})</span>
        </button>

        {/* Replaces the old TRAPS shortcut. Traps are armed from the header and
            almost nobody used the button, while the inventory â€” which decides
            whether you can act on your turn â€” had no route at all on a phone:
            RightSidebar is `hidden lg:block`, so below 1024px it never renders. */}
        <button
          onClick={() => setShowMobileInventory(true)}
          className="flex flex-col items-center gap-0.5 text-gray-300 hover:text-partyPink active:scale-95 transition-all relative"
        >
          <Package className="w-5 h-5 text-partyPink" />
          <span className="text-[10px] font-black uppercase">ITEMS ({myPlayer.inventory.length})</span>
          {myPlayer.inventory.length > 0 && (
            <span className="absolute -top-1 right-1 w-2 h-2 rounded-full bg-partyPink animate-pulse" />
          )}
        </button>
      </div>

      {/* Mobile inventory. Same powerups and the same rules as the desktop
          sidebar, including the target picker for the offensive items. */}
      {showMobileInventory && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn lg:hidden">
          <div className="glass-card rounded-t-3xl sm:rounded-3xl p-5 border border-partyPink/50 w-full sm:max-w-md space-y-4 bg-slate-900/95 shadow-2xl max-h-[80vh] overflow-y-auto pb-8">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-partyPink" /> YOUR ITEMS
              </h3>
              <button
                onClick={() => setShowMobileInventory(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] text-gray-400">
              {isMyTurn ? 'Your turn â€” items can be used now.' : 'You can only use items on your own turn.'}
            </p>

            {(() => {
              const owned = SHOP_ITEMS.map((item) => ({
                item,
                count: myPlayer.inventory.filter((i) => i === item.id).length,
              })).filter((entry) => entry.count > 0);

              if (owned.length === 0) {
                return (
                  <div className="p-5 rounded-2xl bg-white/5 border border-white/10 text-center space-y-1">
                    <p className="text-xs font-bold text-gray-300">Nothing yet</p>
                    <p className="text-[10px] text-gray-400">Buy powerups in the shop between rounds.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {owned.map(({ item, count }) => (
                    <button
                      key={item.id}
                      disabled={!isMyTurn}
                      onClick={() => {
                        setShowMobileInventory(false);
                        handleUsePowerup(item.id);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl border border-white/15 bg-white/5 enabled:hover:border-partyPink enabled:active:scale-[0.98] disabled:opacity-40 transition text-left"
                    >
                      <span className="text-2xl shrink-0">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-black text-sm text-white truncate">
                          {item.name} {count > 1 && <span className="text-partyPink">x{count}</span>}
                        </span>
                        <span className="block text-[10px] text-gray-400 leading-snug">{item.description}</span>
                      </span>
                      {item.target === 'opponent' && (
                        <span className="text-[9px] font-black text-partyYellow border border-partyYellow/40 rounded-full px-1.5 py-0.5 shrink-0">
                          PICK
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Mobile Player Roster Pop-up Modal */}
      {showMobilePlayers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn lg:hidden">
          <div className="glass-card rounded-3xl p-5 border border-partyYellow/50 max-w-md w-full space-y-4 bg-slate-900/95 relative shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-partyYellow" /> PLAYERS ({room.players.length}/{MAX_PLAYERS})
              </h3>
              <button
                onClick={() => setShowMobilePlayers(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {room.players.map((player) => {
                const isTurn = player.id === activePlayer.id;
                const isLeader = player.id === leaderPlayer.id && player.score > 0;
                const isMe = player.id === myPlayer.id;

                return (
                  <div
                    key={player.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                      isTurn
                        ? 'bg-partyPurple/40 border-partyCyan shadow-lg'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <AvatarIllustration avatar={player.avatar} size="sm" isSpeaking={isTurn} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-extrabold text-xs text-white">{player.name}</h4>
                          {isMe && <span className="bg-partyCyan text-partyDark text-[8px] px-1 rounded font-black">YOU</span>}
                          {isLeader && <span>ðŸ‘‘</span>}
                        </div>
                        <p className="text-[10px] text-partyYellow font-mono">Node #{player.boardPosition + 1}</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-partyYellow font-mono">{player.score} pts</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowMobilePlayers(false)}
              className="w-full bg-partyYellow text-partyDark font-black text-sm py-3 rounded-xl"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Mobile Event Feed Pop-up Modal */}
      {showMobileFeed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn lg:hidden">
          <div className="glass-card rounded-3xl p-5 border border-partyCyan/50 max-w-md w-full space-y-4 bg-slate-900/95 relative shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-partyCyan" /> LIVE GAME FEED
              </h3>
              <button
                onClick={() => setShowMobileFeed(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {(room.events ?? []).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No game events yet.</p>
              ) : (
                (room.events ?? []).map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-200 font-bold flex items-start gap-2"
                  >
                    <span>{ev.type === 'buff' ? 'ðŸš€' : ev.type === 'debuff' ? 'ðŸ’¥' : ev.type === 'social' ? 'ðŸ¤£' : 'ðŸŽ®'}</span>
                    <span>{ev.text}</span>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowMobileFeed(false)}
              className="w-full bg-partyCyan text-partyDark font-black text-sm py-3 rounded-xl"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {showTrapPicker && (
        <TrapWordPicker
          roomId={roomId}
          activePlayer={activePlayer}
          myPlayer={myPlayer}
          onClose={() => setShowTrapPicker(false)}
        />
      )}

      {/* Driven by room.currentDare so the whole room sees the same dare, and a
          refresh mid-dare does not lose it. */}
      {room.currentDare && (() => {
        const target = room.players.find((p) => p.id === room.currentDare!.targetPlayerId);
        const challenger = room.players.find((p) => p.id === room.currentDare!.challengerPlayerId);
        if (!target || !challenger) return null;
        return (
          <PeerReviewDareModal
            dareText={room.currentDare!.dareText}
            targetPlayer={target}
            challengerPlayer={challenger}
            canJudge={myPlayer.id !== target.id}
            onResolveDare={handleResolveDare}
          />
        );
      })()}

      {briefingGame && (
        <MiniGameBriefing
          game={briefingGame}
          isReview={reviewingBriefing}
          onDismiss={(opts) => {
            setReviewingBriefing(false);
            dismissBriefing(opts);
          }}
        />
      )}

      {/* Lets anyone pull the rules back up without waiting for the game to
          come round again. Hidden once the briefing itself is open. */}
      {inMiniGame && !briefingGame && room.currentMiniGame && (
        <button
          onClick={() => {
            setReviewingBriefing(true);
            openBriefing(room.currentMiniGame!);
          }}
          aria-label="How does this game work?"
          title="How does this game work?"
          className="fixed bottom-24 right-4 lg:bottom-6 z-40 w-11 h-11 rounded-full bg-slate-900/90 border border-partyYellow/50 text-partyYellow font-black text-lg shadow-xl backdrop-blur-md hover:bg-slate-800 active:scale-95 transition"
        >
          ?
        </button>
      )}

      {pendingPowerup && (
        <PowerupTargetPicker
          item={pendingPowerup}
          candidates={room.players.filter((p) => p.id !== myPlayer.id && p.connected !== false)}
          onPick={handlePickTarget}
          onCancel={() => setPendingPowerup(null)}
        />
      )}
    </div>
  );
}

/**
 * The board, collapsed by default outside the board phase.
 *
 * It is ~600px tall â€” on a phone that pushed the actual mini-game controls off
 * screen during a round nobody spends looking at the map. Still one tap away
 * for anyone who wants to check positions.
 */
function BoardPeek({
  theme,
  players,
  activePlayerId,
}: {
  theme: MapTheme;
  players: Player[];
  activePlayerId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full glass-pill hover:bg-white/15 text-gray-200 font-bold text-xs py-2.5 rounded-2xl border border-white/15 flex items-center justify-center gap-2 transition-all"
      >
        <Map className="w-4 h-4 text-partyCyan" />
        <span>{open ? 'HIDE BOARD' : 'PEEK AT THE BOARD'}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="animate-fadeIn">
          <MapRenderer theme={theme} players={players} activePlayerId={activePlayerId} variant="peek" />
        </div>
      )}
    </div>
  );
}

function WaitingPanel({ activePlayer, label }: { activePlayer: Player; label: string }) {
  return (
    <div className="glass-card rounded-3xl p-8 border border-white/15 text-center space-y-4">
      <div className="flex justify-center">
        <AvatarIllustration avatar={activePlayer.avatar} size="xl" isSpeaking />
      </div>
      <h3 className="text-xl font-black text-white">
        {activePlayer.name} {label}
      </h3>
      <p className="text-xs text-gray-400">Hang tight â€” your turn is coming up.</p>
    </div>
  );
}

