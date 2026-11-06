'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';

/** Set once a player has been through the walkthrough (or skipped it) in this browser. */
const SEEN_KEY = 'voice_party_how_it_works_seen_v1';

type Card = { emoji: string; kicker: string; title: string; body: string; points?: string[] };

/**
 * The whole game in five cards.
 *
 * Playtest: people on the call did not know how to join the voice call, who
 * starts the game, or what to press. The rules were only ever explained one
 * mini-game at a time, after it had already started. This is the overview a
 * first-timer needs before any of that, in the words of the buttons they will
 * actually see.
 */
const CARDS: Card[] = [
  {
    emoji: '🎤',
    kicker: 'Welcome',
    title: "It's a voice party game",
    body: 'You play by talking. On your turn you get a quick challenge, and your phone’s mic is the judge.',
    points: ['Say a tricky word fast', 'Answer trivia out loud', 'Hum to fly a bird, shout to blast asteroids'],
  },
  {
    emoji: '📞',
    kicker: 'Step 1',
    title: 'Get on the call',
    body: 'Inside a room, tap the green JOIN CALL button at the top so everyone can hear each other.',
    points: ['Allow the microphone when your browser asks', 'Tap CHECK MY MIC and say hello: the bar should jump'],
  },
  {
    emoji: '👑',
    kicker: 'Step 2',
    title: 'The host starts the game',
    body: 'Whoever made the room is the host. They send the WhatsApp link, pick a game and press LAUNCH.',
    points: ['Everyone else just waits in the lounge', 'Your screen changes by itself when it starts'],
  },
  {
    emoji: '🎲',
    kicker: 'Step 3',
    title: 'How a round goes',
    body: 'In the Board Game every round has three parts:',
    points: [
      'Everyone plays a mini-game, one at a time',
      'Everyone spends their coins in the shop, then taps DONE',
      'Everyone rolls: the better you did, the further you move. First to the finish wins',
    ],
  },
  {
    emoji: '👀',
    kicker: 'Good to know',
    title: 'Not your turn?',
    body: 'Watch and listen on the call. Before each new mini-game you get a short “How to play” card.',
    points: [
      'Joined late? You watch until the next round, then you are in',
      'Lost? Tap the ? button any time to see these cards again',
    ],
  },
];

/**
 * Opens the walkthrough on a player's first visit, and on demand after that.
 *
 * `autoOpen` lets the caller hold it back until the moment is right — not over
 * a join form, not on top of a mini-game in progress.
 */
export function useHowItWorks(autoOpen: boolean) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked || !autoOpen) return;
    setChecked(true);
    try {
      if (localStorage.getItem(SEEN_KEY) !== '1') setOpen(true);
    } catch {
      /* storage blocked: never auto-open rather than open every visit */
    }
  }, [autoOpen, checked]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode: it may show again next visit */
    }
  }, []);

  const show = useCallback(() => setOpen(true), []);

  /**
   * False only in the moment between being allowed to open and having checked
   * whether to. Anything else that pops up on arrival (the mini-game rules
   * card) waits for this, or both open at once on a first visit.
   */
  const settled = !autoOpen || checked;

  return { open, show, close, settled };
}

export default function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const go = (next: number) => {
    if (next < 0 || next >= CARDS.length) return;
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) go(index + 1);
    else if (info.offset.x > 60) go(index - 1);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open) return null;
  const card = CARDS[index];
  const last = index === CARDS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[96] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-it-works-title"
    >
      <div className="glass-card w-full max-w-md rounded-3xl border border-partyYellow/50 bg-slate-900/95 shadow-2xl my-auto overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-partyYellow">How it works</p>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-black text-gray-300 hover:text-white transition"
          >
            SKIP <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="relative min-h-[300px] px-5 py-4 touch-pan-y">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={index}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.18 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.4}
              onDragEnd={onDragEnd}
              className="space-y-3 cursor-grab active:cursor-grabbing select-none"
            >
              <div className="text-5xl text-center" aria-hidden="true">{card.emoji}</div>
              <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-partyCyan">{card.kicker}</p>
              <h2 id="how-it-works-title" className="text-center text-2xl font-black text-white leading-tight">
                {card.title}
              </h2>
              <p className="text-sm text-gray-200 leading-snug text-center">{card.body}</p>
              {card.points && (
                <ul className="space-y-1.5 pt-1">
                  {card.points.map((point) => (
                    <li key={point} className="flex gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-gray-100 leading-snug">
                      <span className="text-partyYellow font-black shrink-0">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-1.5 pb-3" aria-hidden="true">
          {CARDS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-partyYellow' : 'w-1.5 bg-white/25'}`}
            />
          ))}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            aria-label="Previous card"
            className="w-12 shrink-0 rounded-2xl border border-white/15 text-white flex items-center justify-center disabled:opacity-30 transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => (last ? onClose() : go(index + 1))}
            className="flex-1 bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-base py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            {last ? (
              <>
                <Play className="w-5 h-5 fill-current" /> LET&apos;S PLAY
              </>
            ) : (
              <>
                NEXT <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
