'use client';

import React, { useState } from 'react';
import { Ban, Flag, ShieldOff, Volume2, VolumeX, X } from 'lucide-react';
import type { Player } from '@/lib/types';
import { roomStore } from '@/lib/roomStore';
import { blockUid, isBlocked, isMuted, setMuted, unblockUid } from '@/lib/safety';

const REASONS: { id: string; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate_speech', label: 'Hate speech' },
  { id: 'sexual_content', label: 'Sexual content' },
  { id: 'threats', label: 'Threats or violence' },
  { id: 'underage', label: 'Appears to be a child' },
  { id: 'spam', label: 'Spam or disruption' },
  { id: 'other', label: 'Something else' },
];

/**
 * Mute, block and report for one player.
 *
 * Reachable from the roster rather than buried in a settings screen, because
 * the moment somebody needs it is the moment they are already uncomfortable and
 * every extra tap is a reason to just leave instead.
 *
 * Mute and block take effect locally and immediately — they do not wait for a
 * server round trip, and the person on the other end is never told.
 */
export default function PlayerSafetyMenu({
  player,
  roomId,
  onClose,
}: {
  player: Player;
  roomId: string;
  onClose: () => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const muted = isMuted(player.id);
  const blocked = isBlocked(player.uid);

  const submitReport = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);

    const result = await roomStore.reportPlayer({
      roomId,
      reportedPlayerId: player.id,
      reason,
      note,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not file the report.');
      return;
    }

    // Reporting somebody and still having to listen to them is a bad ending, so
    // filing also mutes them. Reversible from this same menu.
    setMuted(player.id, true);
    setSent(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4">
      <div className="glass-card rounded-t-3xl sm:rounded-3xl p-5 border border-white/15 w-full sm:max-w-sm space-y-4 bg-slate-900/95 pb-8 sm:pb-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-black text-white truncate">{player.name}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="space-y-3">
            <p className="text-xs text-emerald-300 font-bold">
              Report sent, and {player.name} is now muted for you.
            </p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              A person reviews reports — nothing happens to them automatically, and they are not
              told who reported them.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-white/10 hover:bg-white/20 text-white font-black text-xs py-2.5 rounded-xl"
            >
              DONE
            </button>
          </div>
        ) : reporting ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-300">What happened?</p>

            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {REASONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setReason(option.id)}
                  className={`w-full text-left text-xs font-bold px-3 py-2 rounded-xl border transition-colors ${
                    reason === option.id
                      ? 'bg-partyPink/20 border-partyPink text-white'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 500))}
              placeholder="Anything else worth knowing (optional)"
              rows={2}
              className="w-full bg-partyDark/90 border border-white/20 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-partyPink resize-none"
            />

            {error && <p className="text-[11px] text-red-300">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => setReporting(false)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-gray-200 font-black text-xs py-2.5 rounded-xl"
              >
                BACK
              </button>
              <button
                onClick={submitReport}
                disabled={!reason || busy}
                className="flex-1 bg-partyPink hover:bg-red-400 disabled:opacity-40 text-white font-black text-xs py-2.5 rounded-xl"
              >
                {busy ? 'SENDING…' : 'SEND REPORT'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => setMuted(player.id, !muted)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left"
            >
              {muted ? (
                <VolumeX className="w-4 h-4 text-amber-300 shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-gray-300 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block text-xs font-black text-white">
                  {muted ? 'Unmute' : 'Mute'}
                </span>
                <span className="block text-[10px] text-gray-400">
                  {muted ? 'You will hear them again' : 'Silence them for this room'}
                </span>
              </span>
            </button>

            {player.uid ? (
              <button
                onClick={() => (blocked ? unblockUid(player.uid!) : blockUid(player.uid!))}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left"
              >
                {blocked ? (
                  <ShieldOff className="w-4 h-4 text-emerald-300 shrink-0" />
                ) : (
                  <Ban className="w-4 h-4 text-gray-300 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block text-xs font-black text-white">
                    {blocked ? 'Unblock' : 'Block'}
                  </span>
                  <span className="block text-[10px] text-gray-400">
                    {blocked
                      ? 'They can be heard again in future rooms'
                      : 'Stays muted in every room, from now on'}
                  </span>
                </span>
              </button>
            ) : (
              // Without a durable uid there is nothing to block that would still
              // mean anything tomorrow — a per-room id dies with the room.
              <p className="text-[10px] text-gray-500 px-3 leading-relaxed">
                Blocking needs a signed-in identity, which this player does not have. Muting still
                works for this room.
              </p>
            )}

            <button
              onClick={() => setReporting(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-partyPink/10 hover:bg-partyPink/20 border border-partyPink/30 text-left"
            >
              <Flag className="w-4 h-4 text-partyPink shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs font-black text-white">Report</span>
                <span className="block text-[10px] text-gray-400">
                  Send this to a moderator for review
                </span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
