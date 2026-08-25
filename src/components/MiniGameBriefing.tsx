'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Play, Target, ListOrdered, Trophy, Lightbulb, X } from 'lucide-react';
import { MiniGameId } from '@/lib/types';
import { MINIGAME_ICONS, MINIGAME_LABELS } from '@/lib/gameRules';
import { MINIGAME_BRIEFINGS } from '@/lib/miniGameBriefings';

/** Games a player has already been briefed on, across every room they join. */
const SEEN_KEY = 'voice_party_seen_briefings';
/** Set once a player opts out entirely. */
const SKIP_KEY = 'voice_party_skip_briefings';

function readSeen(): Set<MiniGameId> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as MiniGameId[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Decides whether to brief a player on the game in front of them.
 *
 * Stored per browser rather than in room state: whether you have had a game
 * explained is a fact about you, not about the room, and it should hold the
 * next time you play with different people.
 */
export function useMiniGameBriefing(game: MiniGameId | null | undefined, enabled: boolean) {
  const [showing, setShowing] = useState<MiniGameId | null>(null);
  // Read after mount, never during render — localStorage does not exist during
  // SSR and reading it in render would desync the first paint.
  const [seen, setSeen] = useState<Set<MiniGameId>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSeen(readSeen());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !enabled || !game) return;
    if (typeof window !== 'undefined' && localStorage.getItem(SKIP_KEY) === '1') return;
    if (seen.has(game)) return;
    setShowing(game);
  }, [ready, enabled, game, seen]);

  const dismiss = useCallback(
    (options: { skipAll?: boolean } = {}) => {
      const current = showing;
      setShowing(null);
      if (!current) return;

      setSeen((prev) => {
        const next = new Set(prev).add(current);
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
          if (options.skipAll) localStorage.setItem(SKIP_KEY, '1');
        } catch {
          /* private mode — the briefing simply shows again next time */
        }
        return next;
      });
    },
    [showing]
  );

  /** Lets a player pull the rules back up mid-game. */
  const open = useCallback((id: MiniGameId) => setShowing(id), []);

  return { showing, dismiss, open };
}

interface MiniGameBriefingProps {
  game: MiniGameId;
  /** Shown when re-opened deliberately rather than on first encounter. */
  isReview?: boolean;
  onDismiss: (options?: { skipAll?: boolean }) => void;
}

export default function MiniGameBriefing({ game, isReview = false, onDismiss }: MiniGameBriefingProps) {
  const brief = MINIGAME_BRIEFINGS[game];
  if (!brief) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[95] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      >
        <motion.div
          initial={{ scale: 0.92, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 260 }}
          className="glass-card w-full max-w-md rounded-3xl border border-partyYellow/50 bg-slate-900/95 shadow-2xl my-auto"
        >
          {/* Header. Sizes are deliberately tight: at the original padding the
              card measured 658px and pushed the primary button to y=686 on a
              667px-tall phone, so the one thing a player must tap started off
              the bottom of the screen. */}
          <div className="relative text-center px-5 pt-4 pb-3 border-b border-white/10">
            {isReview && (
              <button
                onClick={() => onDismiss()}
                aria-label="Close"
                className="absolute top-3 right-3 p-1.5 rounded-lg border border-white/15 text-gray-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <div className="text-4xl mb-1">{MINIGAME_ICONS[game]}</div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-partyYellow">
              {isReview ? 'How this works' : 'New game'}
            </p>
            <h2 className="text-2xl font-black text-white uppercase tracking-wide">
              {MINIGAME_LABELS[game]}
            </h2>
          </div>

          <div className="px-5 py-4 space-y-3.5">
            {/* The goal gets the most weight — it is the one thing a player
                must leave with if they read nothing else. */}
            <div className="flex gap-3">
              <Target className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1">Goal</p>
                <p className="text-sm text-white font-bold leading-snug">{brief.goal}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <ListOrdered className="w-5 h-5 text-partyCyan shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-partyCyan mb-1.5">How</p>
                <ol className="space-y-1.5">
                  {brief.steps.map((step, i) => (
                    <li key={i} className="text-sm text-gray-200 leading-snug flex gap-2">
                      <span className="font-mono font-black text-partyCyan/70 shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex gap-3">
              <Trophy className="w-5 h-5 text-partyYellow shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-partyYellow mb-1">Scoring</p>
                <p className="text-sm text-gray-200 leading-snug">{brief.scoring}</p>
              </div>
            </div>

            {brief.tip && (
              <div className="flex gap-3 rounded-2xl bg-white/5 border border-white/10 p-3">
                <Lightbulb className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-100 leading-snug">{brief.tip}</p>
              </div>
            )}

            {brief.usesMic && (
              <p className="flex items-center gap-2 text-[11px] font-bold text-gray-400">
                <Mic className="w-3.5 h-3.5 text-emerald-400" />
                Uses your microphone — allow it when your browser asks.
              </p>
            )}
          </div>

          <div className="px-5 pb-4 space-y-1.5">
            <button
              onClick={() => onDismiss()}
              className="w-full bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-base py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Play className="w-5 h-5 fill-current" />
              {isReview ? 'BACK TO THE GAME' : "GOT IT — LET'S GO"}
            </button>

            {/* A group on their third session does not want this every time. */}
            {!isReview && (
              <button
                onClick={() => onDismiss({ skipAll: true })}
                className="w-full text-[11px] font-bold text-gray-500 hover:text-gray-300 py-1.5 transition"
              >
                Skip briefings from now on
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
