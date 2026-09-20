'use client';

import { motion } from 'framer-motion';
import { Player } from '@/lib/types';
import AvatarIllustration from './AvatarIllustration';

interface TruthOrDareCardFlipProps {
  caller: Player | null;
  /** True once the flip has resolved and the caller's card is face up. */
  flipped: boolean;
  /** Changes once per flip, so the reveal replays instead of jumping straight to face-up. */
  flipKey: number;
}

/**
 * Turn-order card flip: the caller flips their own card and answers it
 * themselves, unlike the wheel which hands the challenge to someone else.
 */
export default function TruthOrDareCardFlip({ caller, flipped, flipKey }: TruthOrDareCardFlipProps) {
  return (
    <div className="w-36 h-52 sm:w-40 sm:h-56 mx-auto" style={{ perspective: 1000 }}>
      <motion.div
        key={flipKey}
        className="relative w-full h-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.7, ease: 'easeInOut' }}
      >
        <div
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-partyPurple via-slate-900 to-partyPink/40 border-2 border-partyYellow/40 flex items-center justify-center text-5xl shadow-xl"
          style={{ backfaceVisibility: 'hidden' }}
        >
          🃏
        </div>
        <div
          className="absolute inset-0 rounded-2xl bg-slate-900 border-2 border-partyCyan/50 flex flex-col items-center justify-center gap-2 shadow-xl"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          {caller && <AvatarIllustration avatar={caller.avatar} size="lg" />}
          <span className="text-xs font-black text-white">{caller?.name ?? '…'}</span>
        </div>
      </motion.div>
    </div>
  );
}
