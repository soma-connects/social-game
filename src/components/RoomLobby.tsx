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
  Scale,
} from 'lucide-react';
import { AVATARS } from '@/lib/gameContent';
import { roomStore } from '@/lib/roomStore';
import { AvatarStyle, LanguageCode, MiniGameId, Player, RoomState } from '@/lib/types';
import { MAX_PLAYERS, TEAMS } from '@/lib/gameRules';

const MINI_GAMES: { id: MiniGameId; name: string; icon: string; blurb: string }[] = [
  { id: 'voice_arena', name: 'Voice Arena', icon: '🎙️', blurb: 'Say the prompt before the timer dies' },
  { id: 'pitch_bird', name: 'PitchBird', icon: '🐦', blurb: 'Fly through gates using your pitch' },
];
import { audioSFX } from '@/lib/audioFeedback';
import AvatarIllustration from './AvatarIllustration';

interface RoomLobbyProps {
  room: RoomState;
  myPlayer: Player;
  onStartGame: () => void;
}

const LANGUAGES: { id: LanguageCode; name: string; flag: string }[] = [
  { id: 'hausa', name: 'Hausa', flag: '🇳🇬' },
  { id: 'igbo', name: 'Igbo', flag: '🇳🇬' },
  { id: 'yoruba', name: 'Yoruba', flag: '🇳🇬' },
  { id: 'pidgin', name: 'Naija Pidgin', flag: '🇳🇬' },
  { id: 'spanish', name: 'Spanish', flag: '🇪🇸' },
  { id: 'french', name: 'French', flag: '🇫🇷' },
  { id: 'japanese', name: 'Japanese', flag: '🇯🇵' },
  { id: 'korean', name: 'Korean', flag: '🇰🇷' },
];

