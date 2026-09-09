'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/** One extra-steps chip that flies in after the dice land. */
export type RollBonus = {
  label: string;
  icon: string;
  steps: number;
  color: string;
};

interface DiceRollerProps {
  isRolling: boolean;
  /**
   * What the mini-game earned, shown on the two faces. Always 2-12, because it
   * comes from performanceToSteps — bonuses are NOT folded in here. Adding them
   * would push the total past 12, which two six-sided faces cannot show, and
   * the clamping that followed would quietly display the wrong number.
   */
  value: number;
  /** Extra steps on top of the faces, revealed one at a time after the roll. */
  bonuses?: RollBonus[];
  onRollComplete: () => void;
}

export default function DiceRoller({ isRolling, value, bonuses = [], onRollComplete }: DiceRollerProps) {
  const [die1, setDie1] = useState(1);
  const [die2, setDie2] = useState(1);
  const [visible, setVisible] = useState(false);
  const completeRef = React.useRef(onRollComplete);

  useEffect(() => {
    completeRef.current = onRollComplete;
  }, [onRollComplete]);

  // The array identity changes on every render; its length is what the timing
  // actually depends on.
  const bonusCount = bonuses.length;

  useEffect(() => {
    if (isRolling) {
      setVisible(true);

      // Calculate final faces at the start
      let d1 = Math.floor(Math.random() * 6) + 1;
      let d2 = value - d1;
      if (d2 < 1) {
        d2 = 1;
        d1 = value - 1;
      } else if (d2 > 6) {
        d2 = 6;
        d1 = value - 6;
      }

      setDie1(d1);
      setDie2(d2);

      // Wait 1.5s for rolling animation to finish, + 1.0s to view the result, then call onRollComplete
      // 2.5s was tuned for the faces alone; each bonus chip lands 0.35s after
      // the last and needs a beat to be read before the overlay clears.
      const timer = setTimeout(() => {
        setVisible(false);
        completeRef.current();
      }, 2500 + bonusCount * 400);

      return () => clearTimeout(timer);
    }
  }, [isRolling, value, bonusCount]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none perspective-[1200px]"
      >
        <div className="flex flex-col items-center gap-6">
          <div className="flex gap-16" style={{ perspective: '1200px' }}>
            <DieFace value={die1} isRolling={isRolling} index={0} />
            <DieFace value={die2} isRolling={isRolling} index={1} />
          </div>

          {/* Why the token is about to travel further than the faces say. The
              board hands out streak and catch-up steps, and a move that does not
              match the dice reads as a bug unless the extra is shown landing. */}
          {bonuses.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              {bonuses.map((bonus, i) => (
                <motion.div
                  key={bonus.label}
                  initial={{ opacity: 0, y: 16, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 1.3 + i * 0.35, type: 'spring', stiffness: 300, damping: 18 }}
                  className="px-4 py-1.5 rounded-full font-black text-sm border-2 shadow-xl backdrop-blur-md"
                  style={{ color: bonus.color, borderColor: bonus.color, backgroundColor: `${bonus.color}22` }}
                >
                  {bonus.icon} {bonus.label} +{bonus.steps}
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.3 + bonuses.length * 0.35, type: 'spring', stiffness: 260, damping: 16 }}
                className="mt-1 px-6 py-2 rounded-2xl bg-partyYellow text-partyDark font-black text-xl shadow-2xl"
              >
                {value + bonuses.reduce((sum, b) => sum + b.steps, 0)} STEPS
              </motion.div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

const DOTS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DieFace({ value, isRolling, index }: { value: number; isRolling: boolean; index: number }) {
  // To show 'value' facing the camera, we rotate the cube so that face is front.
  // 1 = Front, 2 = Right, 3 = Top, 4 = Bottom, 5 = Left, 6 = Back
  const faceRotations: Record<number, { x: number, y: number }> = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: -90 },
    3: { x: -90, y: 0 },
    4: { x: 90, y: 0 },
    5: { x: 0, y: 90 },
    6: { x: 0, y: 180 },
  };

  const finalRot = faceRotations[value];

  return (
    <motion.div
      animate={isRolling ? {
        rotateX: [0, 360 * 3 + finalRot.x],
        rotateY: [0, 360 * 3 + finalRot.y],
      } : {
        rotateX: finalRot.x, rotateY: finalRot.y
      }}
      transition={{ 
        duration: 1.2, 
        ease: [0.1, 0.9, 0.2, 1], // ease out cubic-like
        delay: index * 0.1 
      }}
      className="relative w-24 h-24"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <Face val={1} transform="translateZ(48px)" />
      <Face val={6} transform="rotateY(180deg) translateZ(48px)" />
      <Face val={2} transform="rotateY(90deg) translateZ(48px)" />
      <Face val={5} transform="rotateY(-90deg) translateZ(48px)" />
      <Face val={3} transform="rotateX(90deg) translateZ(48px)" />
      <Face val={4} transform="rotateX(-90deg) translateZ(48px)" />
    </motion.div>
  );
}

function Face({ val, transform }: { val: number; transform: string }) {
  const activeDots = DOTS[val] || [];
  return (
    <div 
      className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] border-2 border-indigo-400 p-2 grid grid-cols-3 grid-rows-3 gap-1"
      style={{ transform, backfaceVisibility: 'hidden' }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex items-center justify-center">
          {activeDots.includes(i) && (
            <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
          )}
        </div>
      ))}
    </div>
  );
}
