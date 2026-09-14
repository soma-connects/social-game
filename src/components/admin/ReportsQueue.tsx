'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChartCard, EmptyPlot, StatTile } from './Charts';
import { INK, SERIES, STATUS } from './vizTokens';
import {
  REASON_LABELS,
  type ReportRecord,
  type ReportStatus,
  type ReportSubject,
} from '@/lib/server/reports';

type Payload = {
  reports: ReportRecord[];
  subjects: ReportSubject[];
  openCount: number;
  truncated: boolean;
};

const FILTERS: { id: ReportStatus | 'all'; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
];

const when = (at: number) => new Date(at).toLocaleString();

/**
 * The moderation queue.
 *
 * Ordered newest-first, but the panel above it is grouped by person — because
 * the thing a moderator most needs to know is not what happened most recently,
 * it is that this is the fourth report about the same player, which a flat
 * chronological list hides completely.
 */
export default function ReportsQueue({ onSignOut }: { onSignOut: () => void }) {
  const [filter, setFilter] = useState<ReportStatus | 'all'>('open');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(
    async (status: ReportStatus | 'all') => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/reports?status=${status}`, { cache: 'no-store' });
        if (response.status === 401) return onSignOut();
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Request failed');
        setData(payload);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not load reports.');
      } finally {
        setLoading(false);
      }
    },
    [onSignOut]
  );

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const resolve = async (report: ReportRecord, status: ReportStatus) => {
    setBusyId(report.id);
    try {
      const response = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: report.id, status, resolutionNote: notes[report.id] ?? '' }),
      });
      if (response.status === 401) return onSignOut();
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? 'Could not update the report.');
        return;
      }
      await load(filter);
    } finally {
      setBusyId(null);
    }
  };

  const subjects = (data?.subjects ?? []).filter((subject) => subject.total > 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Open reports"
          value={String(data?.openCount ?? 0)}
          hint="Waiting on a decision"
          tone={(data?.openCount ?? 0) > 0 ? STATUS.warning : STATUS.good}
        />
        <StatTile
          label="Repeat subjects"
          value={String(subjects.length)}
          hint="Players reported more than once"
          tone={subjects.length > 0 ? STATUS.critical : undefined}
        />
        <StatTile
          label="In this view"
          value={String(data?.reports.length ?? 0)}
          hint={`Filtered to "${FILTERS.find((f) => f.id === filter)?.label}"`}
        />
        <StatTile
          label="Automated action"
          value="None"
          hint="Every decision is made by a person"
        />
      </div>

      {subjects.length > 0 && (
        <ChartCard
          title="Reported more than once"
          subtitle="The signal a chronological list hides"
        >
          <ul className="space-y-2">
            {subjects.map((subject) => (
              <li
                key={subject.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 border"
                style={{ borderColor: `${STATUS.critical}55`, backgroundColor: `${STATUS.critical}12` }}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold" style={{ color: INK.primary }}>
                    {subject.name}
                  </span>
                  <span className="block text-[11px]" style={{ color: INK.muted }}>
                    {subject.reasons.map((reason) => REASON_LABELS[reason]).join(' · ')}
                    {!subject.uid && ' · no durable identity'}
                  </span>
                </span>
                <span className="text-xs font-bold shrink-0" style={{ color: STATUS.critical }}>
                  {subject.total} reports · {subject.open} open
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}

      <ChartCard
        title="Reports"
        subtitle="Newest first"
        actions={
          <div className="inline-flex rounded-xl overflow-hidden border" style={{ borderColor: INK.axis }}>
            {FILTERS.map((option) => (
              <button
                key={option.id}
                onClick={() => setFilter(option.id)}
                className="px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={{
                  backgroundColor: filter === option.id ? SERIES[0] : 'transparent',
                  color: filter === option.id ? '#ffffff' : INK.secondary,
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

        {loading && !data && (
          <p className="text-sm py-8 text-center" style={{ color: INK.muted }}>
            Loading reports…
          </p>
        )}

        {data && data.reports.length === 0 && (
          <EmptyPlot
            message={
              filter === 'open'
                ? 'Nothing waiting. Reports filed from the player list land here.'
                : 'No reports in this view.'
            }
          />
        )}

        <ul className="space-y-3">
          {(data?.reports ?? []).map((report) => {
            const status = report.status ?? 'open';
            const open = status === 'open';

            return (
              <li
                key={report.id}
                className="rounded-2xl p-3.5 border space-y-2.5"
                style={{
                  borderColor: open ? `${STATUS.warning}55` : INK.border,
                  backgroundColor: open ? `${STATUS.warning}0D` : 'transparent',
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: INK.primary }}>
                      {report.reportedName}
                      <span className="ml-2 text-[11px] font-normal" style={{ color: INK.muted }}>
                        {REASON_LABELS[report.reason] ?? report.reason}
                      </span>
                    </p>
                    <p className="text-[11px]" style={{ color: INK.muted }}>
                      {when(report.at)} · room {report.roomId} ·{' '}
                      {report.roomWasPublic ? 'public room' : 'private room'}
                    </p>
                  </div>

                  <span
                    className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
                    style={{
                      color: open ? STATUS.warning : status === 'actioned' ? STATUS.critical : INK.muted,
                      border: `1px solid ${open ? STATUS.warning : status === 'actioned' ? STATUS.critical : INK.axis}55`,
                    }}
                  >
                    {status}
                  </span>
                </div>

                {report.note && (
                  <p
                    className="text-xs rounded-xl px-3 py-2"
                    style={{ color: INK.secondary, backgroundColor: 'rgba(255,255,255,0.04)' }}
                  >
                    “{report.note}”
                  </p>
                )}

                <p className="text-[11px]" style={{ color: INK.muted }}>
                  In the room: {report.playerNames.join(', ') || 'not recorded'}
                  {report.reportedUid ? '' : ' · reported player has no durable identity'}
                </p>

                {open ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={notes[report.id] ?? ''}
                      onChange={(event) =>
                        setNotes((prev) => ({ ...prev, [report.id]: event.target.value.slice(0, 500) }))
                      }
                      placeholder="What did you decide, and why?"
                      className="flex-1 min-w-[12rem] rounded-xl px-3 py-1.5 text-xs outline-none border"
                      style={{ backgroundColor: INK.page, borderColor: INK.axis, color: INK.primary }}
                    />
                    <button
                      onClick={() => resolve(report, 'actioned')}
                      disabled={busyId === report.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl disabled:opacity-40"
                      style={{ backgroundColor: STATUS.critical, color: '#ffffff' }}
                    >
                      Mark actioned
                    </button>
                    <button
                      onClick={() => resolve(report, 'dismissed')}
                      disabled={busyId === report.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl border disabled:opacity-40"
                      style={{ borderColor: INK.axis, color: INK.secondary }}
                    >
                      Mark dismissed
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px]" style={{ color: INK.secondary }}>
                      {report.resolutionNote ? `“${report.resolutionNote}”` : 'No note left.'}
                      {report.resolvedAt ? ` · ${when(report.resolvedAt)}` : ''}
                    </p>
                    <button
                      onClick={() => resolve(report, 'open')}
                      disabled={busyId === report.id}
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
            Read cap reached — older reports are not shown.
          </p>
        )}
      </ChartCard>
    </div>
  );
}
