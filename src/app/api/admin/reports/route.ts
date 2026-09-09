import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/server';
import { isAdminRequest } from '@/lib/server/adminAuth';
import {
  isReportStatus,
  summariseSubjects,
  type ReportRecord,
  type ReportStatus,
} from '@/lib/server/reports';

export const dynamic = 'force-dynamic';

/** Ceiling on reports read per request. */
const MAX_REPORTS = 500;

/**
 * The moderation queue.
 *
 * Reads the collection firestore.rules closes to every browser — a report names
 * the person who filed it, so serving it anywhere but behind the admin gate
 * would turn the reporting system into a retaliation list.
 */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const status = new URL(request.url).searchParams.get('status');
  const wanted: ReportStatus | 'all' = isReportStatus(status) ? status : 'all';

  try {
    // Ordered by time and filtered in memory rather than by a status query:
    // rows written before the status field existed carry no `status` at all,
    // and a Firestore equality filter would silently drop exactly the oldest
    // reports — the ones most likely to have been waiting the longest.
    const snapshot = await adminDb
      .collection('reports')
      .orderBy('at', 'desc')
      .limit(MAX_REPORTS)
      .get();

    const all = snapshot.docs.map((doc) => doc.data() as ReportRecord);
    const reports = wanted === 'all' ? all : all.filter((r) => (r.status ?? 'open') === wanted);

    return NextResponse.json({
      reports,
      // Computed over everything read, not just the filtered view: "this is
      // their fourth report" must not change depending on which tab is open.
      subjects: summariseSubjects(all),
      openCount: all.filter((r) => (r.status ?? 'open') === 'open').length,
      truncated: all.length >= MAX_REPORTS,
    });
  } catch (error) {
    console.error('admin reports listing failed', error);
    return NextResponse.json({ error: 'Could not read reports.' }, { status: 500 });
  }
}

/**
 * Records a moderator's decision on one report.
 *
 * Takes no action against the player. Auto-kicking or auto-banning on a report
 * count is the obvious next step and an equally obvious griefing tool — three
 * friends can remove anyone they like. The decision, and the account action
 * that might follow it, stay with a person.
 */
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

  if (!id || !isReportStatus(status)) {
    return NextResponse.json({ error: 'Missing report id or status' }, { status: 400 });
  }

  try {
    const ref = adminDb.collection('reports').doc(id);
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: 'That report no longer exists' }, { status: 404 });
    }

    await ref.set(
      {
        status,
        // Cleared when a decision is reopened, so a reopened row does not keep
        // claiming it was resolved at some point in the past.
        resolvedAt: status === 'open' ? null : Date.now(),
        resolutionNote,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('report resolution failed', error);
    return NextResponse.json({ error: 'Could not update the report.' }, { status: 500 });
  }
}
