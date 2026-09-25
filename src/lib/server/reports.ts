/**
 * Player reports and what happens to them afterwards.
 *
 * The filing side and the moderation side are written months apart and read the
 * same documents, so the shape lives here rather than being spelled out twice.
 *
 * The status field is the point. A report that is only ever written is a
 * suggestion box with the lid welded shut: the reporter gets no signal, the
 * same person gets reported five times with nobody noticing it was the same
 * person, and there is no way to tell "we looked and it was fine" from "nobody
 * has looked yet". That distinction is the whole job of a queue.
 */

export const REPORT_REASONS = [
  'harassment',
  'hate_speech',
  'sexual_content',
  'threats',
  'spam',
  'underage',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** Human labels, shared by the report form and the moderation queue. */
export const REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  hate_speech: 'Hate speech',
  sexual_content: 'Sexual content',
  threats: 'Threats or violence',
  spam: 'Spam or disruption',
  underage: 'Appears to be a child',
  other: 'Something else',
};

/**
 * Where a report has got to.
 *
 * Deliberately three states and not four: "in progress" sounds useful and in
 * practice means a report sits claimed and forgotten. Either it is waiting, or
 * somebody has decided.
 */
export type ReportStatus = 'open' | 'actioned' | 'dismissed';

export type ReportRecord = {
  id: string;
  roomId: string;
  at: number;
  reason: ReportReason;
  note: string;
  /** Null when auth was unavailable — the report still counts, it just has no author. */
  reporterUid: string | null;
  reportedPlayerId: string;
  reportedName: string;
  /** Null for a player with no durable identity; such a report cannot be aggregated. */
  reportedUid: string | null;
  roomWasPublic: boolean;
  roomPhase: string;
  playerNames: string[];

  // ── Set when a moderator decides ──────────────────────────────────────────
  status?: ReportStatus;
  resolvedAt?: number;
  /** Free text from the moderator, for the next person who reads the row. */
  resolutionNote?: string;
};

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return value === 'open' || value === 'actioned' || value === 'dismissed';
}

/** A row written before the status field existed reads as open, not as missing. */
export function statusOf(report: ReportRecord): ReportStatus {
  return report.status ?? 'open';
}

/**
 * Groups reports by the person they are about.
 *
 * The single most useful thing a moderator can know is that this is the fourth
 * report about the same player, and that is invisible in a flat list sorted by
 * time. Keyed on the durable uid where there is one, because a per-room player
 * id dies with the room and would scatter one person across every match they
 * played.
 */
export function subjectKey(report: ReportRecord): string {
  return report.reportedUid ? `uid:${report.reportedUid}` : `name:${report.reportedName}`;
}

export type ReportSubject = {
  key: string;
  name: string;
  uid: string | null;
  total: number;
  open: number;
  /** Most recent report time, for ordering. */
  lastAt: number;
  reasons: ReportReason[];
};

export function summariseSubjects(reports: ReportRecord[]): ReportSubject[] {
  const byKey = new Map<string, ReportSubject>();

  for (const report of reports) {
    const key = subjectKey(report);
    const existing = byKey.get(key);

    if (existing) {
      existing.total += 1;
      if (statusOf(report) === 'open') existing.open += 1;
      existing.lastAt = Math.max(existing.lastAt, report.at);
      if (!existing.reasons.includes(report.reason)) existing.reasons.push(report.reason);
      continue;
    }

    byKey.set(key, {
      key,
      name: report.reportedName,
      uid: report.reportedUid,
      total: 1,
      open: statusOf(report) === 'open' ? 1 : 0,
      lastAt: report.at,
      reasons: [report.reason],
    });
  }

  // Repeat offenders first, then whoever was reported most recently. A queue
  // ordered purely by time buries the person being reported over and over.
  return [...byKey.values()].sort((a, b) => b.total - a.total || b.lastAt - a.lastAt);
}
