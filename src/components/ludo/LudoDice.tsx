'use client';

import React, { useEffect, useRef, useState } from 'react';
import { audioSFX } from '@/lib/audioFeedback';

interface LudoDiceProps {
  value: number | null;
  isRolling: boolean;
  disabled: boolean;
  onRoll: () => void;
  /** It is this player's turn to roll — draws attention to the die. */
  ready?: boolean;
  /** Edge length of the cube, in px. */
  size?: number;
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

/** Where each face sits on the cube. Opposite faces sum to seven, as on a real die. */
const FACE_PLACEMENT: Record<number, string> = {
  1: 'rotateY(0deg)',
  6: 'rotateY(180deg)',
  2: 'rotateY(90deg)',
  5: 'rotateY(-90deg)',
  3: 'rotateX(90deg)',
  4: 'rotateX(-90deg)',
};

/** The cube rotation, in degrees, that turns each face to the viewer: [x, y]. */
const FACE_ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  2: [0, -90],
  5: [0, 90],
  3: [-90, 0],
  4: [90, 0],
};

/** Time between random kicks while the die is in the air. */
const TUMBLE_MS = 200;
const SETTLE_MS = 750;

/** The smallest angle at or above `from + turn` that shows the same face as `face`. */
function forwardTo(from: number, face: number, turn = 360): number {
  return face + 360 * Math.ceil((from + turn - face) / 360);
}

/**
 * A single six-sided die that actually tumbles.
 *
 * The first version was a flat square: it flickered through faces and tilted,
 * which reads as a slot machine rather than a die. This is a real cube, spun on
 * two axes while it is rolling and settled onto the face that was rolled, so the
 * number it lands on is the number everyone reads.
 */
export default function LudoDice({ value, isRolling, disabled, onRoll, ready = false, size = 76 }: LudoDiceProps) {
  const shown = value && value >= 1 && value <= 6 ? value : 1;
  const [rot, setRot] = useState<[number, number]>(() => [...FACE_ROTATION[shown]] as [number, number]);
  const [motion, setMotion] = useState<'still' | 'tumble' | 'settle'>('still');
  const mounted = useRef(false);

  // In the air: throw it a full turn or more on both axes, fast and linear.
  useEffect(() => {
    if (!isRolling) return;
    setMotion('tumble');
    const kick = () =>
      setRot(([x, y]) => [x + 360 + Math.floor(Math.random() * 200), y + 360 + Math.floor(Math.random() * 200)]);
    kick();
    const timer = setInterval(kick, TUMBLE_MS);
    return () => clearInterval(timer);
  }, [isRolling]);

  // On the table: turn forward onto the face that was rolled. Not on first paint,
  // so a die that mounts already showing a number does not perform for nobody.
  useEffect(() => {
    if (isRolling) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const [fx, fy] = FACE_ROTATION[shown];
    setMotion('settle');
    setRot(([x, y]) => [forwardTo(x, fx), forwardTo(y, fy)]);
  }, [shown, isRolling]);

  const half = size / 2;
  const handleClick = () => {
    if (disabled || isRolling) return;
    audioSFX.playDiceRoll();
    onRoll();
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isRolling}
      aria-label={isRolling ? 'Rolling' : value ? `Rolled ${value}` : 'Roll the dice'}
      className={`relative select-none rounded-2xl transition-all ${
        disabled && !isRolling ? 'cursor-default opacity-60' : 'cursor-pointer active:scale-95'
      } ${ready && !disabled ? 'animate-pulse' : ''}`}
      style={{ width: size, height: size, perspective: size * 6 }}
    >
      {ready && !disabled && (
        <span className="absolute -inset-2 rounded-3xl border-2 border-amber-300/80 shadow-[0_0_18px_rgba(252,211,77,0.6)] pointer-events-none" />
      )}
      <span
        className="absolute inset-0 block"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rot[0]}deg) rotateY(${rot[1]}deg)`,
          transition:
            motion === 'tumble'
              ? `transform ${TUMBLE_MS}ms linear`
              : motion === 'settle'
              ? `transform ${SETTLE_MS}ms cubic-bezier(.15,.85,.25,1)`
              : 'none',
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <span
            key={face}
            className="absolute inset-0 grid rounded-xl"
            style={{
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(3, 1fr)',
              padding: size * 0.13,
              transform: `${FACE_PLACEMENT[face]} translateZ(${half}px)`,
              backfaceVisibility: 'hidden',
              background: 'linear-gradient(145deg, #FBFAF6 0%, #E9E5DA 100%)',
              boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.10), inset 0 -4px 8px rgba(0,0,0,0.12)',
            }}
          >
            {PIPS[face].map(([col, row], idx) => (
              <span
                key={idx}
                className="rounded-full place-self-center"
                style={{
                  gridColumnStart: col + 1,
                  gridRowStart: row + 1,
                  width: '72%',
                  height: '72%',
                  // The one is red, as on a real die; the rest are ink.
                  backgroundColor: face === 1 ? '#D6342C' : '#20242E',
                  boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.55)',
                }}
              />
            ))}
          </span>
        ))}
      </span>
    </button>
  );
}
