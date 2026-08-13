'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TileEventOverlayProps {
  banner: string | null;
  message: string | null;
  onComplete: () => void;
}

export default function TileEventOverlay({ banner, message, onComplete }: TileEventOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (banner && message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        // We let the exit animation play out before firing onComplete
        setTimeout(onComplete, 500);
      }, 3500); // Overlay stays up for 3.5 seconds
      return () => clearTimeout(timer);
    }
  }, [banner, message, onComplete]);

  if (!banner || !message) return null;

  // Deduce event type from the banner icon/text
  let eventType = 'neutral';
  let icon = '🎁';
  let colorFrom = 'from-blue-600';
  let colorTo = 'to-purple-600';

  if (banner.includes('WORMHOLE')) {
    eventType = 'wormhole';
    icon = '🌌';
    colorFrom = 'from-fuchsia-600';
    colorTo = 'to-indigo-600';
  } else if (banner.includes('ASTEROID STRIKE')) {
    eventType = 'asteroid';
    icon = '☄️';
    colorFrom = 'from-red-600';
    colorTo = 'to-orange-600';
  } else if (banner.includes('DEFLECTED')) {
    eventType = 'shield_hit';
    icon = '🛡️';
    colorFrom = 'from-emerald-500';
    colorTo = 'to-cyan-600';
  } else if (banner.includes('SPACE STATION')) {
    eventType = 'shield_gain';
    icon = '🛰️';
    colorFrom = 'from-blue-500';
    colorTo = 'to-cyan-400';
  } else if (banner.includes('MYSTERY')) {
    icon = banner.includes('GOOD') ? '🎁' : '💀';
    colorFrom = banner.includes('GOOD') ? 'from-yellow-400' : 'from-gray-700';
    colorTo = banner.includes('GOOD') ? 'to-orange-500' : 'to-gray-900';
  } else if (banner.includes('FINISH')) {
    icon = '🏆';
    colorFrom = 'from-yellow-300';
    colorTo = 'to-yellow-600';
  }

  // Strip the emoji from the banner text for cleaner display
  const cleanBanner = banner.replace(/^[^\w\s]+\s*/, '');

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0.5, y: 100, rotateX: 45 }}
            animate={{ scale: 1, y: 0, rotateX: 0 }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className={`relative flex flex-col items-center justify-center p-8 rounded-3xl bg-gradient-to-br ${colorFrom} ${colorTo} shadow-[0_0_80px_rgba(0,0,0,0.5)] border border-white/20 max-w-md text-center overflow-hidden`}
          >
            {/* Ambient Background Glow in Card */}
            <div className="absolute inset-0 bg-black/20" />
            
            <motion.div
              animate={{ 
                rotate: eventType === 'asteroid' ? [0, 360] : eventType === 'wormhole' ? [0, -360] : 0,
                scale: eventType === 'shield_hit' ? [1, 1.5, 1] : 1
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="text-8xl mb-6 filter drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] relative z-10"
            >
              {icon}
            </motion.div>

            <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-3 relative z-10 drop-shadow-md">
              {cleanBanner}
            </h2>
            
            <p className="text-white/90 text-sm sm:text-base font-medium relative z-10">
              {message}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
