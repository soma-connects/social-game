import { MAX_RECENT_ERRORS } from './feedback';

/**
 * The last few errors this page threw, kept for a feedback report.
 *
 * "It froze on the shop screen" is a report. "It froze on the shop screen" plus
 * "TypeError: Cannot read properties of undefined (reading 'inventory')" is a
 * bug with its location attached. Players cannot copy that out of a console on
 * a phone, so the page keeps it for them.
 *
 * Only messages — no stack traces, no page state. Stack traces are long, mostly
 * bundle noise in production, and could carry details nobody meant to send.
 */
const recent: string[] = [];
let installed = false;

function remember(message: string): void {
  const line = `${new Date().toISOString().slice(11, 19)} ${message}`.slice(0, 300);
  // The same error on every frame would otherwise fill the buffer with one line.
  if (recent[recent.length - 1]?.endsWith(message.slice(0, 280))) return;
  recent.push(line);
  if (recent.length > MAX_RECENT_ERRORS) recent.shift();
}

/** Starts listening. Safe to call more than once, and on the server. */
export function installErrorCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    remember(event.message || String(event.error ?? 'Unknown error'));
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    remember(`Unhandled: ${reason instanceof Error ? reason.message : String(reason)}`);
  });
}

export function recentErrors(): string[] {
  return [...recent];
}