export default function RoomLobby({ room, myPlayer, onStartGame }: RoomLobbyProps) {
  const [selectedLangs, setSelectedLangs] = useState<LanguageCode[]>(room.selectedLanguages);
  const [mathEnabled, setMathEnabled] = useState(room.mathEnabled);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [selectedGames, setSelectedGames] = useState<MiniGameId[]>(
    room.enabledMiniGames ?? ['voice_arena', 'pitch_bird']
  );
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
    const myId = roomStore.getMyPlayerId();
    const result = await roomStore.joinRoom(room.roomId, name);
    if (myId) roomStore.setMyPlayerId(myId);

    if (result.error) {
      setAddError(result.error);
      return;
    }
    audioSFX.playChoiSuccess();
    setNewPlayerName('');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-fadeIn relative">
      {/* Ambient Glow Blobs */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-purple-600/25 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-emerald-500/20 blur-3xl rounded-full pointer-events-none" />

      {/* Prominent WhatsApp Invite Banner */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-emerald-400/40 relative overflow-hidden text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 glow-emerald backdrop-blur-xl bg-slate-900/70">
        <div className="space-y-3 z-10">
          <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-black tracking-wider border border-emerald-400/30">
            <Sparkles className="w-3.5 h-3.5" /> WHATSAPP DIRECT INVITE
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            &quot;OYA JOIN MY GAME, <span className="text-partyYellow block sm:inline">MAKE I CLEAR YOU!&quot;</span>
          </h2>
          <p className="text-gray-300 text-sm max-w-xl">
            Invite your crew directly via WhatsApp! Tap below to send room link and start the speed voice challenge!
          </p>
        </div>

        <button
          onClick={shareToWhatsApp}
          className="bg-emerald-500 hover:bg-emerald-400 text-partyDark font-black text-base px-8 py-4 rounded-2xl flex items-center gap-3 transition-all transform hover:scale-105 shadow-2xl glow-emerald"
        >
          <MessageCircle className="w-6 h-6 fill-current" />
          <span>SHARE TO WHATSAPP</span>
        </button>
      </div>

      {/* Two-up only once the play column is genuinely wide enough for it. */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 relative z-10">
        {/* Player Lounging Area */}
        <div className="glass-card rounded-3xl p-6 space-y-6 backdrop-blur-xl bg-slate-900/60 border border-white/20">
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
              className="bg-partyPurple hover:bg-purple-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95 border border-partyPink/40"
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

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {room.players.map((player) => (
              <div
                key={player.id}
                className="glass-pill rounded-2xl p-4 space-y-3 border border-white/15 hover:border-partyYellow/50 transition-all text-center relative overflow-hidden flex flex-col items-center"
              >
                {/* Full character card poster */}
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

        {/* Category & Language Deck Selector */}
        <div className="glass-card rounded-3xl p-6 space-y-6 backdrop-blur-xl bg-slate-900/60 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-partyCyan" />
                SPEED LANGUAGE DECKS
              </h3>
              <p className="text-xs text-gray-400">Tap pill buttons to pick active decks</p>
            </div>
            <span className="text-xs text-partyPink font-bold">MULTIPLE SELECT</span>
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
            {LANGUAGES.map((lang) => {
              const isSelected = selectedLangs.includes(lang.id);
              return (
                <button
                  key={lang.id}
                  onClick={() => toggleLang(lang.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-partyPurple/50 border-partyCyan text-white shadow-lg glow-cyan'
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

          {/* Quick Math Sprinks Toggle */}
          <div className="glass-pill rounded-2xl p-4 flex items-center justify-between border border-white/10">
            <div>
              <h4 className="font-bold text-sm text-white">⚡ QUICK MATH SPRINKS</h4>
              <p className="text-xs text-gray-400">Mix rapid addition/subtraction problems into voice challenges!</p>
            </div>
            <button
              onClick={toggleMath}
              className={`w-12 h-6 rounded-full transition-colors p-1 flex items-center ${
                mathEnabled ? 'bg-emerald-500 justify-end' : 'bg-gray-700 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Crews — everyone still performs solo, they just perform for a side */}
          <div className="space-y-3 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                  <Swords className="w-4 h-4 text-partyPink" /> TEAM MODE
                </h4>
                <p className="text-xs text-gray-400">
                  Red Crew vs Blue Crew. You still perform alone — the other crew judges you.
                </p>
              </div>
              <button
                onClick={() => roomStore.setTeamMode(room.roomId, !room.teamMode)}
                className={`w-12 h-6 rounded-full transition-colors p-1 flex items-center shrink-0 ${
                  room.teamMode ? 'bg-partyPink justify-end' : 'bg-gray-700 justify-start'
                }`}
                aria-label="Toggle team mode"
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md" />
              </button>
            </div>

            {room.teamMode && (
              <div className="space-y-3 animate-fadeIn">
                <div className="grid grid-cols-2 gap-3">
                  {TEAMS.map((team) => {
                    const members = room.players.filter((p) => p.teamId === team.id);
                    const iAmHere = myPlayer.teamId === team.id;
                    return (
                      <button
                        key={team.id}
                        onClick={() => roomStore.setTeam(room.roomId, myPlayer.id, team.id)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          iAmHere ? 'border-2 shadow-lg' : 'border-white/10 bg-white/5 hover:border-white/30'
                        }`}
                        style={
                          iAmHere
                            ? { borderColor: team.color, backgroundColor: `${team.color}22` }
                            : undefined
                        }
                      >
                        <span className="font-extrabold text-xs text-white flex items-center gap-1.5">
                          {team.icon} {team.name}
                          {iAmHere && (
                            <span className="bg-white/20 text-[8px] px-1 rounded font-black">YOU</span>
                          )}
                        </span>
                        <p className="text-[10px] text-gray-300 mt-1 truncate">
                          {members.length > 0 ? members.map((m) => m.name).join(', ') : 'Empty — tap to join'}
                        </p>
                        <p className="text-[10px] font-black mt-0.5" style={{ color: team.color }}>
                          {members.reduce((sum, m) => sum + m.score, 0)} pts
                        </p>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => roomStore.balanceTeams(room.roomId)}
                  className="w-full glass-pill hover:bg-white/20 text-gray-200 font-bold text-[11px] py-2 rounded-xl border border-white/15 flex items-center justify-center gap-1.5"
                >
                  <Scale className="w-3.5 h-3.5" /> AUTO-BALANCE CREWS
                </button>
              </div>
            )}
          </div>

          {/* Which qualifying mini-games feed the board */}
          <div className="space-y-3 pt-1 border-t border-white/10">
            <div>
              <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-partyYellow" /> QUALIFYING MINI-GAMES
              </h4>
              <p className="text-xs text-gray-400">
                One is picked at random each turn. Your score sets how far you move and what you can buy.
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
                        ? 'bg-partyPurple/50 border-partyYellow text-white shadow-lg'
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

          {/* Start Game Action */}
          <div className="pt-2">
            <button
              onClick={onStartGame}
              className="w-full bg-gradient-to-r from-partyPink via-partyPurple to-partyCyan text-white font-black text-base py-4 rounded-2xl flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-95 shadow-2xl glow-pink"
            >
              <Play className="w-6 h-6 fill-current" />
              <span>START THE ROADMAP MATCH</span>
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-2">
              Each turn: mini-game → buy buffs → move on the board.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
