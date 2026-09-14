'use client';

/**
 * Per-viewer mute and block.
 *
 * Deliberately local to the device rather than room state, for three reasons.
 * It has to take effect the instant it is tapped — waiting a poll cycle to stop
 * hearing somebody is the one delay that is not acceptable. It has to outlive
 * the room, so blocking someone means something the next time you meet them.
 * And it must not be visible to the person it is aimed at: a block the blocked
 * player can see is an invitation to retaliate.
 *
 * Mute is per-room and forgotten with it; block is durable and keyed on the
 * player's Firebase uid where one exists, since a per-room player id dies with
 * the room and a display name is not an identity.
 */

const BLOCK_KEY = 'vp_blocked_uids';
const MUTE_KEY = 'vp_muted_players';

/** Reads a JSON array from storage, tolerating every way it can be unavailable. */
function readList(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Private windows, cleared site data, and browsers set to block storage all
    // land here. Muting has to keep working for the session even when it cannot
    // be remembered, so this degrades to an empty list rather than throwing.
    return [];
  }
}

function writeList(key: string, values: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...new Set(values)].slice(-500)));
  } catch {
    /* Storage unavailable — the in-memory listeners below still hold for now. */
  }
}

// Mirrors the stored lists so a tap updates every subscribed component at once,
// and so mute survives storage being unwritable.
let blocked = new Set(readList(BLOCK_KEY));
let muted = new Set(readList(MUTE_KEY));
const listeners = new Set<() => void>();

/**
 * Bumped on every change, so React has something that actually differs to
 * compare. useSyncExternalStore re-renders when the snapshot value changes, and
 * these lists live in Sets whose identity is stable — a snapshot derived from
 * their contents would look unchanged after a mutation.
 */
let version = 0;

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeSafety(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot for useSyncExternalStore. */
export function safetyVersion(): number {
  return version;
}

/** Server snapshot — no storage there, so the value is fixed. */
export function safetyServerVersion(): number {
  return 0;
}

// ─── Block: durable, identity-keyed ─────────────────────────────────────────

export function isBlocked(uid: string | undefined): boolean {
  return !!uid && blocked.has(uid);
}

export function blockUid(uid: string): void {
  blocked.add(uid);
  writeList(BLOCK_KEY, [...blocked]);
  notify();
}

export function unblockUid(uid: string): void {
  blocked.delete(uid);
  writeList(BLOCK_KEY, [...blocked]);
  notify();
}

export function blockedUids(): string[] {
  return [...blocked];
}

// ─── Mute: this room, this session ──────────────────────────────────────────

export function isMuted(playerId: string): boolean {
  return muted.has(playerId);
}

export function setMuted(playerId: string, value: boolean): void {
  if (value) muted.add(playerId);
  else muted.delete(playerId);
  writeList(MUTE_KEY, [...muted]);
  notify();
}

/**
 * Whether this player's audio should be silenced for this viewer.
 *
 * One function so the voice layer has a single question to ask, and blocking
 * cannot be enforced in one place and forgotten in another.
 */
export function shouldSilence(player: { id: string; uid?: string }): boolean {
  return isMuted(player.id) || isBlocked(player.uid);
}

/** Forgets per-room mutes. Blocks are durable and deliberately survive. */
export function clearRoomMutes(): void {
  muted = new Set();
  writeList(MUTE_KEY, []);
  notify();
}
