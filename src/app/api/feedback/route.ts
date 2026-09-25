import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/server';
import { newToken, readRoom } from '@/lib/server/roomServer';
import { callerKey, consume } from '@/lib/server/rateLimit';
import { parseFeedback, type FeedbackRecord } from '@/lib/feedback';

export const dynamic = 'force-dynamic';

/**
 * A bug report or suggestion from a player.
 *
 * Exists so that "the shop froze again" reaches whoever can fix it, instead of
 * being said once in a group chat and lost.
 *
 * The room is read here rather than described by the browser: phase, round,
 * mini-game and roster come from the room document, so a report says where the
 * player actually was and not where the page thought it was — which, for a
 * report about the page being wrong, is the difference that matters.
 *
 * Unauthenticated on purpose. A feedback box that needs you to be signed in to
 * report that signing in is broken is no use, and the rate limit bounds the
 * cost of anyone abusing it.
 */
export async function POST(request: Request) {
  // Generous enough for someone describing two problems, tight enough that a
  // script cannot fill the collection.
  const limit = consume(`feedback:${callerKey(request)}`, 4, 120_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Thanks — you have sent a few just now. Give it a couple of minutes.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const parsed = parseFeedback(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const submission = parsed.value;

  // A missing or swept room is not a reason to drop the report — "I could not
  // get into the room" is exactly the report that arrives with no room.
  const room = submission.roomId ? await readRoom(submission.roomId).catch(() => null) : null;
  const reporter = room?.players.find((p) => p.id === submission.playerId) ?? null;

  try {
    const at = Date.now();
    const id = `${submission.roomId ?? 'NOROOM'}-${at.toString(36)}-${newToken().slice(0, 6)}`;
    const record: FeedbackRecord = {
      id,
      at,
      kind: submission.kind,
      message: submission.message,
      status: 'open',
      roomId: submission.roomId,
      roomPhase: room?.phase ?? null,
      miniGame: room?.currentMiniGame ?? null,
      round: room ? room.roundNumber ?? 0 : null,
      mode: room?.roomType ?? null,
      playerNames: room ? room.players.map((p) => p.name).slice(0, 8) : [],
      reporterName: reporter?.name ?? null,
      page: submission.page,
      // From the request, not the body — it is what the server actually saw.
      userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
      viewport: submission.viewport,
      recentErrors: submission.recentErrors,
    };
    await adminDb.collection('feedback').doc(id).set(record);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('feedback failed', error);
    return NextResponse.json({ error: 'Could not send that — try again in a moment.' }, { status: 500 });
  }
}
