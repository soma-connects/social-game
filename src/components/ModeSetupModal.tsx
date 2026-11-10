'use client';

import React, { useState } from 'react';
import { Bot, Dices, Gamepad2, Globe, Play, Sparkles, Swords, Timer, Users, X } from 'lucide-react';
import {
  LanguageCode,
  MiniGameId,
  RoomState,
  TruthOrDareCategoryId,
  TruthOrDarePromptSource,
  TruthOrDareSelectionMode,
  TruthOrDareSettings,
} from '@/lib/types';
import { BOARD_MINI_GAMES, MINI_GAMES, TRUTH_OR_DARE_BLOCKED_MESSAGE, truthOrDareAllowed } from '@/lib/gameRules';
import { ROOM_VIBES, RoomVibeId } from '@/lib/roomVibes';
import {
  TRUTH_OR_DARE_CATEGORIES,
  TRUTH_OR_DARE_PROMPT_SOURCES,
  TRUTH_OR_DARE_SELECTION_LABELS,
} from '@/lib/truthOrDareContent';
import { BotDifficulty, ChessGameMode, ChessTimeControl } from '@/lib/chess/chessTypes';
import { vibeArt } from '@/lib/gameIcons';
import GameIcon from './GameIcon';
import TruthOrDareIdeas from './TruthOrDareIdeas';

export type GameModeId =
  | 'board'
  | 'karaoke'
  | 'hangout'
  | 'ai_master'
  | 'truth_or_dare'
  | 'team_battle'
  | 'chess'
  | 'ludo';

/**
 * What the host chose in the setup sheet, handed to the launcher.
 *
 * Each mode reads only its own key. The board and the AI Master push their
 * settings to the room as they are toggled — the deck and the vibe are shared
 * state everyone in the lobby can see — so they have nothing to carry here.
 */
export type ModeLaunchOptions = {
  chess?: { mode: ChessGameMode; timeControl: ChessTimeControl; botDifficulty: BotDifficulty };
  ludo?: { humanSeats: number };
};

const CHESS_FORMATS: { id: ChessGameMode; label: string; blurb: string; ai?: boolean }[] = [
  { id: '1v1', label: '1 v 1', blurb: 'Two humans' },
  { id: '2v2', label: '2 v 2', blurb: 'Teams confer' },
  { id: 'vs_ai', label: 'vs AI', blurb: 'Beat the bot', ai: true },
];

/**
 * People each chess format has to seat. The server fills sides from the roster
 * in order, so launching one short leaves a side nobody can move — 2 v 2 with
 * two players puts both on white, and 1 v 1 alone seats a placeholder opponent.
 */
const CHESS_SEATS: Record<ChessGameMode, number> = { '1v1': 2, '2v2': 4, vs_ai: 1 };

const TIME_CONTROLS: { id: ChessTimeControl; label: string; blurb: string }[] = [
  { id: 'bullet_1m', label: 'Bullet', blurb: '1 min' },
  { id: 'blitz_3m', label: 'Blitz', blurb: '3 min' },
  { id: 'blitz_5m', label: 'Blitz', blurb: '5 min' },
  { id: 'rapid_10m', label: 'Rapid', blurb: '10 min' },
  { id: 'casual', label: 'Casual', blurb: 'No clock' },
];

const BOT_LEVELS: { id: BotDifficulty; label: string; blurb: string }[] = [
  { id: 'cadet', label: 'Cadet', blurb: 'Learning' },
  { id: 'navigator', label: 'Navigator', blurb: 'Fair fight' },
  { id: 'commander', label: 'Commander', blurb: 'Sharp' },
  { id: 'overlord', label: 'Overlord', blurb: 'Brutal' },
];

const LANGUAGES: { id: LanguageCode; name: string; flag: string }[] = [
  { id: 'english', name: 'English', flag: '🇬🇧' },
  { id: 'spanish', name: 'Spanish', flag: '🇪🇸' },
  { id: 'french', name: 'French', flag: '🇫🇷' },
  { id: 'japanese', name: 'Japanese', flag: '🇯🇵' },
  { id: 'korean', name: 'Korean', flag: '🇰🇷' },
];

