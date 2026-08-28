'use client';

import React from 'react';
import { Bot, User } from 'lucide-react';
import {
  BotDifficulty,
  ChessGameMode,
  ChessPieceColor,
  ChessSetup,
  ChessTimeControl,
} from '@/lib/chess/chessTypes';
import { Player } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';

interface ChessSetupPanelProps {
  value: ChessSetup;
  onChange: (next: ChessSetup) => void;
  humans: Player[];
  editable: boolean;
}

/**
 * `seats` is the whole board; `humanSeats` is how many of them people may take.
 *
 * The two differ only for Solo, and treating them as one number is what made
 * the panel tell a lone player that every seat had a person in it — the seat
 * the computer was about to occupy simply was not being counted.
 */
const MODES: { id: ChessGameMode; label: string; seats: number; humanSeats: number; blurb: string }[] = [
  { id: 'vs_ai', label: 'Solo', seats: 2, humanSeats: 1, blurb: 'You against the computer' },
  { id: '1v1', label: '1v1', seats: 2, humanSeats: 2, blurb: 'Two players, one board' },
  { id: '2v2', label: '2v2', seats: 4, humanSeats: 4, blurb: 'Pairs consult on every move' },
];

const CONTROLS: { id: ChessTimeControl; label: string }[] = [
  { id: 'bullet_1m', label: '1 min' },
  { id: 'blitz_3m', label: '3+2' },
  { id: 'blitz_5m', label: '5+3' },
  { id: 'rapid_10m', label: '10+5' },
  { id: 'casual', label: 'No clock' },
];

const SKILLS: { id: BotDifficulty; label: string }[] = [
  { id: 'cadet', label: 'Cadet' },
  { id: 'navigator', label: 'Navigator' },
  { id: 'commander', label: 'Commander' },
  { id: 'overlord', label: 'Overlord' },
];

export function defaultChessSetup(humanCount: number): ChessSetup {
  return {
    // Whatever the room can actually fill, so nobody has to think about it.
    mode: humanCount >= 4 ? '2v2' : humanCount >= 2 ? '1v1' : 'vs_ai',
    timeControl: 'blitz_5m',
    botDifficulty: 'navigator',
    humanColor: 'w',
  };
}

export default function ChessSetupPanel({ value, onChange, humans, editable }: ChessSetupPanelProps) {
  // Named to avoid shadowing the `mode` bound inside the button list below.
  const activeMode = MODES.find((m) => m.id === value.mode) ?? MODES[1];
  const seatedHumans = Math.min(humans.length, activeMode.humanSeats);
  const botSeats = Math.max(0, activeMode.seats - seatedHumans);

  const set = <K extends keyof ChessSetup>(key: K, next: ChessSetup[K]) => {
    if (!editable) return;
    audioSFX.playTap();
    onChange({ ...value, [key]: next });
  };

  return (
    <div className="space-y-3 p-3 sm:p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/25 animate-fadeIn">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-extrabold text-xs sm:text-sm text-white">♟️ CHESS TABLE</h4>
        <span className="text-[10px] font-black text-cyan-300/90 uppercase tracking-wide text-right">
          {seatedHumans} player{seatedHumans === 1 ? '' : 's'}
          {botSeats > 0 && ` · ${botSeats} computer${botSeats === 1 ? '' : 's'}`}
        </span>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Format</p>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => set('mode', mode.id)}
              disabled={!editable}
              className={`px-2 py-2 rounded-xl border text-center transition-all ${
                value.mode === mode.id
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-lg'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
              } ${editable ? 'active:scale-95' : 'opacity-60 cursor-not-allowed'}`}
            >
              <span className="block font-black text-xs">{mode.label}</span>
              <span
                className={`block text-[9px] leading-tight mt-0.5 ${
                  value.mode === mode.id ? 'text-slate-800' : 'text-slate-500'
                }`}
              >
                {mode.blurb}
              </span>
            </button>
          ))}
        </div>
        {/* Empty chairs are the thing that used to break this game: starting a
            1v1 on your own produced an opponent nobody controlled and a board
            that could never move again. */}
        {botSeats > 0 && (
          <p className="text-[10px] text-cyan-300/90 mt-1.5 font-bold flex items-center gap-1.5">
            <Bot className="w-3 h-3" />
            {botSeats} empty seat{botSeats === 1 ? '' : 's'} — the computer takes{' '}
            {botSeats === 1 ? 'it' : 'them'}.
          </p>
        )}
        {botSeats === 0 && (
          <p className="text-[10px] text-emerald-300/80 mt-1.5 font-bold flex items-center gap-1.5">
            <User className="w-3 h-3" /> Every seat has a person in it.
          </p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Clock</p>
        <div className="grid grid-cols-5 gap-1.5">
          {CONTROLS.map((control) => (
            <button
              key={control.id}
              onClick={() => set('timeControl', control.id)}
              disabled={!editable}
              className={`py-2 rounded-lg border font-black text-[11px] transition-all ${
                value.timeControl === control.id
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
              } ${editable ? 'active:scale-95' : 'opacity-60 cursor-not-allowed'}`}
            >
              {control.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
          Your side
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['w', 'b'] as ChessPieceColor[]).map((color) => (
            <button
              key={color}
              onClick={() => set('humanColor', color)}
              disabled={!editable}
              className={`py-2 rounded-xl border font-black text-xs transition-all ${
                value.humanColor === color
                  ? 'bg-white text-slate-950 border-white shadow-lg'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
              } ${editable ? 'active:scale-95' : 'opacity-60 cursor-not-allowed'}`}
            >
              {color === 'w' ? '♔ White (moves first)' : '♚ Black'}
            </button>
          ))}
        </div>
      </div>

      {botSeats > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
            Computer strength
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {SKILLS.map((skill) => (
              <button
                key={skill.id}
                onClick={() => set('botDifficulty', skill.id)}
                disabled={!editable}
                className={`py-2 rounded-lg border font-black text-[10px] transition-all ${
                  value.botDifficulty === skill.id
                    ? 'bg-sky-400 text-slate-950 border-sky-300 shadow-lg'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
                } ${editable ? 'active:scale-95' : 'opacity-60 cursor-not-allowed'}`}
              >
                {skill.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!editable && (
        <p className="text-[10px] text-slate-500 font-bold">Only the host can change the table.</p>
      )}
    </div>
  );
}
