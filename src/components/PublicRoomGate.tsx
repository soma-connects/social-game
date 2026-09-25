'use client';

import React, { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { PUBLIC_ROOM_MIN_AGE } from '@/lib/gameRules';

const ACK_KEY = 'vp_public_ack';

/** Whether this browser has already acknowledged the public-room terms. */
export function hasAcknowledged(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ACK_KEY) === '1';
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(ACK_KEY, '1');
  } catch {
    /* Storage unavailable — they will be asked again next time, which is fine. */
  }
}

/**
 * The one-time gate in front of playing with strangers.
 *
 * Shown before the first public join, never before a private one: a room you
 * were invited to by a friend does not need a warning about who is in it. It
 * asks rather than tells, and it says plainly what is different about a public
 * room, because the honest version of this screen is what makes the mic default
 * and the dare block legible instead of feeling like arbitrary missing features.
 */
export default function PublicRoomGate({
  onAccept,
  onCancel,
}: {
  onAccept: () => void;
  onCancel: () => void;
}) {
  const [ageOk, setAgeOk] = useState(false);
  const [rulesOk, setRulesOk] = useState(false);

  const accept = () => {
    remember();
    onAccept();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      {/* text-left is load-bearing: the home page wraps everything in a
          centred column, and a centred bulleted list of safety rules reads as
          decoration rather than as terms. */}
      <div className="glass-card rounded-3xl p-6 border border-partyCyan/40 w-full max-w-md space-y-4 bg-slate-900/95 text-left">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-partyCyan" /> Playing with strangers
          </h2>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-300 leading-relaxed">
          Public rooms put you with people you have never met. A few things work differently
          there, on purpose:
        </p>

        <ul className="text-xs text-gray-300 space-y-2">
          <li className="flex gap-2">
            <span aria-hidden>🎙️</span>
            <span>
              <strong className="text-white">Your mic starts off.</strong> Nobody hears you until
              you switch it on, and you can switch it back off at any point.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>🚫</span>
            <span>
              <strong className="text-white">Dares are disabled.</strong> Nobody can order you to
              perform. The rest of the board plays normally.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>🔇</span>
            <span>
              <strong className="text-white">You can mute, block and report</strong> anyone, from
              the player list, at any time. Blocking lasts beyond this room.
            </span>
          </li>
        </ul>

        <div className="space-y-2.5 pt-1">
          <label className="flex items-start gap-2.5 text-xs text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              checked={ageOk}
              onChange={(event) => setAgeOk(event.target.checked)}
              className="mt-0.5 w-4 h-4 accent-partyCyan shrink-0"
            />
            <span>I am {PUBLIC_ROOM_MIN_AGE} or older.</span>
          </label>

          <label className="flex items-start gap-2.5 text-xs text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              checked={rulesOk}
              onChange={(event) => setRulesOk(event.target.checked)}
              className="mt-0.5 w-4 h-4 accent-partyCyan shrink-0"
            />
            <span>
              I understand this is a live voice game with strangers, and I will not harass anyone.
            </span>
          </label>
        </div>

        <button
          onClick={accept}
          disabled={!ageOk || !rulesOk}
          className="w-full bg-partyCyan hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed text-partyDark font-black text-sm py-3 rounded-2xl transition-all"
        >
          JOIN PUBLIC ROOM
        </button>

        <button
          onClick={onCancel}
          className="w-full text-[11px] text-gray-400 hover:text-gray-200 font-bold"
        >
          Never mind — take me back
        </button>
      </div>
    </div>
  );
}
