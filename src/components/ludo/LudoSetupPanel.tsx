'use client';

import React from 'react';
import { Bot, User } from 'lucide-react';
import { LudoBotSkill, LudoSetup } from '@/lib/ludo/ludoTypes';
import { seatingFor } from '@/lib/ludo/ludoRules';
import { Player } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';

interface LudoSetupPanelProps {
  value: LudoSetup;
  onChange: (next: LudoSetup) => void;
  /** People in the room, in join order — they fill the human seats top down. */
  humans: Player[];
  /** Only the host can change the line-up; everyone else reads it. */
  editable: boolean;
}

const SEAT_COUNTS = [2, 3, 4];

const SKILLS: { id: LudoBotSkill; label: string; blurb: string }[] = [
  { id: 'easy', label: 'Rookie', blurb: 'Wanders into trouble' },
  { id: 'normal', label: 'Sharp', blurb: 'Takes every capture' },
  { id: 'hard', label: 'Ruthless', blurb: 'Watches its back too' },
];

const DOT: Record<string, string> = {
  red: 'bg-[#A8443F]',
  green: 'bg-[#3B7F5E]',
  yellow: 'bg-[#B08B3E]',
  blue: 'bg-[#3F6E96]',
};

/**
 * Builds the default line-up for a given number of seats.
 *
 * People first, computers for whatever is left over. That is the answer the
 * host wants nine times out of ten, so it is what they get before touching
 * anything — the per-seat toggles are there for the tenth.
 */
export function defaultLudoSetup(humanCount: number, seatCount = 4, botSkill: LudoBotSkill = 'normal'): LudoSetup {
  const seats = seatingFor(seatCount).length;
  return {
    seatCount: seats,
    seatKinds: Array.from({ length: seats }, (_, i) => (i < humanCount ? 'human' : 'ai')),
    botSkill,
  };
}

export default function LudoSetupPanel({ value, onChange, humans, editable }: LudoSetupPanelProps) {
  const colors = seatingFor(value.seatCount);

  const setSeatCount = (seatCount: number) => {
    if (!editable) return;
    audioSFX.playTap();
    const seats = seatingFor(seatCount).length;
    const kinds = Array.from({ length: seats }, (_, i) => value.seatKinds[i] ?? 'ai');
    onChange({ ...value, seatCount: seats, seatKinds: kinds });
  };

  const toggleSeat = (index: number) => {
    if (!editable) return;
    const kinds = [...value.seatKinds];
    kinds[index] = kinds[index] === 'ai' ? 'human' : 'ai';

    // Somebody has to be playing. Turning the last human chair over to the
    // computer would start a match nobody in the room could take a turn in.
    if (kinds.every((k) => k === 'ai')) return;

    audioSFX.playTap();
    onChange({ ...value, seatKinds: kinds });
  };

  const setSkill = (botSkill: LudoBotSkill) => {
    if (!editable) return;
    audioSFX.playTap();
    onChange({ ...value, botSkill });
  };

  // Who actually ends up where. A chair marked for a person with nobody left
  // to fill it becomes a computer at kickoff, and the host should see that
  // here rather than discover it on the board.
  let nextHuman = 0;
  const seats = colors.map((color, i) => {
    const wantsHuman = value.seatKinds[i] !== 'ai';
    const person = wantsHuman ? humans[nextHuman] : undefined;
    if (person) nextHuman++;
    return { color, wantsHuman, person };
  });

  const botCount = seats.filter((s) => !s.person).length;
  const seatedHumans = seats.length - botCount;
  const spillover = seats.filter((s) => s.wantsHuman && !s.person).length;

  return (
    <div className="space-y-3 p-3 sm:p-4 rounded-2xl bg-amber-950/20 border border-amber-500/25 animate-fadeIn">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-extrabold text-xs sm:text-sm text-white">🎲 LUDO TABLE</h4>
        <span className="text-[10px] font-black text-amber-300/90 uppercase tracking-wide text-right">
          {seatedHumans} player{seatedHumans === 1 ? '' : 's'}
          {botCount > 0 && ` · ${botCount} computer${botCount === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Seat count */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
          How many seats?
        </p>
        <div className="grid grid-cols-3 gap-2">
          {SEAT_COUNTS.map((count) => (
            <button
              key={count}
              onClick={() => setSeatCount(count)}
              disabled={!editable}
              className={`py-2 rounded-xl border font-black text-sm transition-all ${
                value.seatCount === count
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
              } ${editable ? 'active:scale-95' : 'opacity-60 cursor-not-allowed'}`}
            >
              {count}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Two players sit opposite each other, so it is a race rather than a scrap.
        </p>
      </div>

      {/* Per-seat assignment */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
          Who sits where?
        </p>
        <div className="space-y-1.5">
          {seats.map((seat, i) => (
            <button
              key={seat.color}
              onClick={() => toggleSeat(i)}
              disabled={!editable}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all ${
                seat.person
                  ? 'bg-emerald-500/10 border-emerald-400/40'
                  : 'bg-sky-500/10 border-sky-400/40'
              } ${editable ? 'active:scale-[0.99] hover:brightness-125' : 'opacity-70 cursor-not-allowed'}`}
            >
              <span className={`w-3 h-3 rounded-full shrink-0 ${DOT[seat.color]}`} />
              {seat.person ? (
                <User className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              ) : (
                <Bot className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              )}
              <span className="flex-1 min-w-0 text-xs font-black text-white truncate">
                {seat.person?.name ?? `Computer (${SKILLS.find((s) => s.id === value.botSkill)?.label})`}
              </span>
              {seat.wantsHuman && !seat.person && (
                <span className="text-[9px] font-black text-amber-300 shrink-0">NOBODY YET</span>
              )}
              {editable && (
                <span className="text-[9px] font-black text-slate-400 shrink-0">TAP TO SWAP</span>
              )}
            </button>
          ))}
        </div>
        {spillover > 0 && (
          <p className="text-[10px] text-amber-300/90 mt-1.5 font-bold">
            {spillover} seat{spillover === 1 ? '' : 's'} still empty — the computer takes{' '}
            {spillover === 1 ? 'it' : 'them'} when the match starts.
          </p>
        )}
      </div>

      {/* Bot difficulty — only worth showing if a computer is actually playing */}
      {botCount > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
            Computer strength
          </p>
          <div className="grid grid-cols-3 gap-2">
            {SKILLS.map((skill) => (
              <button
                key={skill.id}
                onClick={() => setSkill(skill.id)}
                disabled={!editable}
                className={`px-2 py-2 rounded-xl border text-center transition-all ${
                  value.botSkill === skill.id
                    ? 'bg-sky-400 text-slate-950 border-sky-300 shadow-lg'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
                } ${editable ? 'active:scale-95' : 'opacity-60 cursor-not-allowed'}`}
              >
                <span className="block font-black text-xs">{skill.label}</span>
                <span
                  className={`block text-[9px] leading-tight mt-0.5 ${
                    value.botSkill === skill.id ? 'text-slate-800' : 'text-slate-500'
                  }`}
                >
                  {skill.blurb}
                </span>
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
