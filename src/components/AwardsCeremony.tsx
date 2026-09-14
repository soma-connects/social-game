'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Award } from '@/lib/gameRules';
import type { Player } from '@/lib/types';
import AvatarIllustration from './AvatarIllustration';

/**
 * The closing awards, revealed one at a time.
 *
 * A match already knows who was funniest, who choked and who clawed their way
 * back, and until now it threw all of it away and printed a single winner. The
 * argument this starts is the reason people play a party game to the end, so it
 * is worth more than the scoreboard it replaces.
 *
 * Revealed on a stagger rather than all at once: six cards appearing together
 * is a table, and nobody reads a table out loud.
 */
export default function AwardsCeremony({
  awards,
  players,
}: {
  awards: Award[];
  players: Player[];
}) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (revealed >= awards.length) return;
    const timer = setTimeout(() => setRevealed((n) => n + 1), revealed === 0 ? 400 : 900);
    return () => clearTimeout(timer);
  }, [revealed, awards.length]);

  if (awards.length === 0) return null;

  const byId = new Map(players.map((player) => [player.id, player]));
  const allShown = revealed >= awards.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-3">
        <h3 className="text-sm font-black text-white/80 tracking-widest uppercase">Night&apos;s Honours</h3>
        {!allShown && (
          <button
            onClick={() => setRevealed(awards.length)}
            className="text-[10px] font-black text-gray-400 hover:text-white border border-white/20 rounded-full px-2 py-0.5 transition-colors"
          >
            SKIP
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {awards.slice(0, revealed).map((award) => {
          const player = byId.get(award.playerId);
          return (
            <motion.div
              key={award.id}
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="flex items-center gap-3 rounded-2xl p-3 border-2 text-left backdrop-blur-md"
              style={{ borderColor: `${award.color}66`, backgroundColor: `${award.color}14` }}
            >
              <div className="text-2xl shrink-0" aria-hidden>
                {award.icon}
              </div>

              {player && (
                <div className="shrink-0">
                  <AvatarIllustration avatar={player.avatar} size="sm" />
                </div>
              )}

              <div className="min-w-0">
                <p className="text-[10px] font-black tracking-wider uppercase" style={{ color: award.color }}>
                  {award.title}
                </p>
                <p className="text-sm font-black text-white truncate">{award.playerName}</p>
                <p className="text-[11px] text-gray-300 truncate">{award.detail}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
