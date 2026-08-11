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
import PowerupShop from '@/components/PowerupShop';
import RoadmapBoard from '@/components/RoadmapBoard';
import TrapWordPicker from '@/components/TrapWordPicker';
import PeerReviewDareModal from '@/components/PeerReviewDareModal';
import AvatarIllustration from '@/components/AvatarIllustration';
import VoiceCallBar from '@/components/VoiceCallBar';
import AiGameMasterBanner from '@/components/AiGameMasterBanner';
import GeminiAiMasterStage from '@/components/GeminiAiMasterStage';
import SocialVoicePanel from '@/components/SocialVoicePanel';
import SpectatorView from '@/components/SpectatorView';
import RoastIntermission from '@/components/RoastIntermission';
import { aiGameMaster, AiHostPrompt } from '@/lib/aiGameMaster';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { roomStore, RoomSnapshot } from '@/lib/roomStore';
import { MapTheme, MiniGameId, Player } from '@/lib/types';
import { MAX_PLAYERS, getTeam } from '@/lib/gameRules';
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
  const [showGeminiMode, setShowGeminiMode] = useState(false);
  const [comingSoonTitle, setComingSoonTitle] = useState<string | null>(null);
  const [activeDareTarget, setActiveDareTarget] = useState<Player | null>(null);
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

  // ── Voice replay ──────────────────────────────────────────────────────────
  // Everyone records the performer independently, from whichever source they
  // already have: the performer captures their own mic, listeners capture the
  // peer audio they are hearing anyway. No clip is ever transmitted — each tab
  // ends up with its own local copy of the same moment.
  //
  // Declared above the early returns: these are hooks.
  const myPlayerId = roomStore.getMyPlayerId();
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
    // The peer stream can arrive a beat after the turn starts, so poll briefly
    // rather than sampling once and giving up.
    const resolve = () =>
      setCaptureStream(isPerformer ? micStream.getStream() : voiceChat.getRemoteStream(performer.id));
    resolve();
    const timer = setInterval(resolve, 600);
    return () => clearInterval(timer);
  }, [isAttemptPhase, isPerformer, performer?.id]);

  const { clip: replayClip, isRecording: isCapturing } = useVoiceRecorder({
    stream: captureStream,
    active: isAttemptPhase && !!captureStream,
  });

  // ── Presence ──────────────────────────────────────────────────────────────
  // A closed tab is indistinguishable from a slow player unless we say so.
  // Beat every 8s against a 25s server timeout, and fire a beacon on unload so
  // a deliberate close is noticed immediately rather than 25 seconds later.
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
          <div className="animate-spin text-5xl">🎙️</div>
          <p className="text-sm font-mono text-partyYellow">CONNECTING TO ROOM {roomId}…</p>
        </div>
      </div>
    );
  }

  // The room genuinely does not exist on the server — say so instead of quietly
  // manufacturing a new one with this player as host.
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
                  placeholder="e.g. Sisi Vibe, Sharp Guy…"
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
                <span>{isJoining ? 'JOINING…' : `JOIN AS PLAYER ${room.players.length + 1}`}</span>
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
  const currentTheme: MapTheme = room.theme || 'forest';
  const isMyTurn = activePlayer?.id === myPlayer.id;

  const handleStartMatch = () => {
    audioSFX.playNollywoodBrass();
    roomStore.startMatch(roomId);
  };

  const handleSelectMode = (mode: 'board' | 'karaoke' | 'hangout' | 'ai_master') => {
    if (mode === 'board') {
      handleStartMatch();
    } else if (mode === 'ai_master') {
      setShowGeminiMode(true);
    } else if (mode === 'karaoke') {
      setComingSoonTitle('🎤 Karaoke & Pitch Arcade Mode');
    } else if (mode === 'hangout') {
      setComingSoonTitle('🍻 15s Roast & Open-Mic Lounge Mode');
    }
  };

  const handleMiniGameComplete = (game: MiniGameId) => (pointsEarned: number) => {
    roomStore.completeMiniGame(roomId, game, pointsEarned);
  };

  // Deliberately not memoised — this sits after the component's early returns,
  // so a hook here would break the Rules of Hooks. RoastIntermission holds it
  // in a ref instead, so its countdown does not care about this identity.
  const handleFinishRoast = () => {
    roomStore.finishRoast(roomId);
  };

  const handleFinishShopping = () => {
    roomStore.finishShopping(roomId, myPlayer.id);
  };

  const handleFinishRoadmapTurn = () => {
    roomStore.advanceTurn(roomId);
  };

  const handleUsePowerup = (powerupId: string) => {
    audioSFX.playPowerUpZap();
    roomStore.usePowerup(roomId, powerupId);
  };

  const handleResolveDare = (passed: boolean) => {
    if (activeDareTarget) {
      roomStore.resolveDare(roomId, activeDareTarget.id, passed);
    }
    setActiveDareTarget(null);
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
      />

      {/* Connection trouble is surfaced rather than swallowed */}
      {status === 'error' && error && (
        <div className="bg-amber-500/20 border-b border-amber-500/50 text-amber-200 text-xs font-bold px-4 py-2 text-center flex items-center justify-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Wider than max-w-7xl: the two sidebars take ~576px, so a 1280 cap left
          the play area at 608px on a 1440 screen with dead margins either side. */}
      <div className="max-w-[1700px] mx-auto w-full p-4 sm:p-6 flex flex-col lg:flex-row gap-5 xl:gap-6 flex-1">
        <LeftSidebar
          roomId={roomId}
          players={room.players}
          activePlayerId={activePlayer.id}
          leaderId={leaderPlayer.id}
          myPlayerId={myPlayer.id}
          teamMode={room.teamMode}
          canManage={myPlayer.isHost}
          onKickPlayer={(p) => roomStore.kickPlayer(roomId, p.id, myPlayer.id)}
        />

        <main className="flex-1 space-y-6">
          <VoiceCallBar
            roomId={roomId}
            players={room.players}
            myPlayer={myPlayer}
            // Quiet the others while this player is being scored, so the speech
            // recogniser hears them and not the call coming out of the speaker.
            duckRemote={isAttemptPhase && isMyTurn}
            // Everyone but the performer is closed while an attempt is scored;
            // the reaction buttons are the room's channel for those seconds.
            autoMute={isAttemptPhase && !isMyTurn}
            // Nobody joins or leaves the call mid-attempt; shrink it out of the way.
            compact={isAttemptPhase}
            // Connect as soon as there is somebody to talk to — including in
            // the lobby, which is exactly when people are waiting around and
            // want to chat. Gating this on the match having started left the
            // room silent during the part where they are just hanging out.
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
                <div className="text-4xl">🚀</div>
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

          {/* Step 1 — qualifying mini-game (voice arena) */}
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
                  label="is in the Voice Arena"
                />
              )}
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />
            </div>
          )}

          {/* Step 1 — qualifying mini-game (PitchBird) */}
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
                  label="is flying in PitchBird 🐦"
                />
              )}
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />
            </div>
          )}

          {/* Step 1.5 — 15-second open-mic roast intermission */}
          {room.phase === 'roast_intermission' && (
            <div className="space-y-6">
              <RoastIntermission
                room={room}
                activePlayer={activePlayer}
                myPlayer={myPlayer}
                replayClip={replayClip}
                onFinishRoast={handleFinishRoast}
              />
              <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />
            </div>
          )}

          {/* Step 1 — qualifying mini-game (Karaoke / solfège) */}
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
                  label="is on the karaoke mic 🎵"
                />
              )}
              <SocialVoicePanel room={room} activePlayer={activePlayer} myPlayer={myPlayer} />
              <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />
            </div>
          )}

          {/* Step 2 — spend the points the mini-game just earned */}
          {room.phase === 'powerup_shop' && (
            <div className="space-y-6">
              {/* Everyone shops at the same time — no waiting your turn. */}
              <PowerupShop
                roomId={roomId}
                myPlayer={myPlayer}
                myResult={(room.roundResults ?? []).find((r) => r.playerId === myPlayer.id) ?? null}
                ready={(room.shopReady ?? []).includes(myPlayer.id)}
                waitingOn={room.players
                  .filter((p) => !(room.shopReady ?? []).includes(p.id) && p.id !== myPlayer.id)
                  .map((p) => p.name)}
                onDone={handleFinishShopping}
              />
              <BoardPeek theme={currentTheme} players={room.players} activePlayerId={activePlayer.id} />
            </div>
          )}

          {/* Step 3 — move on the main board */}
          {room.phase === 'roadmap_turn' && (
            <RoadmapBoard
              room={room}
              activePlayer={activePlayer}
              canRoll={isMyTurn}
              onTriggerDare={setActiveDareTarget}
              onNextTurn={handleFinishRoadmapTurn}
            />
          )}

          {room.phase === 'game_over' && room.winner && (() => {
            // In team mode the crew takes the win, with the player who crossed
            // the line credited underneath.
            const team = room.teamMode && room.winningTeam ? getTeam(room.winningTeam) : null;
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

                <button
                  onClick={() => router.push('/')}
                  className="bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-base px-8 py-3.5 rounded-2xl transition-all"
                >
                  BACK TO HOME
                </button>
              </div>
            );
          })()}
        </main>

        <RightSidebar
          activePlayer={activePlayer}
          myPlayer={myPlayer}
          events={room.events ?? []}
          onUsePowerup={handleUsePowerup}
        />
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

        <button
          onClick={() => setShowTrapPicker(true)}
          className="flex flex-col items-center gap-0.5 text-gray-300 hover:text-partyPink active:scale-95 transition-all"
        >
          <Zap className="w-5 h-5 text-partyPink" />
          <span className="text-[10px] font-black uppercase">TRAPS</span>
        </button>
      </div>

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
                          {isLeader && <span>👑</span>}
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
                    <span>{ev.type === 'buff' ? '🚀' : ev.type === 'debuff' ? '💥' : ev.type === 'social' ? '🤣' : '🎮'}</span>
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

      {activeDareTarget && (
        <PeerReviewDareModal
          targetPlayer={activeDareTarget}
          challengerPlayer={activePlayer}
          onResolveDare={handleResolveDare}
        />
      )}
    </div>
  );
}

/**
 * The board, collapsed by default outside the board phase.
 *
 * It is ~600px tall — on a phone that pushed the actual mini-game controls off
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
          <MapRenderer theme={theme} players={players} activePlayerId={activePlayerId} />
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
      <p className="text-xs text-gray-400">Hang tight — your turn is coming up.</p>
    </div>
  );
}
