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
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AVATARS } from '@/lib/gameContent';
import { roomStore } from '@/lib/roomStore';
import { AvatarStyle, LanguageCode, MiniGameId, Player, RoomState } from '@/lib/types';
import { MAX_PLAYERS, TEAMS } from '@/lib/gameRules';
import { DEFAULT_ROOM_VIBE, ROOM_VIBES, RoomVibeId } from '@/lib/roomVibes';

const MINI_GAMES: { id: MiniGameId; name: string; icon: string; blurb: string }[] = [
  { id: 'voice_arena', name: 'Voice Arena', icon: '🎙️', blurb: 'Say the prompt before the timer dies' },
  { id: 'pitch_bird', name: 'PitchBird', icon: '🐦', blurb: 'Fly through gates using your pitch' },
  { id: 'solfege', name: 'Karaoke', icon: '🎵', blurb: 'Hear Do, then sing the note you are given' },
  { id: 'spelling_bee', name: 'Spelling Bee', icon: '🐝', blurb: 'Listen to the word, then spell it out loud' },
  { id: 'truth_or_bluff', name: 'Truth or Bluff', icon: '🎭', blurb: 'Tell a true story and a lie, see who guesses right' },
  { id: 'trivia_showdown', name: 'Trivia Showdown', icon: '🧠', blurb: 'Answer trivia questions fast with your voice' },
  { id: 'asteroid_defense', name: 'Asteroid Defense', icon: '☄️', blurb: 'Shoot down asteroids by calling out their words!' },
];
import { audioSFX } from '@/lib/audioFeedback';
import AvatarIllustration from './AvatarIllustration';
import BackgroundMusic from './BackgroundMusic';

