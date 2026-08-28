'use client';

import React from 'react';
import { Check, Clock, Music2 } from 'lucide-react';
import { SONGBOOK, defaultSetlist, songSeconds } from '@/lib/karaoke/songbook';
import { KaraokeSetup } from '@/lib/karaoke/karaokeTypes';
import { Player } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';

interface KaraokeSetupPanelProps {
  value: KaraokeSetup;
  onChange: (next: KaraokeSetup) => void;
  singers: Player[];
  editable: boolean;
}

const DIFFICULTY_STYLE: Record<string, string> = {
  easy: 'bg-emerald-500/20 text-emerald-300',
  medium: 'bg-amber-500/20 text-amber-300',
  hard: 'bg-red-500/20 text-red-300',
};

export function defaultKaraokeSetup(): KaraokeSetup {
  return { setlist: defaultSetlist(3), order: 'rotate' };
}

export default function KaraokeSetupPanel({
  value,
  onChange,
  singers,
  editable,
}: KaraokeSetupPanelProps) {
  const toggle = (id: string) => {
    if (!editable) return;
    const chosen = value.setlist.includes(id)
      ? value.setlist.filter((s) => s !== id)
      : [...value.setlist, id];
    // A set with no songs in it has nothing to start.
    if (chosen.length === 0) return;
    audioSFX.playTap();
    onChange({ ...value, setlist: chosen });
  };

  const setOrder = (order: KaraokeSetup['order']) => {
    if (!editable) return;
    audioSFX.playTap();
    onChange({ ...value, order });
  };

  // Rough length of the whole set: every singer does every song, plus a
  // breather between turns for the score and the reactions.
  const singerCount = Math.max(1, singers.length);
  const singingSeconds = value.setlist.reduce((total, id) => {
    const song = SONGBOOK.find((s) => s.id === id);
    return total + (song ? songSeconds(song) + 18 : 0);
  }, 0);
  const totalMinutes = Math.max(1, Math.round((singingSeconds * singerCount) / 60));

  return (
    <div className="space-y-3 p-3 sm:p-4 rounded-2xl bg-fuchsia-950/20 border border-fuchsia-500/25 animate-fadeIn">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-extrabold text-xs sm:text-sm text-white">🎤 THE SETLIST</h4>
        <span className="text-[10px] font-black text-fuchsia-300/90 uppercase tracking-wide text-right flex items-center gap-1">
          <Clock className="w-3 h-3" />
          ~{totalMinutes} min · {singerCount} singer{singerCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-1.5 max-h-[280px] overflow-y-auto no-scrollbar pr-0.5">
        {SONGBOOK.map((song) => {
          const picked = value.setlist.includes(song.id);
          const order = value.setlist.indexOf(song.id) + 1;
          return (
            <button
              key={song.id}
              onClick={() => toggle(song.id)}
              disabled={!editable}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all ${
                picked
                  ? 'bg-fuchsia-500/15 border-fuchsia-400/50'
                  : 'bg-white/5 border-white/10 hover:border-white/25'
              } ${editable ? 'active:scale-[0.99]' : 'opacity-70 cursor-not-allowed'}`}
            >
              <span
                className={`w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[10px] font-black ${
                  picked ? 'bg-fuchsia-400 text-slate-950' : 'bg-white/10 text-slate-500'
                }`}
              >
                {picked ? order : <Music2 className="w-3 h-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-black text-white truncate">{song.title}</span>
                <span className="block text-[10px] text-slate-400 truncate leading-tight">
                  {song.blurb}
                </span>
              </span>
              <span
                className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${
                  DIFFICULTY_STYLE[song.difficulty]
                }`}
              >
                {song.difficulty}
              </span>
            </button>
          );
        })}
      </div>

      {/* Turn order. Genuinely changes how the room feels, so it is a choice
          rather than a hidden default. */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
          Turn order
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: 'rotate' as const, label: 'Round robin', blurb: 'Everyone sings song one, then song two' },
              { id: 'block' as const, label: 'Full set each', blurb: 'One singer does the whole list' },
            ]
          ).map((option) => (
            <button
              key={option.id}
              onClick={() => setOrder(option.id)}
              disabled={!editable}
              className={`px-2 py-2 rounded-xl border text-center transition-all ${
                value.order === option.id
                  ? 'bg-fuchsia-400 text-slate-950 border-fuchsia-300 shadow-lg'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/30'
              } ${editable ? 'active:scale-95' : 'opacity-60 cursor-not-allowed'}`}
            >
              <span className="block font-black text-xs">{option.label}</span>
              <span
                className={`block text-[9px] leading-tight mt-0.5 ${
                  value.order === option.id ? 'text-slate-800' : 'text-slate-500'
                }`}
              >
                {option.blurb}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
        <Check className="w-3 h-3 mt-0.5 shrink-0 text-emerald-400" />
        Every song is moved into your own vocal range before you sing it, so nobody
        gets handed somebody else&apos;s key.
      </p>

      {!editable && (
        <p className="text-[10px] text-slate-500 font-bold">Only the host can pick the set.</p>
      )}
    </div>
  );
}
