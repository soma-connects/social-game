'use client';

import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Globe,
  LockKeyhole,
  MessageCircle,
  Play,
  CheckCircle2,
  Sparkles,
  Shirt,
  Users,
  X,
  Swords,
  Shuffle,
  Bot,
  Settings,
  Dices,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AVATARS } from '@/lib/gameContent';
import { roomStore } from '@/lib/roomStore';
import { AvatarStyle, LanguageCode, MiniGameId, Player, RoomState, TruthOrDareCategoryId, TruthOrDareSelectionMode } from '@/lib/types';
import { BOARD_MINI_GAMES, MAX_PLAYERS, MINI_GAMES, TEAMS } from '@/lib/gameRules';
import { DEFAULT_ROOM_VIBE, ROOM_VIBES, RoomVibeId } from '@/lib/roomVibes';
import { DEFAULT_TRUTH_OR_DARE_SETTINGS, TRUTH_OR_DARE_CATEGORIES, TRUTH_OR_DARE_SELECTION_LABELS } from '@/lib/truthOrDareContent';
import { badgeArt, modeArt, vibeArt } from '@/lib/gameIcons';
import GameIcon from './GameIcon';
import MicCheck from './MicCheck';

import { audioSFX } from '@/lib/audioFeedback';
import AvatarIllustration from './AvatarIllustration';
import BackgroundMusic from './BackgroundMusic';

type LobbyMode =
  | 'board'
  | 'karaoke'
  | 'hangout'
  | 'ai_master'
  | 'truth_or_dare'
  | 'team_battle'
  | 'chess'
  | 'ludo';

interface ModeCard {
  id: LobbyMode;
  title: string;
  /** Shown on the Start button, so the host can see which game it will launch. */
  short: string;
  blurb: string;
  /** What the game needs, so nobody finds out by pressing Start and being refused. */
  players: string;
  /** Mirrors what the server enforces (route.ts), or 1 where it enforces nothing. */
  minPlayers: number;
  /** Not playable yet — Start opens the "coming soon" notice instead. */
  soon?: boolean;
  art: string;
  emoji: string;
  /** Classes for the card while selected. */
  card: string;
  iconBox: string;
  chip: string;
}

const MODES: ModeCard[] = [
  {
    id: 'board',
    title: 'BOARD GAME ROADMAP',
    short: 'Board Game',
    blurb: 'Roll 3D dice, race the roadmap, set traps and shop for powerups.',
    players: '1–6 players',
    minPlayers: 1,
    art: 'board',
    emoji: '🎲',
    card: 'bg-cyan-950/40 border-partyCyan text-white shadow-xl glow-cyan',
    iconBox: 'bg-partyCyan/15 border border-partyCyan/30',
    chip: 'bg-partyCyan text-partyDark',
  },
  {
    id: 'karaoke',
    title: 'KARAOKE & PITCH ARCADE',
    short: 'Karaoke',
    blurb: 'PitchBird, solfège note matching and Voice Arena fast-mic.',
    players: 'Coming soon',
    minPlayers: 1,
    soon: true,
    art: 'voice',
    emoji: '🎤',
    card: 'bg-gradient-to-r from-pink-950/80 via-slate-900/90 to-pink-900/50 border-partyPink text-white shadow-xl',
    iconBox: 'bg-partyPink/15 border border-partyPink/30',
    chip: 'bg-partyPink text-white',
  },
  {
    id: 'hangout',
    title: '15s ROAST HANGOUT',
    short: 'Roast Hangout',
    blurb: 'Open-mic voice lounge with a party soundboard and a roast countdown.',
    players: 'Coming soon',
    minPlayers: 1,
    soon: true,
    art: 'party',
    emoji: '🍻',
    card: 'bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-emerald-900/50 border-emerald-400 text-white shadow-xl glow-emerald',
    iconBox: 'bg-emerald-500/15 border border-emerald-400/30',
    chip: 'bg-emerald-500 text-partyDark',
  },
  {
    id: 'ai_master',
    title: 'AI GAME MASTER',
    short: 'AI Game Master',
    blurb: 'An AI host runs live challenges, Truth or Bluff, debates and voice trivia.',
    players: '2–6 players',
    minPlayers: 2,
    art: 'ai_master',
    emoji: '🤖',
    card: 'bg-gradient-to-r from-amber-950/80 via-slate-900/90 to-amber-900/50 border-partyYellow text-white shadow-xl glow-yellow',
    iconBox: 'bg-partyYellow/15 border border-partyYellow/30',
    chip: 'bg-partyYellow text-partyDark',
  },
  {
    id: 'truth_or_dare',
    title: 'TRUTH OR DARE',
    short: 'Truth or Dare',
    blurb: 'Spin the wheel or flip a card. Curated categories and a spicy toggle.',
    players: '2–6 players',
    minPlayers: 2,
    art: 'truth_or_dare',
    emoji: '🎯',
    card: 'bg-gradient-to-r from-fuchsia-950/80 via-slate-900/90 to-pink-900/50 border-partyPink text-white shadow-xl',
    iconBox: 'bg-partyPink/15 border border-partyPink/30',
    chip: 'bg-partyPink text-white',
  },
  {
    id: 'team_battle',
    title: 'TEAM BATTLE',
    short: 'Team Battle',
    blurb: 'Two crews, sudden-death voice duels. Pick your side!',
    players: '2–6 players · two crews',
    minPlayers: 2,
    art: 'team_battle',
    emoji: '⚔️',
    card: 'bg-gradient-to-r from-red-950/80 via-slate-900/90 to-red-900/50 border-red-500 text-white shadow-xl glow-red',
    iconBox: 'bg-red-500/15 border border-red-500/30',
    chip: 'bg-red-500 text-white',
  },
  {
    id: 'chess',
    title: 'CHESS ARENA',
    short: 'Chess',
    blurb: '1v1 duels, 2v2 team consultation with secret strategy voice, or solo against the AI bot.',
    players: '1–4 players',
    minPlayers: 1,
    art: 'chess',
    emoji: '♟️',
    card: 'bg-gradient-to-r from-sky-950/80 via-slate-900/90 to-indigo-900/50 border-cyan-400 text-white shadow-xl glow-cyan',
    iconBox: 'bg-cyan-500/15 border border-cyan-400/30',
    chip: 'bg-cyan-400 text-slate-950',
  },
  {
    id: 'ludo',
    title: 'LUDO VOICE PARTY',
    short: 'Ludo',
    blurb: 'Classic Ludo with animated dice and party music. Bots fill the empty seats.',
    players: '1–4 players',
    minPlayers: 1,
    art: 'ludo',
    emoji: '🎲',
    card: 'bg-gradient-to-r from-amber-950/80 via-slate-900/90 to-yellow-900/50 border-amber-400 text-white shadow-xl glow-yellow',
    iconBox: 'bg-amber-500/15 border border-amber-400/30',
    chip: 'bg-amber-400 text-slate-950',
  },
];