interface RoomLobbyProps {
  room: RoomState;
  myPlayer: Player;
  onStartGame: () => void;
  onSelectMode?: (mode: 'board' | 'karaoke' | 'hangout' | 'ai_master' | 'team_battle' | 'chess' | 'ludo') => void;
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
  const [newPlayerName, setNewPlayerName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [activeMode, setActiveMode] = useState<'board' | 'karaoke' | 'hangout' | 'ai_master' | 'team_battle' | 'chess' | 'ludo'>('board');
  const [showCustomDecks, setShowCustomDecks] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [selectedGames, setSelectedGames] = useState<MiniGameId[]>(
    room.enabledMiniGames ?? ['voice_arena', 'pitch_bird']
  );
  const roomVibe: RoomVibeId = room.roomVibe ?? DEFAULT_ROOM_VIBE;
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

  const toggleMiniGame = (id: MiniGameId) => {
    // At least one has to stay on, otherwise a turn has nothing to play.
    const updated = selectedGames.includes(id)
      ? selectedGames.filter((g) => g !== id)
      : [...selectedGames, id];
    if (updated.length === 0) return;
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

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlayerName.trim();
    if (!name) return;

    setAddError(null);
    // Adding a pass-and-play player must not steal this browser's identity, so
    // the returned playerId is deliberately ignored here.
    const myId = roomStore.getMyPlayerId(room.roomId);
    const result = await roomStore.joinRoom(room.roomId, name);
    if (myId) roomStore.setMyPlayerId(myId, room.roomId);

    if (result.error) {
      setAddError(result.error);
      return;
    }
    audioSFX.playChoiSuccess();
    setNewPlayerName('');
  };

  return (
    // pb-28 on small screens keeps the whole lobby clear of the fixed mobile
    // action bar, which otherwise covers whatever ends up last on the page.
    <div className="max-w-5xl mx-auto px-2 sm:px-4 pt-4 pb-28 lg:pb-4 space-y-6 animate-fadeIn relative">
      {/* Ambient Glow Blobs */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-purple-600/15 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-emerald-500/15 blur-3xl rounded-full pointer-events-none" />

      {/* Ambient Dashboard Background Music */}
      <BackgroundMusic screen="lobby" />

      {/* Compact WhatsApp Direct Invite Banner */}
      <div className="glass-card rounded-2xl p-3.5 sm:p-4 border border-emerald-400/20 relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 shrink-0">
            <MessageCircle className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-white">
              INVITE CREW TO PLAY
            </h3>
            <p className="text-gray-300 text-xs">
              Send room code <span className="text-partyYellow font-mono font-bold">{room.roomId}</span> directly via WhatsApp
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

      {/* Room Vibe — tunes the AI Master's tone and game mix to who's actually in the room */}
      <div className="glass-card rounded-3xl p-4 sm:p-6 space-y-3 border border-white/5 shadow-2xl relative z-10">
        <div>
          <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-partyYellow" />
            SET THE ROOM VIBE
          </h3>
          <p className="text-xs text-gray-400">
            {myPlayer.isHost
              ? 'Tell the AI Master who is in the room so it can read the mood right.'
              : `Room vibe: ${ROOM_VIBES[roomVibe].label} — set by the host.`}
          </p>
        </div>

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
          {Object.values(ROOM_VIBES).map((vibe) => {
            const isSelected = vibe.id === roomVibe;
            const disabled = !myPlayer.isHost;
            return (
              <button
                key={vibe.id}
                type="button"
                onClick={() => selectVibe(vibe.id)}
                disabled={disabled}
                className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                  isSelected
                    ? 'bg-partyPink/20 border-partyPink text-white shadow-lg glow-yellow'
                    : 'bg-white/5 border-white/10 text-gray-300 hover:border-white/30'
                } ${disabled ? 'cursor-default' : 'active:scale-95'}`}
              >
                {vibe.comingSoon && (
                  <span className="absolute top-2 right-2 bg-black/50 text-partyYellow text-[8px] font-black px-1.5 py-0.5 rounded-full border border-partyYellow/30 whitespace-nowrap">
                    🔒 SOON
                  </span>
                )}
                <span className="text-xl block">{vibe.emoji}</span>
                <span className="font-extrabold text-sm block mt-1">{vibe.label}</span>
                <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{vibe.blurb}</span>
                {isSelected && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-partyPink/30 px-2 py-0.5 text-[9px] font-black text-partyPink">
                    <CheckCircle2 className="w-2.5 h-2.5" /> SELECTED
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-up grid for Lounging Area & Mode Hub */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 relative z-10">
        {/* Player Lounging Area */}
        <div className="glass-card rounded-3xl p-4 sm:p-6 space-y-5 border border-white/5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-partyYellow" />
                THE LOUNGING AREA ({room.players.length}/{MAX_PLAYERS} PLAYERS)
              </h3>
              <p className="text-xs text-gray-400">Local hangout spot for joined avatars</p>
            </div>
            <span className="text-xs text-partyYellow font-mono font-bold bg-partyYellow/20 px-3 py-1 rounded-full border border-partyYellow/30">
              {room.roomId}
            </span>
          </div>

          {/* Compact Profile & Avatar Bar (No page clutter!) */}
          <div className="rounded-2xl bg-partyDark/70 border border-partyCyan/25 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AvatarIllustration avatar={myPlayer.avatar} size="md" />
              <div>
                <span className="text-[10px] font-black text-partyYellow uppercase tracking-wider block">YOUR ACTIVE AVATAR</span>
                <h4 className="text-base font-black text-white">{myPlayer.avatar.name}</h4>
                <p className="text-[11px] text-partyCyan font-bold">{myPlayer.avatar.role ?? 'Party Contestant'}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAvatarModal(true)}
              className="bg-partyCyan/20 hover:bg-partyCyan/35 text-partyCyan font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95 border border-partyCyan/40"
            >
              <Shirt className="w-4 h-4 text-partyYellow" />
              <span>CHANGE AVATAR</span>
            </button>
          </div>

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
                </div>
              ))}
            </div>
          )}

          {/* Quick Add Player Form */}
          {room.players.length < MAX_PLAYERS && (
            <form onSubmit={handleAddPlayer} className="pt-2 space-y-3">
              <label className="text-xs font-bold text-gray-300 block">ADD LOCAL HANGOUT PLAYER (PASS & PLAY):</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter Player Name..."
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  maxLength={20}
                  className="flex-1 bg-partyDark/90 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-partyYellow"
                />
                <button
                  type="submit"
                  disabled={!newPlayerName.trim()}
                  className="bg-partyYellow hover:bg-yellow-400 disabled:opacity-50 text-partyDark font-black text-sm px-5 py-2.5 rounded-xl transition-all shadow-md"
                >
                  ADD
                </button>
              </div>
              {addError && <p className="text-xs text-red-300">{addError}</p>}
            </form>
          )}
        </div>

        {/* Cosmic App Feature Mode Selector Hub */}
        <div className="glass-card rounded-3xl p-4 sm:p-6 space-y-5 border border-white/5 shadow-2xl">
          <div className="space-y-2">
            <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-partyYellow" />
              CHOOSE APP GAME MODE
            </h3>
            <p className="text-xs text-gray-300">Tap a mode to select what you want to play</p>

            <div className="grid grid-cols-1 gap-3 pt-2">
              {/* 1. Board Game Mode */}
              <button
                onClick={() => {
                  setActiveMode('board');
                  audioSFX.playChoiSuccess();
                }}
                className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-start gap-2.5 sm:gap-3 ${
                  activeMode === 'board'
                    ? 'bg-cyan-950/40 border-partyCyan text-white shadow-xl glow-cyan'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                <div className="text-2xl sm:text-3xl p-2 sm:p-2.5 rounded-xl bg-partyCyan/15 border border-partyCyan/30 shrink-0">
                  🎲
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 flex-wrap">
                    BOARD GAME ROADMAP
                    {activeMode === 'board' && (
                      <span className="bg-partyCyan text-partyDark text-[9px] px-2 py-0.5 rounded-full font-black">
                        SELECTED
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-gray-300 mt-1 leading-snug">
                    Multiplayer 3D dice rolling, roadmap tiles, trap placement & powerup shop!
                  </p>
                </div>
              </button>

              {/* 2. Karaoke Arcade */}
              <button
                onClick={() => {
                  setActiveMode('karaoke');
                  audioSFX.playChoiSuccess();
                }}
                className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-start gap-2.5 sm:gap-3.5 ${
                  activeMode === 'karaoke'
                    ? 'bg-gradient-to-r from-pink-950/80 via-slate-900/90 to-pink-900/50 border-partyPink text-white shadow-xl'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                <div className="text-2xl sm:text-3xl p-2 sm:p-2.5 rounded-xl bg-partyPink/15 border border-partyPink/30 shrink-0">
                  🎤
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 flex-wrap">
                    KARAOKE & PITCH ARCADE
                    {activeMode === 'karaoke' && (
                      <span className="bg-partyPink text-white text-[9px] px-2 py-0.5 rounded-full font-black">
                        SELECTED
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-gray-300 mt-1 leading-snug">
                    PitchBird flying 🐦, Solfege Note Matching 🎵 & Voice Arena fast-mic!
                  </p>
                </div>
              </button>

              {/* 3. Hangout Lounge */}
              <button
                onClick={() => {
                  setActiveMode('hangout');
                  audioSFX.playChoiSuccess();
                }}
                className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-start gap-2.5 sm:gap-3.5 ${
                  activeMode === 'hangout'
                    ? 'bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-emerald-900/50 border-emerald-400 text-white shadow-xl glow-emerald'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                <div className="text-2xl sm:text-3xl p-2 sm:p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 shrink-0">
                  🍻
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 flex-wrap">
                    15s ROAST HANGOUT
                    {activeMode === 'hangout' && (
                      <span className="bg-emerald-500 text-partyDark text-[9px] px-2 py-0.5 rounded-full font-black">
                        SELECTED
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-gray-300 mt-1 leading-snug">
                    Open-mic voice lounge, party soundboard pad (Danfo Horn) & roast countdown!
                  </p>
                </div>
              </button>

              {/* 4. AI Game Master Mode */}
              <button
                onClick={() => {
                  setActiveMode('ai_master');
                  audioSFX.playChoiSuccess();
                }}
                className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-start gap-2.5 sm:gap-3.5 ${
                  activeMode === 'ai_master'
                    ? 'bg-gradient-to-r from-amber-950/80 via-slate-900/90 to-amber-900/50 border-partyYellow text-white shadow-xl glow-yellow'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                <div className="text-2xl sm:text-3xl p-2 sm:p-2.5 rounded-xl bg-partyYellow/15 border border-partyYellow/30 shrink-0">
                  🤖
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 flex-wrap">
                    AI GAME MASTER MODE
                    {activeMode === 'ai_master' && (
                      <span className="bg-partyYellow text-partyDark text-[9px] px-2 py-0.5 rounded-full font-black">
                        SELECTED
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-gray-300 mt-1 leading-snug">
                    Live AI Host challenges, Truth or Bluff, Debate topics & voice trivia!
                  </p>
                </div>
              </button>
              {/* 5. Team Battle */}
              <button
                onClick={() => {
                  setActiveMode('team_battle');
                  audioSFX.playChoiSuccess();
                }}
                className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-start gap-2.5 sm:gap-3.5 ${
                  activeMode === 'team_battle'
                    ? 'bg-gradient-to-r from-red-950/80 via-slate-900/90 to-red-900/50 border-red-500 text-white shadow-xl glow-red'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                <div className="text-2xl sm:text-3xl p-2 sm:p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 shrink-0">
                  ⚔️
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 flex-wrap">
                    TEAM BATTLE
                    {activeMode === 'team_battle' && (
                      <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-black">
                        SELECTED
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-gray-300 mt-1 leading-snug">
                    Squad up! 2v2 or 3v3 sudden death voice duels. Pick your side!
                  </p>
                </div>
              </button>

              {/* 6. Chess Arena (1v1, 2v2 Consultation, vs AI) */}
              <button
                onClick={() => {
                  setActiveMode('chess');
                  audioSFX.playChoiSuccess();
                }}
                className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-start gap-2.5 sm:gap-3.5 ${
                  activeMode === 'chess'
                    ? 'bg-gradient-to-r from-sky-950/80 via-slate-900/90 to-indigo-900/50 border-cyan-400 text-white shadow-xl glow-cyan'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                <div className="text-2xl sm:text-3xl p-2 sm:p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-400/30 shrink-0">
                  ♟️
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 flex-wrap">
                    CHESS ARENA
                    {activeMode === 'chess' && (
                      <span className="bg-cyan-400 text-slate-950 text-[9px] px-2 py-0.5 rounded-full font-black">
                        SELECTED
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-gray-300 mt-1 leading-snug">
                    1v1 Duels, 2v2 Team Consultation with secret strategy voice, or Solo vs AI Bot!
                  </p>
                </div>
              </button>

              {/* 7. Ludo Party (2-4 Players, Bots & Music) */}
              <button
                onClick={() => {
                  setActiveMode('ludo');
                  audioSFX.playChoiSuccess();
                }}
                className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex items-start gap-2.5 sm:gap-3.5 ${
                  activeMode === 'ludo'
                    ? 'bg-gradient-to-r from-amber-950/80 via-slate-900/90 to-yellow-900/50 border-amber-400 text-white shadow-xl glow-yellow'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                <div className="text-2xl sm:text-3xl p-2 sm:p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/30 shrink-0">
                  🎲
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5 flex-wrap">
                    LUDO VOICE PARTY
                    {activeMode === 'ludo' && (
                      <span className="bg-amber-400 text-slate-950 text-[9px] px-2 py-0.5 rounded-full font-black">
                        SELECTED
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-gray-300 mt-1 leading-snug">
                    Classic 4-player Ludo with animated dice, background party music, and bot fill!
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Toggle Button for Custom Deck Settings (HIDDEN BY DEFAULT) */}
          <div className="pt-2 flex flex-col gap-3 border-t border-white/10">
            {/* Team Battle takes two presses on purpose: the first switches the
                room into team mode so the crew roster appears above and people
                can arrange sides, the second actually starts the series. */}
            <button
              onClick={() => (onSelectMode ? onSelectMode(activeMode) : onStartGame())}
              className="w-full bg-gradient-to-r from-partyYellow via-terracotta to-partyPink text-partyDark font-black text-sm sm:text-base py-3 sm:py-3.5 px-6 sm:px-8 rounded-2xl flex items-center justify-center gap-2 sm:gap-3 transition-all transform hover:scale-[1.02] active:scale-95 shadow-2xl glow-yellow"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>
                {activeMode === 'team_battle' && room.roomType !== 'team_battle'
                  ? 'SET UP THE CREWS'
                  : 'LAUNCH MATCH NOW'}
              </span>
            </button>

            <button
              onClick={() => setShowCustomDecks(!showCustomDecks)}
              className="glass-pill hover:bg-white/15 text-partyCyan font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 border border-partyCyan/30 transition-all w-full justify-center"
            >
              <Settings className="w-4 h-4 text-partyYellow" />
              <span>{showCustomDecks ? 'HIDE DECK SETTINGS ▲' : 'CUSTOMIZE GAME DECKS & TEAMS ▼'}</span>
            </button>
          </div>

          {/* HIDDEN UNTIL USER OPENS DECK SETTINGS */}
          {/* pb-8 so the last row clears the fixed mobile action bar. Without it
              the bottom game in the deck list sat underneath the bar and could
              not be tapped. */}
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
                    Pick mini-games to include in random turn rotation.
                  </p>
                </div>

                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                  {MINI_GAMES.map((game) => {
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
                        <span className="font-extrabold text-sm block">{game.name}</span>
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
    </div>
  );
}
