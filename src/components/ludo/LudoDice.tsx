'use client';

import React, { useEffect, useRef, useState } from 'react';
import { audioSFX } from '@/lib/audioFeedback';

interface LudoDiceProps {
  value: number | null;
  isRolling: boolean;
  disabled: boolean;
  onRoll: () => void;
}

/** Pip layout per face, in a 3x3 grid: [col, row], 0-indexed. */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** How fast the face flickers while tumbling. */
const TUMBLE_MS = 70;

export default function LudoDice({ value, isRolling, disabled, onRoll }: LudoDiceProps) {
  // The face shown mid-roll. The old version applied `animate-spin`, which
  // rotates one unchanging face through 360 degrees — the die never appeared to
  // tumble, it just twirled the previous number and then snapped to the result.
  const [face, setFace] = useState(1);
  const [tilt, setTilt] = useState(0);
  const [justSettled, setJustSettled] = useState(false);
  const wasRolling = useRef(false);

  useEffect(() => {
    if (!isRolling) return;
    const timer = setInterval(() => {
      setFace(1 + Math.floor(Math.random() * 6));
      // A small random tilt each tick reads as a die knocking about, where a
      // constant rotation reads as a loading spinner.
      setTilt(-18 + Math.random() * 36);
    }, TUMBLE_MS);
    return () => clearInterval(timer);
  }, [isRolling]);

  // Settle: straighten up and pop once the real value lands.
  useEffect(() => {
    if (wasRolling.current && !isRolling) {
      setTilt(0);
      setJustSettled(true);
      const timer = setTimeout(() => setJustSettled(false), 420);
      return () => clearTimeout(timer);
    }
    wasRolling.current = isRolling;
  }, [isRolling]);

  const handleClick = () => {
    if (disabled || isRolling) return;
    audioSFX.playDiceRoll();
    onRoll();
  };

  const shown = isRolling ? face : value ?? 1;
  const pips = PIPS[shown] ?? PIPS[1];

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isRolling}
      aria-label={isRolling ? 'Rolling' : value ? `Rolled ${value}` : 'Roll the dice'}
      // Sized to sit in the middle of the board without swallowing the home
      // triangles around it, and lifted with a hard shadow so it reads as
      // resting on top of the board rather than printed into it.
      className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl p-1.5 select-none border-2 ${
        disabled
          ? 'opacity-30 cursor-not-allowed bg-slate-800 border-white/10 shadow-none'
          : 'cursor-pointer bg-gradient-to-br from-[#D8DCE3] to-[#A9B0BB] border-[#8C939F] shadow-[0_10px_22px_rgba(0,0,0,0.7)] hover:brightness-110 active:scale-95'
      }`}
      style={{
        transform: `rotate(${tilt}deg) scale(${isRolling ? 1.06 : justSettled ? 1.14 : 1})`,
        // Snappy while tumbling, springy on the settle.
        transition: isRolling ? `transform ${TUMBLE_MS}ms linear` : 'transform 380ms cubic-bezier(.2,1.5,.4,1)',
      }}
    >
      {/* Bone-coloured face with dark pips: a real die reads at a glance, and it
          sits better against the muted board than a neon amber slab. */}
      <div
        className="relative w-full h-full rounded-xl grid p-[12%]"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          backgroundColor: '#ECEFF3',
          boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.9), inset 0 -3px 6px rgba(0,0,0,0.18)',
        }}
      >
        {pips.map(([col, row], idx) => (
          <span
            key={idx}
            className="rounded-full place-self-center"
            style={{
              gridColumnStart: col + 1,
              gridRowStart: row + 1,
              width: '68%',
              height: '68%',
              backgroundColor: '#2B3240',
              boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.6)',
            }}
          />
        ))}
      </div>

      {/* A six is the roll that matters in Ludo — it releases a token and grants
          another turn — so it gets a moment of its own. */}
      {!isRolling && value === 6 && (
        <span className="absolute -top-2 -right-2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-900 shadow-lg animate-pulse">
          6!
        </span>
      )}
    </button>
  );
}
