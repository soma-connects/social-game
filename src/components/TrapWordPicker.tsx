'use client';

import React, { useState } from 'react';
import { ShieldAlert, Zap, X, Check, Flame } from 'lucide-react';
import { roomStore } from '@/lib/roomStore';
import { Player } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';
import { PRESET_TRAPS } from '@/lib/gameContent';

interface TrapWordPickerProps {
  roomId: string;
  /** Whose deck the trap gets injected into. */
  activePlayer: Player;
  /** The player setting the trap — recorded as the author. */
  myPlayer: Player;
  onClose: () => void;
}

export default function TrapWordPicker({ roomId, activePlayer, myPlayer, onClose }: TrapWordPickerProps) {
  const [trapText, setTrapText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitTrap = async (wordToSubmit: string) => {
    const word = wordToSubmit.trim();
    if (!word) return;

    setError(null);
    const result = await roomStore.addTrapWord(roomId, word, myPlayer.id, myPlayer.name);
    if (result.error) {
      setError(result.error);
      return;
    }

    audioSFX.playNollywoodBrass();
    setSubmitted(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="glass-card max-w-lg w-full rounded-3xl p-6 border border-partyPink/60 relative space-y-6 shadow-2xl glow-pink">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-full glass-pill"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-partyPink/20 text-partyPink border border-partyPink/40 flex items-center justify-center text-2xl">
            ⚡
          </div>
          <div>
            <span className="text-[10px] text-partyYellow font-black uppercase tracking-wider block">OPPONENT VIEW</span>
            <h3 className="font-extrabold text-2xl text-white">THE TRAP ROOM</h3>
            <p className="text-xs text-partyYellow font-medium">Inject a trick word into {activePlayer.name}&apos;s upcoming deck!</p>
          </div>
        </div>

        {submitted ? (
          <div className="p-6 rounded-2xl bg-emerald-500/20 border border-emerald-500 text-center space-y-2">
            <Check className="w-10 h-10 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="font-bold text-white text-lg">TRAP INJECTED SUCCESS!</h4>
            <p className="text-xs text-gray-300">Whaala for {activePlayer.name}! They must attempt your trap word under pressure!</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Custom Trap Pad Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitTrap(trapText);
              }}
              className="space-y-3"
            >
              <label className="text-xs font-bold text-gray-300 block">
                CUSTOM TRAP PAD (TYPE TONGUE-TWISTER OR TRICK WORD):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 'Ogbomoso Agbada Otilo'"
                  value={trapText}
                  onChange={(e) => setTrapText(e.target.value)}
                  maxLength={45}
                  className="flex-1 bg-partyDark/90 border border-white/20 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-partyPink font-mono"
                />
                <button
                  type="submit"
                  disabled={!trapText.trim()}
                  className="bg-partyPink hover:bg-pink-600 disabled:opacity-50 text-white font-black text-xs px-5 py-3 rounded-2xl transition-all shadow-md flex items-center gap-1"
                >
                  <Zap className="w-4 h-4 fill-current" />
                  <span>SET</span>
                </button>
              </div>
              {error && <p className="text-xs text-red-300">{error}</p>}
            </form>

            {/* Fast Selection Buttons */}
            <div className="space-y-2">
              <span className="text-xs font-extrabold text-partyYellow flex items-center gap-1">
                <Flame className="w-4 h-4 text-terracotta" /> FAST PRESET TRAPS (TAP FOR INSTANT SELECTION):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_TRAPS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSubmitTrap(preset.word)}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-partyPurple/40 border border-white/10 hover:border-partyCyan text-left transition-all flex items-center justify-between text-xs text-gray-200"
                  >
                    <div>
                      <span className="font-bold block text-white">{preset.label}</span>
                      <span className="text-[10px] text-partyCyan font-mono">&quot;{preset.word}&quot;</span>
                    </div>
                    <Zap className="w-3.5 h-3.5 text-partyYellow shrink-0 ml-1" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
