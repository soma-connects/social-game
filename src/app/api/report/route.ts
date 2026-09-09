import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/server';
import { verifyUid } from '@/lib/firebase/server';
import { newToken, readRoom } from '@/lib/server/roomServer';
import { callerKey, consume } from '@/lib/server/rateLimit';
import { isReportReason, type ReportRecord } from '@/lib/server/reports';

export const dynamic = 'force-dynamic';

/**
 * A player report.
 *
 * Written to a collection no browser can read — a report names the person who
 * filed it, and a reporting system whose reports are visible to the reported is
 * worse than none, because it teaches people not to file them.
 *
 * Deliberately append-only and deliberately dumb: it records who, whom, where
 * and why, and takes no automated action. Auto-kicking on a report count is an
 * obvious next step and an obvious griefing tool, so the moderation decision
 * stays with a person.
 */
export async function POST(request: Request) {
  const limit = consume(`report:${callerKey(request)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'You have filed several reports just now — give it a minute.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const roomId = String(body.roomId ?? '').trim().toUpperCase();
  const reportedPlayerId = String(body.reportedPlayerId ?? '').trim();
  const reason = body.reason;
  const note = String(body.note ?? '').trim().slice(0, 500);

  if (!roomId || !reportedPlayerId || !isReportReason(reason)) {
    return NextResponse.json({ error: 'Missing or invalid report details' }, { status: 400 });
  }

  const room = await readRoom(roomId);
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  const reported = room.players.find((player) => player.id === reportedPlayerId);
  if (!reported) return NextResponse.json({ error: 'That player is not in this room' }, { status: 404 });

  // The reporter's durable identity when auth is available. Never taken from
  // the body — a uid in a request is just a string the browser chose.
  const reporterUid = await verifyUid(body.idToken);

  try {
    const id = `${roomId}-${Date.now().toString(36)}-${newToken().slice(0, 8)}`;
    const record: ReportRecord = {
      id,
      roomId,
      at: Date.now(),
      reason,
      note,
      reporterUid,
      reportedPlayerId,
      reportedName: reported.name,
      reportedUid: reported.uid ?? null,
      // Snapshotted, because the room is swept six hours after the last
      // heartbeat and a report that outlives its evidence is unactionable.
      roomWasPublic: room.isPublic === true || room.wasEverPublic === true,
      roomPhase: room.phase,
      playerNames: room.players.map((player) => player.name).slice(0, 8),
      // Explicit rather than left absent, so the queue can query for it.
      status: 'open',
    };
    await adminDb.collection('reports').doc(id).set(record);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('report failed', error);
    return NextResponse.json({ error: 'Could not file the report.' }, { status: 500 });
  }
}
