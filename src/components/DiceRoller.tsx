'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DiceRollerProps {
  isRolling: boolean;
  value: number; // The final value to land on (2-12 for two dice)
  onRollComplete: () => void;
}

export default function DiceRoller({ isRolling, value, onRollComplete }: DiceRollerProps) {
  const [die1, setDie1] = useState(1);
  const [die2, setDie2] = useState(1);
  const [visible, setVisible] = useState(false);
  const completeRef = React.useRef(onRollComplete);

  useEffect(() => {
    completeRef.current = onRollComplete;
  }, [onRollComplete]);

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
      const timer = setTimeout(() => {
        setVisible(false);
        completeRef.current();
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [isRolling, value]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none perspective-[1200px]"
      >
        <div className="flex gap-16" style={{ perspective: '1200px' }}>
          <DieFace value={die1} isRolling={isRolling} index={0} />
          <DieFace value={die2} isRolling={isRolling} index={1} />
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
