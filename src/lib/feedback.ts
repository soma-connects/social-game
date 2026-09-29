/**
 * Bug reports and suggestions from players, and what happens to them.
 *
 * Deliberately separate from player reports (lib/server/reports.ts). Those name
 * a person and belong in a moderation queue; these describe a problem with the
 * game. Mixed together, a crash report sits between two harassment reports and
 * neither gets the attention it needs.
 *
 * The filing form, the API route and the admin queue all read this file, so it
 * holds nothing that touches the server — no Firestore, no secrets.
 */

export const FEEDBACK_KINDS = ['bug', 'idea', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: 'Something broke',
  idea: 'An idea',
  other: 'Something else',
};

/**
 * Where a piece of feedback has got to.
 *
 * Three states for the same reason the report queue has three: "in progress"
 * is where things go to be forgotten. It is either waiting, fixed, or decided
 * against — and the last two are different answers worth telling apart.
 */
export const FEEDBACK_STATUSES = ['open', 'fixed', 'wont_fix'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: 'Open',
  fixed: 'Fixed',
  wont_fix: "Won't fix",
};

export const MAX_FEEDBACK_CHARS = 1000;
/** Short enough that "it broke" is refused — that report cannot be acted on. */
export const MIN_FEEDBACK_CHARS = 8;
export const MAX_RECENT_ERRORS = 5;

export type FeedbackRecord = {
  id: string;
  at: number;
  kind: FeedbackKind;
  message: string;
  status: FeedbackStatus;
  resolvedAt?: number | null;
  resolutionNote?: string;

  // ─── read from the room by the server, so they cannot be made up ────────
  roomId: string | null;
  /** Null when the room had already been swept, or none was given. */
  roomPhase: string | null;
  miniGame: string | null;
  round: number | null;
  mode: string | null;
  playerNames: string[];
  /** The sender, if the player id they sent belongs to that room. */
  reporterName: string | null;

  // ─── from the browser: useful, but only as trustworthy as the browser ────
  page: string | null;
  userAgent: string | null;
  viewport: string | null;
  /** The last few errors the page threw before this was sent. */
  recentErrors: string[];
};

/** What a browser may send. Everything else is worked out by the server. */
export type FeedbackSubmission = {
  kind: FeedbackKind;
  message: string;
  roomId: string | null;
  playerId: string | null;
  page: string | null;
  viewport: string | null;
  recentErrors: string[];
};

const clip = (value: unknown, max: number): string | null => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text ? text.slice(0, max) : null;
};

/**
 * Checks and trims a submission, or says what is wrong with it.
 *
 * Pure, so the rules the form enforces and the rules the server enforces are
 * provably the same rules — and testable without a network.
 */
export function parseFeedback(
  body: Record<string, unknown>
): { ok: true; value: FeedbackSubmission } | { ok: false; error: string } {
  const kind = body.kind;
  if (!FEEDBACK_KINDS.includes(kind as FeedbackKind)) {
    return { ok: false, error: 'Pick what kind of feedback this is.' };
  }

  // Newlines are kept in the message — a bug report is often a list of steps.
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_FEEDBACK_CHARS) : '';
  if (message.length < MIN_FEEDBACK_CHARS) {
    return { ok: false, error: 'Say a little more about what happened.' };
  }

  const recentErrors = Array.isArray(body.recentErrors)
    ? body.recentErrors
        .map((e) => clip(e, 300))
        .filter((e): e is string => !!e)
        .slice(-MAX_RECENT_ERRORS)
    : [];

  const roomId = clip(body.roomId, 12);

  return {
    ok: true,
    value: {
      kind: kind as FeedbackKind,
      message,
      roomId: roomId ? roomId.toUpperCase() : null,
      playerId: clip(body.playerId, 64),
      page: clip(body.page, 200),
      viewport: clip(body.viewport, 20),
      recentErrors,
    },
  };
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return FEEDBACK_STATUSES.includes(value as FeedbackStatus);
}
