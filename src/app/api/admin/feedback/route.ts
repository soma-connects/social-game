import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/server';
import { isAdminRequest } from '@/lib/server/adminAuth';
import { isFeedbackStatus, type FeedbackRecord } from '@/lib/feedback';

export const dynamic = 'force-dynamic';

/** Ceiling on feedback read per request. */
const MAX_FEEDBACK = 500;

/**
 * The feedback queue.
 *
 * Behind the admin gate because a report can carry a player's name, the names
 * of everyone in their room, and whatever they chose to type.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  try {
    // Ordered by time and filtered in memory, as the report queue does, so a
    // status filter never has to depend on every row carrying the field.
    const snapshot = await adminDb
      .collection('feedback')
      .orderBy('at', 'desc')
      .limit(MAX_FEEDBACK)
      .get();
    const all = snapshot.docs.map((doc) => doc.data() as FeedbackRecord);

    return NextResponse.json({
      feedback: all,
      openCount: all.filter((f) => (f.status ?? 'open') === 'open').length,
      truncated: all.length >= MAX_FEEDBACK,
    });
  } catch (error) {
    console.error('admin feedback listing failed', error);
    return NextResponse.json({ error: 'Could not read feedback.' }, { status: 500 });
  }
}

/** Marks one piece of feedback fixed, won't-fix, or open again. */
export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();
  const status = body.status;
  const resolutionNote = String(body.resolutionNote ?? '').trim().slice(0, 500);
  if (!id || !isFeedbackStatus(status)) {
    return NextResponse.json({ error: 'Missing feedback id or status' }, { status: 400 });
  }

  try {
    const ref = adminDb.collection('feedback').doc(id);
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: 'That feedback no longer exists' }, { status: 404 });
    }
    await ref.set(
      { status, resolvedAt: status === 'open' ? null : Date.now(), resolutionNote },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('feedback resolution failed', error);
    return NextResponse.json({ error: 'Could not update that feedback.' }, { status: 500 });
  }
}
