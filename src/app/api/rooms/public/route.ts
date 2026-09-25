import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/server';
import { MAX_PLAYERS, isPresent } from '@/lib/gameRules';
import { callerKey, consume } from '@/lib/server/rateLimit';
import type { RoomState } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The public room browser's feed.
 *
 * Served through an API route rather than by letting browsers query Firestore,
 * for the reason firestore.rules gives: listing the rooms collection would hand
 * out every private room's code along with the names and transcripts inside it.
 * This route reads with the Admin SDK and returns only rooms a host chose to
 * publish, and only the handful of fields the browser screen actually draws.
 *
 * Read from the live room documents rather than a separate index. A second
 * collection would need keeping in sync on every join, leave and phase change,
 * and a stale index in a room browser is the worst kind: it advertises games
 * that are not there. At this scale one bounded query is cheaper than the bugs.
 */

/** A room with nobody home for this long stops being advertised. */
const STALE_AFTER_MS = 3 * 60 * 1000;

/** Ceiling on rooms read per request. */
const MAX_ROOMS = 60;

export type PublicRoomSummary = {
  roomId: string;
  hostName: string;
  mode: NonNullable<RoomState['roomType']>;
  vibe: string | null;
  playerCount: number;
  maxPlayers: number;
  createdAt: number;
};

export async function GET(request: Request) {
  // Unauthenticated and cheap to call in a loop, so it gets the same cost guard
  // as the other open routes. Generous, because the browser polls it.
  const limit = consume(`public-rooms:${callerKey(request)}`, 20, 2000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Slow down a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  try {
    const snapshot = await adminDb
      .collection('rooms')
      .where('isPublic', '==', true)
      .limit(MAX_ROOMS)
      .get();

    const now = Date.now();
    const rooms: PublicRoomSummary[] = [];

    for (const doc of snapshot.docs) {
      const room = doc.data() as RoomState;

      // Only joinable lobbies. A match already under way is not something a
      // stranger can walk into — the round loop assumes a fixed roster — and
      // listing one produces a join that immediately fails.
      if (room.phase !== 'lobby') continue;

      // Presence, not headcount: a room whose players all closed the tab still
      // has them in the array until the next prune.
      const present = (room.players ?? []).filter((player) => isPresent(player, now));
      if (present.length === 0) continue;
      if (present.length >= MAX_PLAYERS) continue;

      // Abandoned lobbies that nothing has written to in a while.
      if (room.updatedAt && now - room.updatedAt > STALE_AFTER_MS) continue;

      const host = room.players?.find((player) => player.id === room.hostId);

      rooms.push({
        roomId: room.roomId,
        // Player-chosen text going to strangers. Trimmed and length-capped here
        // so the browser cannot be used as a billboard; React escapes it on the
        // way out, so this is about abuse, not injection.
        hostName: (host?.name ?? 'Someone').slice(0, 24),
        mode: room.roomType ?? 'board_game',
        vibe: room.roomVibe ?? null,
        playerCount: present.length,
        maxPlayers: MAX_PLAYERS,
        createdAt: room.matchStartedAt ?? room.updatedAt ?? now,
      });
    }

    // Fullest first: a room with four people waiting starts sooner than an
    // empty one, and a browser that lists dead-looking lobbies first feels
    // empty even when it is not.
    rooms.sort((a, b) => b.playerCount - a.playerCount);

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('public rooms listing failed', error);
    return NextResponse.json({ error: 'Could not load public rooms.' }, { status: 500 });
  }
}
