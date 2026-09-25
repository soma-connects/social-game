'use client';

import { motion } from 'framer-motion';
import { Player } from '@/lib/types';
import AvatarIllustration from './AvatarIllustration';

interface TruthOrDareWheelProps {
  players: Player[];
  callerId: string;
  /** Null until the spin has actually landed. */
  targetId: string | null;
  /** Changes once per spin, so the landing animation replays instead of jumping. */
  spinKey: number;
}

/**
 * The spin-the-bottle mechanic, drawn as a ring of avatars around a fixed
 * pointer.
 *
 * The server already knows who it landed on by the time this renders — the
 * spin itself is a client-side flourish, not a random draw, same idiom as the
 * board's dice animating to a total it did not choose. Letting the avatars
 * turn with the wheel rather than fighting to keep them upright reads as part
 * of the spin rather than a bug.
 */
export default function TruthOrDareWheel({ players, callerId, targetId, spinKey }: TruthOrDareWheelProps) {
  const n = Math.max(1, players.length);
  const sliceAngle = 360 / n;
  const targetIndex = targetId ? players.findIndex((p) => p.id === targetId) : -1;
  const settled = targetIndex >= 0;
  const targetAngle = settled ? targetIndex * sliceAngle : 0;
  const finalRotation = settled ? 4 * 360 - targetAngle : 0;

  return (
    <div className="relative w-52 h-52 sm:w-60 sm:h-60 mx-auto select-none">
      <div className="absolute inset-0 rounded-full border-4 border-partyYellow/40 bg-black/30 shadow-inner" />
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent border-b-partyYellow z-10 drop-shadow" />

      <motion.div
        key={spinKey}
        className="absolute inset-0 rounded-full"
        initial={{ rotate: 0 }}
        animate={settled ? { rotate: finalRotation } : { rotate: [0, 12, -10, 8, -6, 0] }}
        transition={
          settled
            ? { duration: 2.2, ease: [0.16, 1, 0.3, 1] }
            : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        {players.map((p, i) => {
          const angle = i * sliceAngle;
          const rad = (angle * Math.PI) / 180;
          const radius = 82;
          const x = Math.sin(rad) * radius;
          const y = -Math.cos(rad) * radius;
          const isCaller = p.id === callerId;
          return (
            <div
              key={p.id}
              className="absolute top-1/2 left-1/2"
              style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}
            >
              <div className={`rounded-full ${isCaller ? 'ring-2 ring-partyCyan' : ''}`}>
                <AvatarIllustration avatar={p.avatar} size="sm" />
              </div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
