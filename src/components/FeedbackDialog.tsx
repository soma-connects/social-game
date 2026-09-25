'use client';

import React, { useEffect, useId, useState } from 'react';
import { Bug, CheckCircle2, Lightbulb, MessageSquare, X } from 'lucide-react';
import {
  FEEDBACK_KIND_LABELS,
  MAX_FEEDBACK_CHARS,
  MIN_FEEDBACK_CHARS,
  type FeedbackKind,
} from '@/lib/feedback';
import { recentErrors } from '@/lib/clientErrors';

interface FeedbackDialogProps {
  /** The room the player is in, if any — the server reads the rest from it. */
  roomId?: string | null;
  playerId?: string | null;
  onClose: () => void;
}

const KIND_ICONS: Record<FeedbackKind, React.ComponentType<{ className?: string }>> = {
  bug: Bug,
  idea: Lightbulb,
  other: MessageSquare,
};

/**
 * "Send feedback" — so a problem reaches whoever can fix it.
 *
 * Asks for as little as possible: what kind, and what happened. Everything
 * that makes a bug report actionable — where they were, on what device, what
 * the page threw — is attached without asking, and the form says so plainly.
 * Sending people's error logs without telling them is not a thing to do to
 * someone who was trying to help.
 */
export default function FeedbackDialog({ roomId, playerId, onClose }: FeedbackDialogProps) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'editing' | 'sending' | 'sent'>('editing');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tooShort = message.trim().length < MIN_FEEDBACK_CHARS;

  const send = async () => {
    if (tooShort || state === 'sending') return;
    setState('sending');
    setError(null);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          message,
          roomId: roomId ?? null,
          playerId: playerId ?? null,
          page: window.location.pathname,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          recentErrors: recentErrors(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not send that.');
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.');
      setState('editing');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-card max-w-md w-full rounded-3xl p-5 sm:p-6 border border-white/15 space-y-4 bg-slate-900/95"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-lg font-black text-white">
              Send feedback
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Goes straight to the people who build this.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="glass-pill hover:bg-white/20 text-white p-1.5 rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {state === 'sent' ? (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-bold text-white">Thanks — that has been sent.</p>
            <button
              onClick={onClose}
              className="glass-pill hover:bg-white/20 text-white font-bold text-sm px-5 py-2.5 rounded-2xl border border-white/20"
            >
              Back to the game
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What kind of feedback">
              {(Object.keys(FEEDBACK_KIND_LABELS) as FeedbackKind[]).map((id) => {
                const Icon = KIND_ICONS[id];
                const active = kind === id;
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setKind(id)}
                    className={`rounded-2xl border px-2 py-2.5 flex flex-col items-center gap-1 text-[11px] font-bold transition-all ${
                      active
                        ? 'border-partyCyan bg-partyCyan/15 text-white'
                        : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/25'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {FEEDBACK_KIND_LABELS[id]}
                  </button>
                );
              })}
            </div>

            <div>
              <textarea
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_FEEDBACK_CHARS))}
                rows={5}
                aria-label="What happened"
                placeholder={
                  kind === 'bug'
                    ? 'What happened, and what were you doing just before?'
                    : kind === 'idea'
                      ? 'What would make the game better?'
                      : 'What is on your mind?'
                }
                className="w-full rounded-2xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-partyCyan resize-none"
              />
              <p className="text-[10px] text-gray-500 text-right tabular-nums">
                {message.length} / {MAX_FEEDBACK_CHARS}
              </p>
            </div>

            <p className="text-[11px] text-gray-400 leading-snug">
              Sent along with your message: {roomId ? 'the room code, the screen you are on, ' : 'the page you are on, '}
              your device type, and any errors your browser hit just now. Nothing else.
            </p>

            {error && (
              <p className="text-xs text-red-300 bg-red-500/15 border border-red-500/40 rounded-xl px-3 py-2" role="alert">
                {error}
              </p>
            )}

            <button
              onClick={send}
              disabled={tooShort || state === 'sending'}
              className="w-full bg-partyCyan hover:brightness-110 text-slate-950 font-black text-sm py-3 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {state === 'sending' ? 'Sending…' : 'Send'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
