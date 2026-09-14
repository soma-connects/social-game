'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Globe, RefreshCw, Users } from 'lucide-react';
import { roomStore } from '@/lib/roomStore';
import { ROOM_VIBES } from '@/lib/roomVibes';
import type { PublicRoomSummary } from '@/app/api/rooms/public/route';

const MODE_LABELS: Record<string, string> = {
  board_game: 'Roadmap board',
  team_battle: 'Team battle',
  chess: 'Chess',
  ludo: 'Ludo',
  ai_master: 'AI Master',
};

/** How often the list refreshes itself while somebody is looking at it. */
const POLL_MS = 6000;

/**
 * The public lobby list.
 *
 * Polled rather than subscribed: firestore.rules refuses browsers a listing of
 * the rooms collection, so this goes through an API route that returns only
 * published rooms. Six seconds is slower than a live subscription and fast
 * enough that a room which fills up stops being offered before somebody taps a
 * game that has no seat left.
 */
export default function PublicRoomBrowser({
  onJoin,
  busy,
}: {
  onJoin: (roomId: string) => void;
  busy: boolean;
}) {
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await roomStore.listPublicRooms();
    setRooms(result.rooms);
    setError(result.error ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <section className="glass-card rounded-3xl p-5 border border-white/10 space-y-3 max-w-xl mx-auto text-left">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-white flex items-center gap-2">
          <Globe className="w-4 h-4 text-partyCyan" /> PUBLIC ROOMS
        </h2>
        <button
          onClick={() => void load()}
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
          aria-label="Refresh the room list"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </header>

      {loading && <p className="text-xs text-gray-400 py-4 text-center">Looking for games…</p>}

      {!loading && error && <p className="text-xs text-red-300 py-3 text-center">{error}</p>}

      {!loading && !error && rooms.length === 0 && (
        <p className="text-xs text-gray-400 py-4 text-center leading-relaxed">
          No public games right now. Create a room and switch on{' '}
          <span className="text-partyCyan font-bold">Make public</span> in the lobby — yours will
          show up here for everyone else.
        </p>
      )}

      <ul className="space-y-2">
        {rooms.map((room) => {
          const vibe = room.vibe ? ROOM_VIBES[room.vibe as keyof typeof ROOM_VIBES] : null;
          const full = room.playerCount >= room.maxPlayers;

          return (
            <li key={room.roomId}>
              <button
                onClick={() => onJoin(room.roomId)}
                disabled={busy || full}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-partyCyan/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-black text-white truncate">
                    {room.hostName}&apos;s room
                  </span>
                  <span className="block text-[10px] text-gray-400 truncate">
                    {MODE_LABELS[room.mode] ?? room.mode}
                    {vibe ? ` · ${vibe.emoji} ${vibe.label}` : ''}
                  </span>
                </span>

                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-black text-partyCyan flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {room.playerCount}/{room.maxPlayers}
                  </span>
                  <span className="font-mono text-[10px] text-gray-500">{room.roomId}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] text-gray-500 leading-relaxed pt-1">
        In public rooms your mic starts muted and dares are disabled. You can mute, block or report
        anyone from the player list.
      </p>
    </section>
  );
}