const MODE_TITLES: Record<GameModeId, { title: string; blurb: string }> = {
  board: { title: 'Board Game Roadmap', blurb: 'Pick what the qualifying rounds are played on.' },
  karaoke: { title: 'Karaoke Arcade', blurb: 'Not open yet.' },
  hangout: { title: 'Roast & Open-Mic Lounge', blurb: 'Not open yet.' },
  ai_master: { title: 'AI Game Master', blurb: 'Tell the host who it is playing to.' },
  truth_or_dare: { title: 'Truth or Dare', blurb: 'The built-in deck, your own ideas, or both.' },
  team_battle: { title: 'Team Battle', blurb: 'Two crews, one series.' },
  chess: { title: 'Chess', blurb: 'Choose your opponent and your clock.' },
  ludo: { title: 'Ludo', blurb: 'Choose how many seats are human.' },
};

interface ModeSetupModalProps {
  mode: GameModeId;
  room: RoomState;
  isHost: boolean;
  selectedLangs: LanguageCode[];
  onToggleLang: (id: LanguageCode) => void;
  selectedGames: MiniGameId[];
  onToggleMiniGame: (id: MiniGameId) => void;
  roomVibe: RoomVibeId;
  onSelectVibe: (id: RoomVibeId) => void;
  truthOrDareSettings: TruthOrDareSettings;
  onToggleTruthOrDareCategory: (id: TruthOrDareCategoryId) => void;
  onToggleTruthOrDareSpicy: () => void;
  onToggleTruthOrDareSelectionMode: (mode: TruthOrDareSelectionMode) => void;
  onSetTruthOrDarePromptSource: (source: TruthOrDarePromptSource) => void;
  onClose: () => void;
  onLaunch: (options: ModeLaunchOptions) => void;
}

/** Shared look for every option tile, so the modes do not drift apart. */
function OptionTile({
  selected,
  onClick,
  children,
  accent = 'cyan',
  disabled = false,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  accent?: 'cyan' | 'yellow' | 'pink';
  disabled?: boolean;
}) {
  const on = {
    cyan: 'bg-partyCyan/20 border-partyCyan text-white shadow-lg glow-cyan',
    yellow: 'bg-partyYellow/20 border-partyYellow text-white shadow-lg glow-yellow',
    pink: 'bg-partyPink/20 border-partyPink text-white shadow-lg',
  }[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`p-3 rounded-2xl border text-left transition-all ${
        disabled
          ? 'bg-white/[0.02] border-white/5 text-gray-500 opacity-50 cursor-not-allowed'
          : selected
          ? `${on} active:scale-95`
          : 'bg-white/5 border-white/10 text-gray-300 hover:border-white/30 active:scale-95'
      }`}
    >
      {children}
    </button>
  );
}