interface RoomLobbyProps {
  room: RoomState;
  myPlayer: Player;
  onStartGame: () => void;
  onSelectMode?: (mode: LobbyMode) => void;
}

const LANGUAGES: { id: LanguageCode; name: string; flag: string }[] = [
  { id: 'english', name: 'English', flag: '🇬🇧' },
  { id: 'spanish', name: 'Spanish', flag: '🇪🇸' },
  { id: 'french', name: 'French', flag: '🇫🇷' },
  { id: 'japanese', name: 'Japanese', flag: '🇯🇵' },
  { id: 'korean', name: 'Korean', flag: '🇰🇷' },
];

export default function RoomLobby({ room, myPlayer, onStartGame, onSelectMode }: RoomLobbyProps) {
  const [selectedLangs, setSelectedLangs] = useState<LanguageCode[]>(room.selectedLanguages);
  const [mathEnabled, setMathEnabled] = useState(room.mathEnabled);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [activeMode, setActiveMode] = useState<LobbyMode>('board');
  const [showCustomDecks, setShowCustomDecks] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [selectedGames, setSelectedGames] = useState<MiniGameId[]>(
    room.enabledMiniGames ?? ['voice_arena', 'pitch_bird']
  );
  const roomVibe: RoomVibeId = room.roomVibe ?? DEFAULT_ROOM_VIBE;
  const truthOrDareSettings = room.truthOrDareSettings ?? DEFAULT_TRUTH_OR_DARE_SETTINGS;
  const currentAvatarIndex = Math.max(
    0,
    AVATARS.findIndex((avatar) => avatar.id === myPlayer.avatar.id)
  );
  /**
   * Build-stage switch. Avatars carry `unlockLevel`/`unlockCost` and the grid
   * shows the level badge, but nothing is actually gated yet — flip this to
   * false to enforce it and wire the check into the tile's onClick.
   */
  const BUILD_MODE_UNLOCKS = true;

  const canSelectAvatar = (avatar: AvatarStyle) =>
    BUILD_MODE_UNLOCKS || (myPlayer.level ?? 1) >= (avatar.unlockLevel ?? 1);

  const selectAvatar = async (avatarId: string) => {
    if (!canSelectAvatar(AVATARS.find((a) => a.id === avatarId) ?? AVATARS[0])) return;
    await roomStore.setAvatar(room.roomId, myPlayer.id, avatarId);
    audioSFX.playStreetVendorBell();
  };

  const rotateAvatar = (direction: -1 | 1) => {
    const nextIndex = (currentAvatarIndex + direction + AVATARS.length) % AVATARS.length;
    selectAvatar(AVATARS[nextIndex].id);
  };

  const selectVibe = (id: RoomVibeId) => {
    if (!myPlayer.isHost || id === roomVibe) return;
    roomStore.setRoomVibe(room.roomId, id);
    audioSFX.playChoiSuccess();
  };

  const toggleTruthOrDareCategory = (id: TruthOrDareCategoryId) => {
    if (!myPlayer.isHost) return;
    const next = truthOrDareSettings.categories.includes(id)
      ? truthOrDareSettings.categories.filter((c) => c !== id)
      : [...truthOrDareSettings.categories, id];
    if (next.length === 0) return; // at least one category must stay on
    audioSFX.playChoiSuccess();
    roomStore.updateTruthOrDareSettings(room.roomId, { ...truthOrDareSettings, categories: next });
  };

  const toggleTruthOrDareSpicy = () => {
    if (!myPlayer.isHost) return;
    audioSFX.playChoiSuccess();
    roomStore.updateTruthOrDareSettings(room.roomId, {
      ...truthOrDareSettings,
      spicyEnabled: !truthOrDareSettings.spicyEnabled,
    });
  };

  const toggleTruthOrDareSelectionMode = (mode: TruthOrDareSelectionMode) => {
    if (!myPlayer.isHost) return;
    const next = truthOrDareSettings.selectionModes.includes(mode)
      ? truthOrDareSettings.selectionModes.filter((m) => m !== mode)
      : [...truthOrDareSettings.selectionModes, mode];
    if (next.length === 0) return; // at least one mechanic must stay on
    audioSFX.playChoiSuccess();
    roomStore.updateTruthOrDareSettings(room.roomId, { ...truthOrDareSettings, selectionModes: next });
  };

  const toggleMiniGame = (id: MiniGameId) => {
    // At least one *board* game has to stay on, otherwise a turn has nothing to
    // play. Games the board cannot run are not listed here, but they stay in the
    // saved selection untouched — Team Battle reads the same list.
    const updated = selectedGames.includes(id)
      ? selectedGames.filter((g) => g !== id)
      : [...selectedGames, id];
    if (!updated.some((g) => BOARD_MINI_GAMES.includes(g))) return;
    setSelectedGames(updated);
    roomStore.updateMiniGames(room.roomId, updated);
  };

  const shareToWhatsApp = () => {
    if (typeof window === 'undefined') return;
    audioSFX.playStreetVendorBell();
    const url = `${window.location.origin}/game/${room.roomId}`;
    const text = `🔥 Oya join my game, make I clear you! Room Code: ${room.roomId}\nClick link to play sharp sharp: ${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const toggleLang = (langId: LanguageCode) => {
    let updated: LanguageCode[];
    if (selectedLangs.includes(langId)) {
      if (selectedLangs.length === 1) return;
      updated = selectedLangs.filter((l) => l !== langId);
    } else {
      updated = [...selectedLangs, langId];
    }
    setSelectedLangs(updated);
    roomStore.updateLanguages(room.roomId, updated, mathEnabled);
  };

  const toggleMath = () => {
    const updated = !mathEnabled;
    setMathEnabled(updated);
    roomStore.updateLanguages(room.roomId, selectedLangs, updated);
  };

  const isHost = myPlayer.isHost;
  const hostName = room.players.find((p) => p.isHost)?.name ?? 'the host';
  const selectedMode = MODES.find((m) => m.id === activeMode) ?? MODES[0];
  // Refuse before the press rather than after it: the server says no to a game
  // without enough players, and that arrives as an error banner somewhere else.
  const needsMorePlayers = !selectedMode.soon && room.players.length < selectedMode.minPlayers;
  // Team Battle takes two presses on purpose: the first switches the room into
  // team mode so the crew roster appears above and people can arrange sides,
  // the second actually starts the series.
  const teamSetupStep = activeMode === 'team_battle' && room.roomType !== 'team_battle';
  const startLabel = selectedMode.soon
    ? "SEE WHAT'S COMING"
    : teamSetupStep
      ? 'SET UP THE CREWS'
      : `START ${selectedMode.short.toUpperCase()}`;

  /** Each player gets the control on their own card only. */
  const changeAvatarButton = (player: Player) =>
    player.id === myPlayer.id ? (
      <button
        type="button"
        onClick={() => setShowAvatarModal(true)}
        className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-partyCyan hover:text-white bg-partyCyan/15 hover:bg-partyCyan/30 border border-partyCyan/40 px-3 py-1.5 rounded-xl transition-all active:scale-95"
      >
        <Shirt className="w-3.5 h-3.5 text-partyYellow" /> CHANGE AVATAR
      </button>
    ) : null;

  /**
   * The one control that matters in a lobby. Rendered twice — pinned to the
   * bottom of the screen on a phone (the page used to be three screens tall with
   * this at the very end) and inline in the picker on a desktop.
   */
  const startControl = isHost ? (
    <div className="space-y-1.5">
      {needsMorePlayers && (
        <p className="text-[11px] text-amber-300 font-bold text-center leading-snug">
          {selectedMode.short} needs {selectedMode.minPlayers}+ players — invite someone with the room code.
        </p>
      )}
      <button
        onClick={() => (onSelectMode ? onSelectMode(activeMode) : onStartGame())}
        disabled={needsMorePlayers}
        className="w-full bg-gradient-to-r from-partyYellow via-terracotta to-partyPink text-partyDark font-black text-sm sm:text-base py-3 sm:py-3.5 px-6 sm:px-8 rounded-2xl flex items-center justify-center gap-2 sm:gap-3 transition-all transform hover:scale-[1.02] active:scale-95 shadow-2xl glow-yellow disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
      >
        <Play className="w-5 h-5 fill-current" />
        <span>{startLabel}</span>
      </button>
    </div>
  ) : (
    <p className="text-center text-sm font-extrabold text-gray-200 py-3">
      Waiting for {hostName} to start the game…
    </p>
  );

  return (
    // pb-28 on small screens (plus the page's own pb-24) keeps the lobby clear of the pinned Start bar
    // and the fixed mobile action bar beneath it, which otherwise cover whatever
    // ends up last on the page.
    <div className="max-w-5xl mx-auto px-2 sm:px-4 pt-4 pb-28 lg:pb-4 space-y-6 animate-fadeIn relative">
      {/* Ambient Glow Blobs */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-purple-600/15 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-emerald-500/15 blur-3xl rounded-full pointer-events-none" />

      {/* Ambient Dashboard Background Music */}
      <BackgroundMusic screen="lobby" />

      {/* One invite card: the code, the share button and — for the host — who may join.
          Two separate banners used to push the lobby's real content a full screen down.
          The listing control is host-only, and lobby-only on the server: publishing a
          match in progress would drop strangers into somebody's game and flip the
          safety rules underneath the people already in it. */}
      <div className="glass-card rounded-2xl border border-emerald-400/20 shadow-xl relative z-10 overflow-hidden">
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 shrink-0">
              <MessageCircle className="w-5 h-5 fill-current" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base text-white">INVITE YOUR CREW</h3>
              <p className="text-gray-300 text-xs">
                Room code{' '}
                <span className="text-partyYellow font-mono font-bold text-sm tracking-wider">{room.roomId}</span>
              </p>
            </div>
          </div>

          <button
            onClick={shareToWhatsApp}
            className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-partyDark font-black text-xs px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all transform hover:scale-105 shadow-lg shrink-0"
          >
            <MessageCircle className="w-4 h-4 fill-current" />
            <span>SHARE TO WHATSAPP</span>
          </button>
        </div>

        {isHost && (
          <div className="border-t border-white/10 bg-white/[0.02] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-start gap-3">
              <Globe className={`w-4 h-4 mt-0.5 shrink-0 ${room.isPublic ? 'text-partyCyan' : 'text-gray-400'}`} />
              <div>
                <h4 className="font-extrabold text-xs text-white">{room.isPublic ? 'LISTED PUBLICLY' : 'INVITE ONLY'}</h4>
                <p className="text-gray-300 text-xs max-w-md">
                  {room.isPublic
                    ? 'Anyone can find this room and join. Mics start muted and dares are off.'
                    : 'Only people with the code can join. Make it public to fill empty seats with strangers.'}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                audioSFX.playTap();
                void roomStore.setVisibility(room.roomId, !room.isPublic);
              }}
              className={`w-full sm:w-auto font-black text-xs px-5 py-2.5 rounded-xl transition-all shrink-0 ${
                room.isPublic
                  ? 'bg-white/10 hover:bg-white/20 text-gray-200 border border-white/20'
                  : 'bg-partyCyan hover:bg-cyan-300 text-partyDark'
              }`}
            >
              {room.isPublic ? 'MAKE PRIVATE' : 'MAKE PUBLIC'}
            </button>
          </div>
        )}
      </div>

      {/* Two-up grid for the players & the game picker */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 relative z-10">
        {/* Who has joined */}
        <div className="glass-card rounded-3xl p-4 sm:p-6 space-y-5 border border-white/5 shadow-2xl">
          <div>
            <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-partyYellow" />
              WHO&apos;S HERE ({room.players.length}/{MAX_PLAYERS})
            </h3>
            <p className="text-xs text-gray-400">Everyone who has joined this room</p>
          </div>

          {/* Before the match, not during a scored round. Half this game is
              voice, and the first thing that used to tell a player their mic
              was blocked was a mini-game they had just scored zero in. */}
          <MicCheck />

          {/* Avatar Selection Pop-up Modal */}
          {showAvatarModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
              <div className="glass-card rounded-3xl p-6 border border-partyYellow/50 max-w-xl w-full space-y-4 bg-slate-900/95 relative shadow-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                      <Shirt className="w-5 h-5 text-partyYellow" /> CHOOSE YOUR CHARACTER
                    </h3>
                    <p className="text-xs text-gray-400">All avatars unlocked during build testing!</p>
                  </div>
                  <button
                    onClick={() => setShowAvatarModal(false)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto p-1">
                  {AVATARS.map((avatar) => {
                    const selected = avatar.id === myPlayer.avatar.id;
                    const futureLocked = (avatar.unlockLevel ?? 1) > (myPlayer.level ?? 1);
                    return (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => {
                          selectAvatar(avatar.id);
                          setShowAvatarModal(false);
                        }}
                        className={`rounded-2xl border p-3 text-center transition-all ${
                          selected
                            ? 'bg-partyYellow/25 border-partyYellow text-partyYellow ring-2 ring-partyYellow/50'
                            : 'bg-white/5 border-white/10 text-gray-300 hover:border-partyCyan hover:bg-white/10'
                        }`}
                      >
                        <div className="flex justify-center">
                          <AvatarIllustration avatar={avatar} size="md" />
                        </div>
                        <p className="text-xs font-black mt-2 truncate">{avatar.name}</p>
                        {futureLocked ? (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-black text-gray-300">
                            <LockKeyhole className="w-2.5 h-2.5" /> L{avatar.unlockLevel} FREE
                          </span>
                        ) : (
                          <span className="mt-1 inline-block rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black text-emerald-300">
                            SELECT
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setShowAvatarModal(false)}
                  className="w-full bg-partyYellow text-partyDark font-black text-sm py-3 rounded-xl hover:bg-yellow-400 transition-all"
                >
                  DONE
                </button>
              </div>
            </div>
          )}

          {room.roomType === 'team_battle' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {TEAMS.map((team) => {
                const members = room.players.filter((p) => p.teamId === team.id);
                return (
                  <div key={team.id} className="space-y-4 p-5 rounded-3xl border transition-all" style={{ backgroundColor: `${team.color}15`, borderColor: `${team.color}40` }}>
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-white text-lg flex items-center gap-2" style={{ color: team.color }}>
                        {team.icon} {team.name}
                      </h4>
                      <span className="text-xs px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: `${team.color}30`, color: team.color }}>
                        {members.length} / {MAX_PLAYERS / 2}
                      </span>
                    </div>
                    
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                      {members.map((player) => (
                        // `layout` + a stable key means a shuffle physically
                        // slides people between the two crews instead of the
                        // rosters blinking into a new arrangement.
                        <motion.div
                          layout
                          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                          key={player.id}
                          className="glass-pill rounded-2xl p-4 space-y-3 border transition-all text-center relative overflow-hidden flex flex-col items-center"
                          style={{ borderColor: `${team.color}50` }}
                        >
                          {myPlayer.isHost && (
                            <button
                              onClick={() => roomStore.switchTeam(room.roomId, player.id, team.id === 'red' ? 'blue' : 'red')}
                              className="absolute top-2 right-2 text-[10px] bg-black/40 hover:bg-black/60 px-2 py-1 rounded-full z-10 font-bold text-white transition-colors"
                            >
                              SWAP
                            </button>
                          )}
                          <AvatarIllustration avatar={player.avatar} variant="card" size="md" />
                          <div>
                            <h4 className="font-extrabold text-white text-sm flex items-center justify-center gap-1">
                              {player.name}
                              {player.id === myPlayer.id && (
                                <span className="bg-white text-partyDark text-[9px] px-1.5 py-0.5 rounded-full font-black">YOU</span>
                              )}
                            </h4>
                          </div>
                          <div className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border whitespace-nowrap" style={{ backgroundColor: `${team.color}30`, borderColor: `${team.color}50`, color: team.color }}>
                            <CheckCircle2 className="w-3 h-3 shrink-0" /> READY
                          </div>
                          {changeAvatarButton(player)}
                        </motion.div>
                      ))}
                      {members.length === 0 && (
                        <div className="col-span-full py-8 text-center text-sm font-bold opacity-50" style={{ color: team.color }}>
                          Waiting for players...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Nobody has to pick anybody. Deciding teams out loud is the part
                  of a party game where somebody gets chosen last — this lets the
                  room blame the dice instead. SWAP above stays for fine-tuning. */}
              {myPlayer.isHost && (
                <div className="md:col-span-2 flex flex-col items-center gap-2">
                  <button
                    onClick={async () => {
                      audioSFX.playDiceRoll();
                      setIsShuffling(true);
                      await roomStore.balanceTeams(room.roomId);
                      setIsShuffling(false);
                    }}
                    disabled={isShuffling || room.players.length < 2}
                    className="glass-pill hover:bg-white/15 disabled:opacity-40 text-partyCyan font-extrabold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 border border-partyCyan/30 transition-all active:scale-95"
                  >
                    <Shuffle className={`w-4 h-4 text-partyYellow ${isShuffling ? 'animate-spin' : ''}`} />
                    <span>{isShuffling ? 'DRAWING CREWS…' : 'SHUFFLE THE CREWS'}</span>
                  </button>
                  <p className="text-[10px] text-gray-400">
                    Random and even — press again for a different draw
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
              {room.players.map((player) => (
                <div
                  key={player.id}
                  className="glass-pill rounded-2xl p-4 space-y-3 border border-white/15 hover:border-partyYellow/50 transition-all text-center relative overflow-hidden flex flex-col items-center"
                >
                  <AvatarIllustration avatar={player.avatar} variant="card" size="md" />

                  <div>
                    <h4 className="font-extrabold text-white text-sm flex items-center justify-center gap-1">
                      {player.name}
                      {player.id === myPlayer.id && (
                        <span className="bg-partyCyan text-partyDark text-[9px] px-1.5 py-0.5 rounded-full font-black">
                          YOU
                        </span>
                      )}
                      {player.isHost && (
                        <span className="bg-partyYellow text-partyDark text-[9px] px-1.5 py-0.5 rounded-full font-black">
                          HOST
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-gray-300 font-medium flex items-center justify-center gap-1 mt-1">
                      <Shirt className="w-3 h-3 text-partyCyan" /> {player.avatar.outfit}
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                      <span className="bg-partyPurple/40 text-partyCyan text-[9px] px-2 py-0.5 rounded-full font-black border border-partyCyan/20">
                        LVL {player.level ?? 1}
                      </span>
                      <span className="bg-partyPink/20 text-partyPink text-[9px] px-2 py-0.5 rounded-full font-black border border-partyPink/25">
                        VIBE {player.vibeScore ?? 0}
                      </span>
                      {(player.badges ?? []).slice(-2).map((badge) => (
                        <span
                          key={badge}
                          className="bg-partyYellow/20 text-partyYellow text-[9px] px-2 py-0.5 rounded-full font-black border border-partyYellow/25"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-emerald-500/30 whitespace-nowrap">
                    <CheckCircle2 className="w-3 h-3 shrink-0" /> READY
                  </div>
                  {changeAvatarButton(player)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Game picker */}
        <div className="glass-card rounded-3xl p-4 sm:p-6 space-y-5 border border-white/5 shadow-2xl">
          <div className="space-y-2">
            <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-partyYellow" />
              {isHost ? 'PICK A GAME' : 'THE GAMES'}
            </h3>
            <p className="text-xs text-gray-300">
              {isHost
                ? 'Tap a game, then start it when everyone is in.'
                : `${hostName} picks and starts the game. Tap one to read about it.`}
            </p>

            <div className="grid grid-cols-1 gap-3 pt-2">
              {MODES.map((mode) => {
                const active = mode.id === activeMode;
                return (
                  <React.Fragment key={mode.id}>
                    <button
                      onClick={() => {
                        setActiveMode(mode.id);
                        audioSFX.playChoiSuccess();
                      }}
                      aria-pressed={active}
                      className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-start gap-2.5 sm:gap-3.5 ${
                        active ? mode.card : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                      }`}
                    >
                      <div className={`text-2xl sm:text-3xl p-2 sm:p-2.5 rounded-xl shrink-0 ${mode.iconBox}`}>
                        <GameIcon
                          src={modeArt(mode.art)}
                          emoji={mode.emoji}
                          className="w-8 h-8 sm:w-9 sm:h-9 text-2xl sm:text-3xl"
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 flex-wrap">
                          {mode.title}
                          {active && (
                            <span className={`${mode.chip} text-[9px] px-2 py-0.5 rounded-full font-black`}>
                              {isHost ? 'SELECTED' : 'VIEWING'}
                            </span>
                          )}
                        </h4>
                        {/* On a phone only the picked game explains itself; eight
                            paragraphs made the list taller than the rest of the lobby. */}
                        <p className={`text-xs text-gray-300 mt-1 leading-snug ${active ? '' : 'hidden sm:block'}`}>
                          {mode.blurb}
                        </p>
                        <span
                          className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            mode.soon
                              ? 'text-partyYellow border-partyYellow/40 bg-partyYellow/10'
                              : 'text-gray-300 border-white/15 bg-white/5'
                          }`}
                        >
                          {mode.players}
                        </span>
                      </div>
                    </button>

                  {/* The vibe only means anything to the AI Master, so it belongs
                      behind that mode rather than sitting over the whole lobby. */}
                  {mode.id === 'ai_master' && active && (
                    <div className="rounded-2xl border border-partyYellow/30 bg-partyYellow/[0.06] p-3.5 space-y-3 animate-fadeIn">
                      <div>
                        <h4 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-partyYellow" /> WHO IS IN THIS ROOM?
                        </h4>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {myPlayer.isHost
                            ? 'The AI Master reads this to pick its tone and its games.'
                            : `${ROOM_VIBES[roomVibe].emoji} ${ROOM_VIBES[roomVibe].label} — set by the host.`}
                        </p>
                      </div>

                      {myPlayer.isHost && (
                        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                          {Object.values(ROOM_VIBES).map((vibe) => {
                            const isSelected = vibe.id === roomVibe;
                            return (
                              <button
                                key={vibe.id}
                                type="button"
                                onClick={() => selectVibe(vibe.id)}
                                className={`p-2.5 rounded-xl border text-left transition-all relative active:scale-95 ${
                                  isSelected
                                    ? 'bg-partyPink/20 border-partyPink text-white shadow-lg'
                                    : 'bg-white/5 border-white/10 text-gray-300 hover:border-white/30'
                                }`}
                              >
                                {vibe.comingSoon && (
                                  <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 bg-black/50 text-partyYellow text-[8px] font-black px-1.5 py-0.5 rounded-full border border-partyYellow/30">
                                    <LockKeyhole className="w-2 h-2" /> SOON
                                  </span>
                                )}
                                <GameIcon src={vibeArt(vibe.id)} emoji={vibe.emoji} className="w-7 h-7 text-lg mx-auto" />
                                <span className="font-extrabold text-xs block mt-0.5">{vibe.label}</span>
                                <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{vibe.blurb}</span>
                                {isSelected && (
                                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-partyPink/30 px-2 py-0.5 text-[9px] font-black text-partyPink">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> SELECTED
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Setup only means anything to Truth or Dare, so it lives behind
                      that mode card rather than sitting over the whole lobby. */}
                  {mode.id === 'truth_or_dare' && active && (
                    <div className="rounded-2xl border border-partyPink/30 bg-partyPink/[0.06] p-3.5 space-y-4 animate-fadeIn">
                      <div>
                        <h4 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-partyPink" /> CATEGORIES
                        </h4>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {myPlayer.isHost
                            ? 'Pick what the room draws from. At least one stays on.'
                            : 'Set by the host.'}
                        </p>
                      </div>

                      <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                        {TRUTH_OR_DARE_CATEGORIES.filter((c) => !c.spicy).map((category) => {
                          const isOn = truthOrDareSettings.categories.includes(category.id);
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => toggleTruthOrDareCategory(category.id)}
                              disabled={!myPlayer.isHost}
                              className={`p-2.5 rounded-xl border text-left transition-all disabled:opacity-70 ${
                                isOn
                                  ? 'bg-partyPink/20 border-partyPink text-white shadow-lg'
                                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                              }`}
                            >
                              <span className="font-extrabold text-xs block">
                                {category.emoji} {category.label}
                              </span>
                              <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{category.blurb}</span>
                            </button>
                          );
                        })}
                      </div>

                      {TRUTH_OR_DARE_CATEGORIES.filter((c) => c.spicy).map((category) => {
                        const isOn = truthOrDareSettings.spicyEnabled && truthOrDareSettings.categories.includes(category.id);
                        return (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => {
                              toggleTruthOrDareSpicy();
                              if (!truthOrDareSettings.categories.includes(category.id)) {
                                toggleTruthOrDareCategory(category.id);
                              }
                            }}
                            disabled={!myPlayer.isHost}
                            className={`w-full p-2.5 rounded-xl border text-left transition-all disabled:opacity-70 ${
                              isOn
                                ? 'bg-orange-500/20 border-orange-400 text-white shadow-lg'
                                : 'bg-white/5 border-orange-400/20 text-gray-400 hover:border-orange-400/40'
                            }`}
                          >
                            <span className="font-extrabold text-xs block">
                              {category.emoji} {category.label} {isOn ? '— ON' : '— OFF'}
                            </span>
                            <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{category.blurb}</span>
                          </button>
                        );
                      })}

                      <div>
                        <h4 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                          <Dices className="w-3.5 h-3.5 text-partyPink" /> SELECTION MECHANIC
                        </h4>
                        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] mt-2">
                          {(Object.keys(TRUTH_OR_DARE_SELECTION_LABELS) as TruthOrDareSelectionMode[]).map((mode) => {
                            const info = TRUTH_OR_DARE_SELECTION_LABELS[mode];
                            const isOn = truthOrDareSettings.selectionModes.includes(mode);
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => toggleTruthOrDareSelectionMode(mode)}
                                disabled={!myPlayer.isHost}
                                className={`p-2.5 rounded-xl border text-left transition-all disabled:opacity-70 ${
                                  isOn
                                    ? 'bg-partyCyan/20 border-partyCyan text-white shadow-lg'
                                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                                }`}
                              >
                                <span className="font-extrabold text-xs block">
                                  {info.emoji} {info.label}
                                </span>
                                <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{info.blurb}</span>
                              </button>
                            );
                          })}
                        </div>
                        {truthOrDareSettings.selectionModes.length > 1 && (
                          <p className="text-[10px] text-gray-500 mt-1.5">Both on — rounds alternate between them.</p>
                        )}
                      </div>
                    </div>
                  )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* The pinned bar covers a phone; this is the desktop's copy. */}
          <div className="hidden lg:block pt-2 border-t border-white/10">{startControl}</div>

          {/* Host-only: the deck settings are rejected for anyone else. */}
          {isHost && (
            <button
              onClick={() => setShowCustomDecks(!showCustomDecks)}
              className="glass-pill hover:bg-white/15 text-partyCyan font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 border border-partyCyan/30 transition-all w-full justify-center"
            >
              <Settings className="w-4 h-4 text-partyYellow" />
              <span>{showCustomDecks ? 'HIDE DECK SETTINGS ▲' : 'CUSTOMIZE GAME DECKS & TEAMS ▼'}</span>
            </button>
          )}

          {showCustomDecks && (
            <div className="space-y-6 pt-4 pb-8 border-t border-white/10 animate-fadeIn">
              {/* Language Decks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-partyCyan" />
                    SPEED LANGUAGE DECKS
                  </h4>
                  <span className="text-[10px] text-partyPink font-bold">MULTIPLE SELECT</span>
                </div>
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                  {LANGUAGES.map((lang) => {
                    const isSelected = selectedLangs.includes(lang.id);
                    return (
                      <button
                        key={lang.id}
                        onClick={() => toggleLang(lang.id)}
                        className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-partyCyan/20 border-partyCyan text-white shadow-lg glow-cyan'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{lang.flag}</span>
                          <span className="font-extrabold text-sm">{lang.name}</span>
                        </div>
                        {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-partyCyan animate-pulse" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mini-Games List */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                <div>
                  <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-partyYellow" /> QUALIFYING MINI-GAMES
                  </h4>
                  <p className="text-xs text-gray-400">
                    Board-game turns are drawn at random from the games ticked here.
                  </p>
                </div>

                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                  {/* Only what the board can actually run. The list used to offer all
                      ten, but Spelling Bee, Story Builder, Debate and Guess the Voice
                      are skipped by the board's turn picker, so ticking them did
                      nothing. They are played in Team Battle, which has its own picker. */}
                  {MINI_GAMES.filter((game) => BOARD_MINI_GAMES.includes(game.id)).map((game) => {
                    const isSelected = selectedGames.includes(game.id);
                    return (
                      <button
                        key={game.id}
                        onClick={() => toggleMiniGame(game.id)}
                        className={`p-3.5 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'bg-partyCyan/20 border-partyYellow text-white shadow-lg glow-cyan'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                        }`}
                      >
                        <span className="text-xl block">{game.icon}</span>
                        <span className="font-extrabold text-sm block">{game.label}</span>
                        <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{game.blurb}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pinned above the phone's bottom bar (about 56px tall), so Start is always in reach. */}
      <div className="lg:hidden fixed bottom-[56px] left-0 right-0 z-30 px-3 pt-4 pb-2 bg-gradient-to-t from-partyDark via-partyDark/95 to-transparent">
        {startControl}
      </div>
    </div>
  );
}
