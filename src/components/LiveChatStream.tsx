'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Send, MessageCircle, X } from 'lucide-react';
import { Player, RoomChatMessage, RoomState } from '@/lib/types';
import { CHAT_EMOJI, EMOJI_FLIGHT_MS, MAX_COMMENT_CHARS } from '@/lib/chatEmoji';
import { roomStore } from '@/lib/roomStore';
import { audioSFX } from '@/lib/audioFeedback';

/**
 * The live stream that runs beside the game.
 *
 * This replaces a panel of four reaction buttons that recorded a count and
 * showed a meter. The counts still happen — the four scoring emoji feed exactly
 * the same social bonus they always did — but the room now sees each other
 * react, which is the part that was missing. A number going up is not a crowd.
 *
 * Two surfaces, one feed: emoji fly up over the game and vanish, comments stack
 * at the bottom and stay. Both are the same messages from the same room
 * document, told apart by `kind`.
 */

interface LiveChatStreamProps {
  room: RoomState;
  myPlayer: Player;
}

/** A glyph currently in the air, with the lane and wobble it was given. */
type Flyer = {
  message: RoomChatMessage;
  /** Percentage across the launch strip, so two at once do not overlap. */
  lane: number;
  drift: number;
  scale: number;
};

export default function LiveChatStream({ room, myPlayer }: LiveChatStreamProps) {
  const log = useMemo(() => room.chat ?? [], [room.chat]);

  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState(true);

  /**
   * Messages already launched.
   *
   * The room document is rewritten on every heartbeat, so this component sees
   * the same chat log many times over. Without remembering what has flown, every
   * unrelated write would relaunch the whole feed.
   */
  const launched = useRef<Set<string>>(new Set());
  /**
   * Whether this viewer wants things flying across their screen.
   *
   * Read once on mount rather than at module scope, because the server has no
   * matchMedia and rendering differently on the server than on the client is a
   * hydration mismatch.
   */
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  /** True until the first snapshot has been seen, so joining is not a fireworks display. */
  const cold = useRef(true);

  useEffect(() => {
    const fresh: Flyer[] = [];
    const now = Date.now();

    for (const message of log) {
      if (launched.current.has(message.id)) continue;
      launched.current.add(message.id);
      // On the first render everything in the log is history, not news.
      if (cold.current) continue;
      if (message.kind !== 'emoji') continue;
      // Put away, or unwanted: the message is still recorded and still scores,
      // it simply does not fly. Marking it launched above means it will not
      // ambush the viewer the moment they open the stream again either.
      if (!open || reducedMotion) continue;
      // A message that has been sitting in the log is not worth animating —
      // this catches a reconnect, where the whole backlog arrives at once.
      if (now - message.at > EMOJI_FLIGHT_MS) continue;

      fresh.push({
        message,
        lane: 8 + Math.random() * 84,
        drift: (Math.random() - 0.5) * 70,
        scale: 0.85 + Math.random() * 0.5,
      });
    }

    cold.current = false;
    if (fresh.length === 0) return;

    setFlyers((current) => [...current, ...fresh]);
  }, [log, open, reducedMotion]);

  /**
   * Clears flyers once they have landed.
   *
   * Deliberately its own interval rather than a timeout per batch inside the
   * effect above. That effect re-runs on every change to the room document —
   * which is every heartbeat — and a timeout returned as its cleanup is
   * cancelled by the next run, so batches were never removed and the flyers
   * piled up for the life of the session, still on screen long after they had
   * finished animating and still there after the stream was put away.
   */
  useEffect(() => {
    if (flyers.length === 0) return;
    const sweep = setInterval(() => {
      const cutoff = Date.now() - EMOJI_FLIGHT_MS;
      setFlyers((current) => current.filter((f) => f.message.at > cutoff));
    }, 600);
    return () => clearInterval(sweep);
  }, [flyers.length]);

  /**
   * Keeps the id set from growing for the life of the room.
   *
   * Anything no longer in the log cannot arrive again, so remembering it buys
   * nothing — and a long session would otherwise accumulate every id ever sent.
   */
  useEffect(() => {
    if (launched.current.size < 400) return;
    launched.current = new Set(log.map((m) => m.id));
  }, [log]);

  const comments = useMemo(() => log.filter((m) => m.kind === 'text').slice(-6), [log]);

  const sendEmoji = useCallback(
    (glyph: string) => {
      audioSFX.playTap();
      void roomStore.postChat(room.roomId, 'emoji', glyph);
    },
    [room.roomId]
  );

  const sendComment = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void roomStore.postChat(room.roomId, 'text', text);
  }, [draft, room.roomId]);

  return (
    <>
      {/* Emoji in flight. Fixed and non-interactive so they pass over whatever
          game is on screen without ever swallowing a tap meant for it. */}
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        <AnimatePresence>
          {flyers.map((flyer) => (
            <motion.div
              key={flyer.message.id}
              initial={{ opacity: 0, y: 0, x: 0, scale: 0.4 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: -280,
                x: flyer.drift,
                scale: flyer.scale,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: EMOJI_FLIGHT_MS / 1000, ease: 'easeOut', times: [0, 0.12, 0.7, 1] }}
              className="absolute bottom-28 flex flex-col items-center"
              style={{ left: `${flyer.lane}%` }}
            >
              <span className="text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{flyer.message.body}</span>
              <span className="mt-0.5 rounded-full bg-black/55 px-1.5 text-[9px] font-black text-white/90 whitespace-nowrap">
                {flyer.message.authorName}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Comments and the controls that feed them. */}
      <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
        <div className="mx-auto w-full max-w-lg px-3 pb-3 space-y-1.5">
          {open && comments.length > 0 && (
            <div className="space-y-1">
              <AnimatePresence initial={false}>
                {comments.map((message) => (
                  <motion.div
                    key={message.id}
                    layout
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="pointer-events-none max-w-[85%] rounded-full bg-black/55 backdrop-blur-sm px-3 py-1 text-[11px] leading-snug"
                  >
                    <span
                      className={`font-black ${
                        message.authorId === myPlayer.id ? 'text-partyYellow' : 'text-partyCyan'
                      }`}
                    >
                      {message.authorName}
                    </span>{' '}
                    <span className="text-white/90 break-words">{message.body}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          <div className="pointer-events-auto flex items-center gap-1.5">
            {open ? (
              composing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendComment();
                  }}
                  className="flex flex-1 items-center gap-1.5"
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT_CHARS))}
                    onBlur={() => !draft && setComposing(false)}
                    placeholder="Say something…"
                    aria-label="Write a comment"
                    className="flex-1 min-w-0 rounded-full bg-black/60 border border-white/15 px-3 py-2 text-xs text-white placeholder:text-white/40 outline-none focus:border-partyCyan"
                  />
                  <button
                    type="submit"
                    aria-label="Send comment"
                    className="shrink-0 rounded-full bg-partyCyan/90 p-2 text-slate-950 active:scale-95 transition"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <>
                  {/* The palette scrolls rather than wrapping, so the bar stays
                      one row high on a narrow phone instead of eating the game. */}
                  <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {CHAT_EMOJI.map((emoji) => (
                      <button
                        key={emoji.glyph}
                        onClick={() => sendEmoji(emoji.glyph)}
                        title={emoji.label}
                        aria-label={`Send ${emoji.label}`}
                        className="shrink-0 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 w-9 h-9 text-lg leading-none active:scale-90 transition hover:border-partyCyan/60"
                      >
                        {emoji.glyph}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setComposing(true)}
                    aria-label="Write a comment"
                    className="shrink-0 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 p-2 text-white/80 active:scale-90 transition hover:border-partyCyan/60"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                </>
              )
            ) : (
              <div className="flex-1" />
            )}

            {/* A way out, on the same row rather than its own.
                The stream sits over the game, and somebody reading a board or a
                chess position needs to be able to put it away — including the
                emoji, which is the part that covers things. */}
            <button
              onClick={() => {
                setOpen((v) => !v);
                setComposing(false);
              }}
              aria-label={open ? 'Hide the live chat' : 'Show the live chat'}
              className="shrink-0 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 w-9 h-9 flex items-center justify-center text-sm text-white/70 active:scale-90 transition hover:border-partyCyan/60"
            >
              {open ? <X className="w-4 h-4" /> : '💬'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
