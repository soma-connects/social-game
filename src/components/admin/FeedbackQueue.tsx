'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartCard, EmptyPlot, StatTile } from './Charts';
import { INK, STATUS } from './vizTokens';
import {
  FEEDBACK_KIND_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackRecord,
  type FeedbackStatus,
} from '@/lib/feedback';
import { placeLabel } from '@/lib/placeLabels';

type Payload = { feedback: FeedbackRecord[]; openCount: number; truncated: boolean };

type Filter = 'open' | 'all' | 'bug' | 'idea';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'bug', label: 'Bugs' },
  { id: 'idea', label: 'Ideas' },
  { id: 'all', label: 'Everything' },
];

const when = (at: number) => new Date(at).toLocaleString();

/** Status carries a word as well as a colour, never the colour alone. */
function statusTone(status: FeedbackStatus): string {
  if (status === 'open') return STATUS.warning;
  if (status === 'fixed') return STATUS.good;
  return INK.muted;
}

/**
 * The feedback queue: what players reported, where they were, what broke.
 *
 * Laid out like the moderation queue beside it, deliberately — one set of
 * habits for both. Each item leads with what the player said and follows with
 * what the game knew at that moment, because the second half is usually where
 * the fix is.
 */
export default function FeedbackQueue({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/feedback', { cache: 'no-store' });
      if (response.status === 401) return onSignOut();
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Request failed');
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load feedback.');
    } finally {
      setLoading(false);
    }
  }, [onSignOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => data?.feedback ?? [], [data]);
  const shown = useMemo(() => {
    if (filter === 'all') return all;
    if (filter === 'open') return all.filter((f) => (f.status ?? 'open') === 'open');
    return all.filter((f) => f.kind === filter);
  }, [all, filter]);

  const openBugs = all.filter((f) => f.kind === 'bug' && (f.status ?? 'open') === 'open').length;
  const withErrors = all.filter((f) => (f.recentErrors ?? []).length > 0 && (f.status ?? 'open') === 'open').length;

  const resolve = async (item: FeedbackRecord, status: FeedbackStatus) => {
    setBusyId(item.id);
    try {
      const response = await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status, resolutionNote: notes[item.id] ?? '' }),
      });
      if (response.status === 401) return onSignOut();
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? 'Could not update that feedback.');
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Open"
          value={String(data?.openCount ?? 0)}
          hint="Waiting on a look"
          tone={(data?.openCount ?? 0) > 0 ? STATUS.warning : STATUS.good}
        />
        <StatTile label="Open bugs" value={String(openBugs)} hint="Reported as something broke" />
        <StatTile
          label="With errors attached"
          value={String(withErrors)}
          hint="Open, and the browser caught what went wrong"
        />
        <StatTile label="All time" value={String(all.length)} hint="Everything sent so far" />
      </div>

      <ChartCard
        title="Feedback"
        subtitle="Newest first — what they said, then what the game knew at that moment"
        actions={
          <div className="inline-flex rounded-xl overflow-hidden border" style={{ borderColor: INK.axis }}>
            {FILTERS.map((option) => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id)}
                className="px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: filter === option.id ? 'rgba(255,255,255,0.10)' : 'transparent',
                  color: filter === option.id ? INK.primary : INK.secondary,
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        {error && (
          <p className="text-xs mb-3" style={{ color: STATUS.critical }} role="alert">
            {error}
          </p>
        )}

        {!loading && shown.length === 0 && (
          <EmptyPlot
            message={
              filter === 'open' ? 'Nothing waiting. Players have not reported anything new.' : 'Nothing in this view.'
            }
          />
        )}

        <ul className="space-y-3">
          {shown.map((item) => {
            const status = item.status ?? 'open';
            const open = status === 'open';
            const where = item.roomPhase ? placeLabel(item.roomPhase, item.miniGame) : null;

            return (
              <li
                key={item.id}
                className="rounded-2xl p-3.5 border space-y-2.5"
                style={{
                  borderColor: open ? `${STATUS.warning}55` : INK.border,
                  backgroundColor: open ? `${STATUS.warning}0D` : 'transparent',
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: INK.primary }}>
                      {FEEDBACK_KIND_LABELS[item.kind] ?? item.kind}
                      <span className="ml-2 text-[11px] font-normal" style={{ color: INK.muted }}>
                        from {item.reporterName ?? 'someone'}
                      </span>
                    </p>
                    <p className="text-[11px]" style={{ color: INK.muted }}>
                      {when(item.at)}
                      {item.roomId ? ` · room ${item.roomId}` : ' · not in a room'}
                      {where ? ` · ${where}` : ''}
                      {item.round ? ` · round ${item.round}` : ''}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
                    style={{ color: statusTone(status), border: `1px solid ${statusTone(status)}55` }}
                  >
                    {FEEDBACK_STATUS_LABELS[status]}
                  </span>
                </div>

                <p
                  className="text-sm rounded-xl px-3 py-2 whitespace-pre-wrap break-words"
                  style={{ color: INK.primary, backgroundColor: 'rgba(255,255,255,0.04)' }}
                >
                  {item.message}
                </p>

                {(item.recentErrors ?? []).length > 0 && (
                  <div className="rounded-xl px-3 py-2 border" style={{ borderColor: `${STATUS.critical}40` }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: INK.muted }}>
                      Errors the browser hit just before
                    </p>
                    <ul className="space-y-0.5">
                      {item.recentErrors.map((line, i) => (
                        <li key={i} className="font-mono text-[11px] break-all" style={{ color: INK.secondary }}>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-[11px]" style={{ color: INK.muted }}>
                  {item.playerNames.length > 0 ? `In the room: ${item.playerNames.join(', ')} · ` : ''}
                  {item.viewport ? `${item.viewport} · ` : ''}
                  <span title={item.userAgent ?? ''}>{shortDevice(item.userAgent)}</span>
                  {item.page ? ` · ${item.page}` : ''}
                </p>

                {open ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={notes[item.id] ?? ''}
                      onChange={(event) =>
                        setNotes((prev) => ({ ...prev, [item.id]: event.target.value.slice(0, 500) }))
                      }
                      placeholder="What was it, and what did you do?"
                      className="flex-1 min-w-[12rem] rounded-xl px-3 py-1.5 text-xs outline-none border"
                      style={{ backgroundColor: INK.page, borderColor: INK.axis, color: INK.primary }}
                    />
                    <button
                      onClick={() => resolve(item, 'fixed')}
                      disabled={busyId === item.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl disabled:opacity-40"
                      style={{ backgroundColor: STATUS.good, color: '#ffffff' }}
                    >
                      Mark fixed
                    </button>
                    <button
                      onClick={() => resolve(item, 'wont_fix')}
                      disabled={busyId === item.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl border disabled:opacity-40"
                      style={{ borderColor: INK.axis, color: INK.secondary }}
                    >
                      Won&apos;t fix
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px]" style={{ color: INK.secondary }}>
                      {item.resolutionNote ? `“${item.resolutionNote}”` : 'No note left.'}
                      {item.resolvedAt ? ` · ${when(item.resolvedAt)}` : ''}
                    </p>
                    <button
                      onClick={() => resolve(item, 'open')}
                      disabled={busyId === item.id}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-xl border disabled:opacity-40"
                      style={{ borderColor: INK.axis, color: INK.secondary }}
                    >
                      Reopen
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {data?.truncated && (
          <p className="text-[11px] mt-3" style={{ color: STATUS.warning }}>
            Read cap reached — older feedback is not shown.
          </p>
        )}
      </ChartCard>
    </div>
  );
}

/**
 * A user agent in a few words.
 *
 * The full string is on hover; the list only needs enough to spot a pattern —
 * "every report is from an iPhone" is a finding in itself.
 */
function shortDevice(userAgent: string | null): string {
  if (!userAgent) return 'unknown device';
  const os = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'other';
  const browser = /EdgA?\//.test(userAgent)
    ? 'Edge'
    : /SamsungBrowser/.test(userAgent)
      ? 'Samsung Internet'
      : /CriOS|Chrome\//.test(userAgent)
        ? 'Chrome'
        : /FxiOS|Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'browser';
  return `${browser} on ${os}`;
}