function SectionHeading({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div>
      <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
        {icon}
        {title}
      </h4>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function ModeSetupModal({
  mode,
  room,
  isHost,
  selectedLangs,
  onToggleLang,
  selectedGames,
  onToggleMiniGame,
  roomVibe,
  onSelectVibe,
  truthOrDareSettings,
  onToggleTruthOrDareCategory,
  onToggleTruthOrDareSpicy,
  onToggleTruthOrDareSelectionMode,
  onSetTruthOrDarePromptSource,
  onClose,
  onLaunch,
}: ModeSetupModalProps) {
  const humanCount = room.players.length;

  // Chess. The server has always accepted these three; the lobby just never
  // asked, so every match was a 5-minute blitz against a Navigator bot.
  const [chessMode, setChessMode] = useState<ChessGameMode>(() =>
    humanCount >= 4 ? '2v2' : humanCount === 1 ? 'vs_ai' : '1v1'
  );
  const [timeControl, setTimeControl] = useState<ChessTimeControl>('blitz_5m');
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('navigator');

  // Re-derived every render rather than trusted from state, so a player leaving
  // while the sheet is open cannot leave a format picked that no longer fits.
  const chessReady = humanCount >= CHESS_SEATS[chessMode];

  // Ludo seats up to four; whatever is left over is filled with bots. A seat
  // can only be held for someone who is actually here.
  const maxSeats = Math.max(1, Math.min(4, humanCount));
  const [humanSeats, setHumanSeats] = useState(maxSeats);
  const seats = Math.min(humanSeats, maxSeats);

  const comingSoon = mode === 'karaoke' || mode === 'hangout';
  const blocked =
    comingSoon ||
    (mode === 'chess' && !chessReady) ||
    // Both mirror the server's own checks on truth_or_dare_start: a target needs
    // at least one other person to call on, and it is off in public rooms.
    (mode === 'truth_or_dare' && (humanCount < 2 || !truthOrDareAllowed(room)));
  const teamSetupStep = mode === 'team_battle' && room.roomType !== 'team_battle';
  const { title, blurb } = MODE_TITLES[mode];

  const launch = () => {
    onLaunch({
      chess: { mode: chessMode, timeControl, botDifficulty },
      ludo: { humanSeats: seats },
    });
  };

  const launchLabel = comingSoon
    ? 'COMING SOON'
    : teamSetupStep
    ? 'SET UP THE CREWS'
    : 'LAUNCH MATCH NOW';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[88vh] flex flex-col glass-card rounded-t-3xl sm:rounded-3xl border border-white/15 bg-slate-900/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <h3 className="font-extrabold text-lg text-white truncate">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{blurb}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup"
            className="text-gray-400 hover:text-white active:scale-95 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {comingSoon && (
            <p className="text-sm text-gray-300">
              This mode is still being built. Pick another one for now.
            </p>
          )}

          {/* ── Chess ─────────────────────────────────────────────────────── */}
          {mode === 'chess' && (
            <>
              <div className="space-y-3">
                <SectionHeading
                  icon={<Swords className="w-4 h-4 text-partyCyan" />}
                  title="WHO ARE YOU PLAYING?"
                />
                <div className="grid grid-cols-3 gap-2">
                  {CHESS_FORMATS.map((f) => {
                    const short = humanCount < CHESS_SEATS[f.id];
                    return (
                      <OptionTile
                        key={f.id}
                        selected={chessMode === f.id}
                        disabled={short}
                        onClick={() => setChessMode(f.id)}
                      >
                        {f.ai ? <Bot className="w-4 h-4 text-partyPink" /> : <Users className="w-4 h-4 text-partyCyan" />}
                        <span className="font-extrabold text-xs block mt-1">{f.label}</span>
                        <span className="text-[10px] text-gray-400 block">
                          {short ? `Needs ${CHESS_SEATS[f.id]} players` : f.blurb}
                        </span>
                      </OptionTile>
                    );
                  })}
                </div>
                {!chessReady && (
                  <p className="text-[11px] text-amber-300">
                    {CHESS_FORMATS.find((f) => f.id === chessMode)?.label} needs {CHESS_SEATS[chessMode]} players
                    — this room has {humanCount}. Pick another format.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <SectionHeading icon={<Timer className="w-4 h-4 text-partyYellow" />} title="CLOCK" />
                <div className="grid grid-cols-3 gap-2">
                  {TIME_CONTROLS.map((tc) => (
                    <OptionTile
                      key={tc.id}
                      accent="yellow"
                      selected={timeControl === tc.id}
                      onClick={() => setTimeControl(tc.id)}
                    >
                      <span className="font-extrabold text-xs block">{tc.label}</span>
                      <span className="text-[10px] text-gray-400 block">{tc.blurb}</span>
                    </OptionTile>
                  ))}
                </div>
              </div>

              {chessMode === 'vs_ai' && (
                <div className="space-y-3 animate-fadeIn">
                  <SectionHeading icon={<Bot className="w-4 h-4 text-partyPink" />} title="BOT STRENGTH" />
                  <div className="grid grid-cols-4 gap-2">
                    {BOT_LEVELS.map((lvl) => (
                      <OptionTile
                        key={lvl.id}
                        accent="pink"
                        selected={botDifficulty === lvl.id}
                        onClick={() => setBotDifficulty(lvl.id)}
                      >
                        <span className="font-extrabold text-[11px] block">{lvl.label}</span>
                        <span className="text-[9px] text-gray-400 block">{lvl.blurb}</span>
                      </OptionTile>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Ludo ──────────────────────────────────────────────────────── */}
          {mode === 'ludo' && (
            <div className="space-y-3">
              <SectionHeading
                icon={<Users className="w-4 h-4 text-partyCyan" />}
                title="HUMAN SEATS"
                hint="Ludo always seats four. Whatever you leave open is filled with bots."
              />
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <OptionTile
                    key={n}
                    selected={seats === n}
                    disabled={n > maxSeats}
                    onClick={() => setHumanSeats(n)}
                  >
                    <span className="font-extrabold text-sm block text-center">{n}</span>
                    <span className="text-[10px] text-gray-400 block text-center">
                      {n > maxSeats
                        ? `Needs ${n} players`
                        : 4 - n === 0
                        ? 'no bots'
                        : `+${4 - n} bot${4 - n > 1 ? 's' : ''}`}
                    </span>
                  </OptionTile>
                ))}
              </div>
              {/* Seats go to the roster in join order, so anyone past the count
                  is not dealt in — they watch this match rather than play it. */}
              {seats < humanCount && (
                <p className="text-[11px] text-amber-300">
                  {humanCount - seats} {humanCount - seats === 1 ? 'player sits' : 'players sit'} this one out.
                </p>
              )}
            </div>
          )}

          {/* ── AI Master ─────────────────────────────────────────────────── */}
          {mode === 'ai_master' && (
            <div className="space-y-3">
              <SectionHeading
                icon={<Sparkles className="w-4 h-4 text-partyYellow" />}
                title="WHO IS IN THIS ROOM?"
                hint={
                  isHost
                    ? 'The AI Master reads this to pick its tone and its games.'
                    : `${ROOM_VIBES[roomVibe].emoji} ${ROOM_VIBES[roomVibe].label} — set by the host.`
                }
              />
              {isHost && (
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                  {Object.values(ROOM_VIBES).map((vibe) => (
                    <OptionTile
                      key={vibe.id}
                      accent="pink"
                      selected={vibe.id === roomVibe}
                      onClick={() => onSelectVibe(vibe.id)}
                    >
                      <GameIcon src={vibeArt(vibe.id)} emoji={vibe.emoji} className="w-7 h-7 text-lg" />
                      <span className="font-extrabold text-xs block mt-0.5">{vibe.label}</span>
                      <span className="text-[10px] text-gray-400 block leading-tight">{vibe.blurb}</span>
                    </OptionTile>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Truth or Dare ─────────────────────────────────────────────── */}
          {mode === 'truth_or_dare' && !truthOrDareAllowed(room) && (
            // The whole sheet, not one greyed-out tile: nothing on it applies, and
            // showing categories and an idea box in a room where the match cannot
            // start would invite people to fill in a form that goes nowhere.
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 space-y-1.5">
              <p className="text-sm font-extrabold text-amber-200">Friends only</p>
              <p className="text-xs text-amber-100/90">{TRUTH_OR_DARE_BLOCKED_MESSAGE}</p>
            </div>
          )}

          {mode === 'truth_or_dare' && truthOrDareAllowed(room) && (
            <>
              {humanCount < 2 && (
                <p className="text-[11px] text-amber-300">
                  Needs at least 2 players — this room has {humanCount}.
                </p>
              )}

              <div className="space-y-3">
                <SectionHeading
                  icon={<Sparkles className="w-4 h-4 text-partyYellow" />}
                  title="PROMPTS FROM"
                  hint={isHost ? 'Where each truth and dare comes from.' : 'Set by the host.'}
                />
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(TRUTH_OR_DARE_PROMPT_SOURCES) as TruthOrDarePromptSource[]).map((source) => {
                    const info = TRUTH_OR_DARE_PROMPT_SOURCES[source];
                    return (
                      <OptionTile
                        key={source}
                        accent="yellow"
                        selected={truthOrDareSettings.promptSource === source}
                        disabled={!isHost}
                        onClick={() => onSetTruthOrDarePromptSource(source)}
                      >
                        <span className="text-lg block">{info.emoji}</span>
                        <span className="font-extrabold text-xs block mt-0.5">{info.label}</span>
                        <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{info.blurb}</span>
                      </OptionTile>
                    );
                  })}
                </div>
              </div>

              <TruthOrDareIdeas
                roomId={room.roomId}
                counts={room.truthOrDareIdeas ?? { truth: 0, dare: 0 }}
                promptSource={truthOrDareSettings.promptSource ?? 'both'}
              />

              <div className="space-y-3">
                <SectionHeading
                  icon={<Sparkles className="w-4 h-4 text-partyPink" />}
                  title="CATEGORIES"
                  hint={
                    !isHost
                      ? 'Set by the host.'
                      : truthOrDareSettings.promptSource === 'players'
                      ? 'For the built-in deck, which only steps in if the room runs out of its own ideas.'
                      : 'Pick what the built-in deck draws from. At least one stays on.'
                  }
                />
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
                  {TRUTH_OR_DARE_CATEGORIES.filter((c) => !c.spicy).map((category) => (
                    <OptionTile
                      key={category.id}
                      accent="pink"
                      selected={truthOrDareSettings.categories.includes(category.id)}
                      disabled={!isHost}
                      onClick={() => onToggleTruthOrDareCategory(category.id)}
                    >
                      <span className="font-extrabold text-xs block">
                        {category.emoji} {category.label}
                      </span>
                      <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{category.blurb}</span>
                    </OptionTile>
                  ))}
                </div>

                {/* Its own toggle rather than just another category — turning it
                    off by accident should not silently declaw the deck, so it
                    needs the deliberate second switch this puts on top. */}
                {TRUTH_OR_DARE_CATEGORIES.filter((c) => c.spicy).map((category) => {
                  const isOn = truthOrDareSettings.spicyEnabled && truthOrDareSettings.categories.includes(category.id);
                  return (
                    <OptionTile
                      key={category.id}
                      accent="pink"
                      selected={isOn}
                      disabled={!isHost}
                      onClick={() => {
                        onToggleTruthOrDareSpicy();
                        if (!truthOrDareSettings.categories.includes(category.id)) {
                          onToggleTruthOrDareCategory(category.id);
                        }
                      }}
                    >
                      <span className="font-extrabold text-xs block">
                        {category.emoji} {category.label} {isOn ? '— ON' : '— OFF'}
                      </span>
                      <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{category.blurb}</span>
                    </OptionTile>
                  );
                })}
              </div>

              <div className="space-y-3">
                <SectionHeading icon={<Dices className="w-4 h-4 text-partyCyan" />} title="SELECTION MECHANIC" />
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                  {(Object.keys(TRUTH_OR_DARE_SELECTION_LABELS) as TruthOrDareSelectionMode[]).map((selMode) => {
                    const info = TRUTH_OR_DARE_SELECTION_LABELS[selMode];
                    return (
                      <OptionTile
                        key={selMode}
                        selected={truthOrDareSettings.selectionModes.includes(selMode)}
                        disabled={!isHost}
                        onClick={() => onToggleTruthOrDareSelectionMode(selMode)}
                      >
                        <span className="font-extrabold text-xs block">
                          {info.emoji} {info.label}
                        </span>
                        <span className="text-[10px] text-gray-400 block leading-tight mt-0.5">{info.blurb}</span>
                      </OptionTile>
                    );
                  })}
                </div>
                {truthOrDareSettings.selectionModes.length > 1 && (
                  <p className="text-[10px] text-gray-500">Both on — rounds alternate between them.</p>
                )}
              </div>
            </>
          )}

          {/* ── Board & Team Battle: the qualifying rounds ─────────────────── */}
          {(mode === 'board' || mode === 'team_battle') && (
            <>
              {teamSetupStep && (
                <p className="text-[11px] text-partyCyan">
                  Launching switches the room into team mode so everyone can arrange sides. You start
                  the series from here again once the crews are set.
                </p>
              )}

              <div className="space-y-3">
                <SectionHeading
                  icon={<Globe className="w-4 h-4 text-partyCyan" />}
                  title="SPEED LANGUAGE DECKS"
                  hint="Multiple select — at least one stays on."
                />
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
                  {LANGUAGES.map((lang) => (
                    <OptionTile
                      key={lang.id}
                      selected={selectedLangs.includes(lang.id)}
                      onClick={() => onToggleLang(lang.id)}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-xl">{lang.flag}</span>
                        <span className="font-extrabold text-sm">{lang.name}</span>
                      </span>
                    </OptionTile>
                  ))}
                </div>
              </div>

              {/* Board game only. The board can run six of the ten games — the
                  other four need the whole room at once and belong to Team
                  Battle — so listing all ten let a host pick a rotation the
                  board would silently swap for Voice Arena. Team Battle drafts
                  its own series on the next screen and never reads this list. */}
              {mode === 'team_battle' ? (
                <p className="text-xs text-gray-400 px-1">
                  You pick the games for the series on the next screen.
                </p>
              ) : (
              <div className="space-y-3">
                <SectionHeading
                  icon={<Gamepad2 className="w-4 h-4 text-partyYellow" />}
                  title="QUALIFYING MINI-GAMES"
                  hint="Pick which games can come up in the turn rotation."
                />
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                  {MINI_GAMES.filter((game) => BOARD_MINI_GAMES.includes(game.id)).map((game) => (
                    <OptionTile
                      key={game.id}
                      accent="yellow"
                      selected={selectedGames.includes(game.id)}
                      onClick={() => onToggleMiniGame(game.id)}
                    >
                      <span className="text-xl block">{game.icon}</span>
                      <span className="font-extrabold text-sm block">{game.label}</span>
                      <span className="text-[10px] text-gray-400 block leading-tight">{game.blurb}</span>
                    </OptionTile>
                  ))}
                </div>
              </div>
              )}
            </>
          )}
        </div>

        {/* Launch */}
        <div className="p-5 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={launch}
            disabled={blocked}
            className={`w-full font-black text-sm sm:text-base py-3.5 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-2xl ${
              blocked
                ? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed'
                : 'bg-gradient-to-r from-partyYellow via-terracotta to-partyPink text-partyDark hover:scale-[1.02] active:scale-95 glow-yellow'
            }`}
          >
            {!blocked && <Play className="w-5 h-5 fill-current" />}
            <span>{launchLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
