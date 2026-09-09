/**
 * Chart tokens for the admin dashboard.
 *
 * The game is dark-only — there is no theme toggle — so this commits to the
 * dark surface rather than shipping an unused light half. Every value below was
 * validated against the app's own card colour (#0B132B) rather than a generic
 * dark, because contrast and colour-blind separation are only meaningful
 * against the surface a chart actually renders on.
 *
 *   categorical 1-3   all-pairs CVD ΔE 9.4, normal-vision ΔE 20.9, all ≥3:1
 *   funnel ordinal    monotone L, adjacent ΔL ≥0.06, light end 4.16:1
 */

/** Identity colours. Assigned in fixed order, never cycled or sorted by rank. */
export const SERIES = ['#3987e5', '#d95926', '#199e70'] as const;

/** Ordered steps for the funnel — one hue, light to dark. */
export const FUNNEL_RAMP = ['#9ec5f4', '#5598e7', '#2a78d6'] as const;

export const INK = {
  primary: '#ffffff',
  secondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  surface: '#0B132B',
  page: '#050814',
  border: 'rgba(255,255,255,0.10)',
} as const;

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
} as const;

export const percent = (value: number): string => `${Math.round(value * 100)}%`;

export const compact = (value: number): string =>
  value >= 10_000 ? `${(value / 1000).toFixed(1)}k` : String(value);
