'use client';

import React, { useId, useState } from 'react';
import { INK, SERIES, percent } from './vizTokens';

/**
 * Inline-SVG chart primitives for the dashboard.
 *
 * Hand-rolled rather than pulled from a charting library: there are three chart
 * shapes here, all simple, and a library would add a dependency plus a theme to
 * fight for less code than it saves. Every mark follows the same rules — thin
 * marks, solid hairline grid one shade off the surface, a 2px surface gap
 * between adjacent fills, and a hover layer on everything with a plot.
 */

/** Card shell, so every chart sits in the same frame. */
export function ChartCard({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-5 border"
      style={{ backgroundColor: INK.surface, borderColor: INK.border }}
    >
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold" style={{ color: INK.primary }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: INK.muted }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Shown instead of an empty plot, so a blank card never reads as a broken one. */
export function EmptyPlot({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border border-dashed py-10 text-center text-xs"
      style={{ borderColor: INK.axis, color: INK.muted }}
    >
      {message}
    </div>
  );
}

/**
 * Horizontal bars for one measure across categories.
 *
 * One series, so one colour for every bar. Colouring each bar darker-where-
 * bigger would double-encode the length that is already on screen and burn the
 * only free channel in the chart.
 */
export function BarList({
  rows,
  color = SERIES[0],
  formatValue = (n: number) => String(n),
}: {
  rows: { key: string; label: string; value: number; note?: string }[];
  color?: string;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
          <span className="text-xs truncate" style={{ color: INK.secondary }} title={row.label}>
            {row.label}
          </span>

          <span
            className="h-2.5 rounded-full block"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            role="img"
            aria-label={`${row.label}: ${formatValue(row.value)}`}
          >
            <span
              className="h-2.5 rounded-full block transition-[width] duration-500"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, backgroundColor: color }}
            />
          </span>

          <span
            className="text-xs font-semibold tabular-nums text-right"
            style={{ color: INK.primary }}
          >
            {formatValue(row.value)}
            {row.note && (
              <span className="ml-1.5 font-normal" style={{ color: INK.muted }}>
                {row.note}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The usage funnel.
 *
 * Ordered stages, so this is the one place a ramp is correct — the steps have a
 * natural order and the hue carries it. Each stage also shows its conversion
 * from the step above, because the drop between stages is the whole question.
 */
export function Funnel({
  steps,
  ramp,
}: {
  steps: { label: string; value: number; hint: string }[];
  ramp: readonly string[];
}) {
  const top = Math.max(1, steps[0]?.value ?? 1);

  return (
    <ol className="space-y-3">
      {steps.map((step, i) => {
        const previous = i === 0 ? null : steps[i - 1].value;
        const conversion = previous && previous > 0 ? step.value / previous : null;

        return (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-xs font-semibold" style={{ color: INK.secondary }}>
                {step.label}
              </span>
              <span className="text-xs" style={{ color: INK.muted }}>
                {step.hint}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span
                className="h-7 rounded-lg block transition-[width] duration-500"
                style={{
                  width: `${Math.max(3, (step.value / top) * 100)}%`,
                  backgroundColor: ramp[Math.min(i, ramp.length - 1)],
                }}
              />
              <span
                className="text-base font-bold tabular-nums shrink-0"
                style={{ color: INK.primary }}
              >
                {step.value}
              </span>
              {conversion !== null && (
                <span className="text-xs shrink-0" style={{ color: INK.muted }}>
                  {percent(conversion)} of previous
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export type TimeSeries = { key: string; label: string; color: string; points: number[] };

/**
 * Two measures over time on ONE axis.
 *
 * Sessions and matches are both counts of the same kind of thing, so they share
 * a scale honestly. A second y-axis would let the two lines be slid against
 * each other until they appeared to correlate, which is the most common way a
 * dashboard invents a finding that is not in the data.
 */
export function LineChart({
  labels,
  series,
  height = 180,
}: {
  labels: string[];
  series: TimeSeries[];
  height?: number;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const width = 720;
  const pad = { top: 12, right: 12, bottom: 26, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const count = labels.length;
  const x = (i: number) => pad.left + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;

  // Four gridlines is enough to read a value off; more turns the plot into graph
  // paper and competes with the data.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const uniqueTicks = [...new Set(ticks)];

  return (
    <figure className="m-0">
      <div className="flex items-center gap-4 mb-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs" style={{ color: INK.secondary }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ overflow: 'visible' }}
        role="img"
        aria-label={`${series.map((s) => s.label).join(' and ')} per day`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={pad.left} y={pad.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {uniqueTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={INK.grid}
              strokeWidth={1}
            />
            <text x={pad.left - 8} y={y(tick) + 3} textAnchor="end" fontSize={10} fill={INK.muted}>
              {tick}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {series.map((s) => (
            <polyline
              key={s.key}
              points={s.points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* First and last label only. A tick per day is unreadable at 90 days,
            and the tooltip carries the exact date anyway. */}
        <text x={pad.left} y={height - 8} fontSize={10} fill={INK.muted}>
          {labels[0]}
        </text>
        <text x={width - pad.right} y={height - 8} fontSize={10} fill={INK.muted} textAnchor="end">
          {labels[labels.length - 1]}
        </text>

        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.top}
              y2={pad.top + plotH}
              stroke={INK.axis}
              strokeWidth={1}
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={x(hover)}
                cy={y(s.points[hover] ?? 0)}
                r={4}
                fill={s.color}
                stroke={INK.surface}
                strokeWidth={2}
              />
            ))}
          </g>
        )}

        {/* Full-height hit bands, so the pointer never has to find a 2px line. */}
        {labels.map((label, i) => (
          <rect
            key={label}
            x={x(i) - plotW / Math.max(1, count - 1) / 2}
            y={pad.top}
            width={plotW / Math.max(1, count - 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      <figcaption className="text-xs mt-2 h-4" style={{ color: INK.secondary }}>
        {hover !== null ? (
          <>
            <span style={{ color: INK.primary }}>{labels[hover]}</span>
            {series.map((s) => (
              <span key={s.key} className="ml-3">
                {s.label} <span style={{ color: INK.primary }}>{s.points[hover] ?? 0}</span>
              </span>
            ))}
          </>
        ) : (
          'Hover the chart for a day-by-day breakdown.'
        )}
      </figcaption>
    </figure>
  );
}

/** Headline number. A single value is a stat tile, never a one-bar chart. */
export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 border"
      style={{ backgroundColor: INK.surface, borderColor: INK.border }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: INK.muted }}>
        {label}
      </p>
      {/* Proportional figures, not tabular — equal-width digits make a large
          standalone number look loose. */}
      <p className="text-2xl font-bold mt-1" style={{ color: tone ?? INK.primary }}>
        {value}
      </p>
      {hint && (
        <p className="text-[11px] mt-0.5" style={{ color: INK.secondary }}>
          {hint}
        </p>
      )}
    </div>
  );
}
