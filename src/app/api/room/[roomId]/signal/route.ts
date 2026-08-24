import { NextResponse } from 'next/server';
import {
  SignalMessage,
  clearVoicePresence,
  drainSignals,
  enqueueSignal,
  getVoicePresence,
  readRoom,
} from '@/lib/server/roomServer';

export const dynamic = 'force-dynamic';

// WebRTC signalling relay.
//
// Cloud Run supports WebSockets, but the room state is already driven by short
// polling and a party game only needs a handful of messages to set up a call, so
// this rides the same mechanism instead of adding a socket server. Each player
// has a mailbox; peers drop offers/answers/ICE candidates into it and the owner
// drains it on the next poll.
//
// The server never inspects SDP or candidates — it only relays them between two
// players who are already in the same room.

function isValidSignal(value: unknown): value is SignalMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.from !== 'string' || typeof msg.to !== 'string') return false;
  return msg.kind === 'offer' || msg.kind === 'answer' || msg.kind === 'ice' || msg.kind === 'bye';
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  const roomId = params.roomId.toUpperCase();

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  const room = await readRoom(roomId);
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const playerId = String(body.playerId ?? '');
  const isMember = room.players.some((p) => p.id === playerId);
  if (!isMember) {
    return NextResponse.json({ error: 'Not a player in this room' }, { status: 403 });
  }

  switch (body.action) {
    case 'send': {
      const messages: unknown[] = Array.isArray(body.messages) ? body.messages : [body.message];
      let sent = 0;

      for (const raw of messages) {
        if (!isValidSignal(raw)) continue;
        // A player may only send as themselves, and only to someone in the room.
        if (raw.from !== playerId) continue;
        if (!room.players.some((p) => p.id === raw.to)) continue;
        if (await enqueueSignal(roomId, raw)) sent++;
      }

      return NextResponse.json({ sent });
    }

    // Draining doubles as the presence heartbeat, so one request per tick covers
    // both "anything for me?" and "I am still on the call".
    case 'poll': {
      return NextResponse.json({
        messages: await drainSignals(roomId, playerId),
        present: await getVoicePresence(roomId),
      });
    }

    case 'leave': {
      await clearVoicePresence(roomId, playerId);
      for (const peer of room.players) {
        if (peer.id !== playerId) {
          await enqueueSignal(roomId, { kind: 'bye', from: playerId, to: peer.id });
        }
      }
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
}
