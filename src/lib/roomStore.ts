import { GamePhase, LanguageCode, MapTheme, MiniGameId, RoomState, SocialReactionId, TurnResult } from './types';

const ROOM_CACHE_PREFIX = 'voice_party_room_';
const MY_PLAYER_ID_KEY = 'voice_party_my_player_id';
const POLL_INTERVAL_MS = 1500;

export type RoomStatus = 'connecting' | 'live' | 'missing' | 'error';

export interface RoomSnapshot {
  room: RoomState | null;
  status: RoomStatus;
  /** Set when the last action or poll failed, for the UI to show. */
  error: string | null;
}

type Listener = (snapshot: RoomSnapshot) => void;

/**
 * Client-side view of a room.
 *
 * The server is the single source of truth. localStorage is only a cache of the
 * last known state so a refresh has something to paint immediately — it is never
 * used to invent a room or to apply a move the server has not accepted. That
 * split matters: the old version applied dice rolls and dare results to local
 * objects, and the next poll silently threw them away.
 */
class RoomStoreManager {
  private listeners = new Set<Listener>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private currentRoomId: string | null = null;

  private snapshot: RoomSnapshot = { room: null, status: 'connecting', error: null };
  private lastSerialized = '';
  private hasLoadedOnce = false;
  private visibilityHandler: (() => void) | null = null;

  // ---------------------------------------------------------------- identity

  public getMyPlayerId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(MY_PLAYER_ID_KEY);
  }

  public setMyPlayerId(id: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MY_PLAYER_ID_KEY, id);
  }

  public generateRoomCode(): string {
    // No I/O/0/1 — these get misread when a code is typed off a screenshot.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return `NJA-${code}`;
  }

  // ------------------------------------------------------------ subscription

  public getSnapshot(): RoomSnapshot {
    return this.snapshot;
  }

  public getRoom(roomId?: string): RoomState | null {
    if (this.snapshot.room) return this.snapshot.room;
    if (roomId) return this.readCache(roomId);
    return null;
  }

  public subscribe(callback: Listener): () => void {
    this.listeners.add(callback);
    callback(this.snapshot);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private emit(next: Partial<RoomSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((cb) => cb(this.snapshot));
  }

  /** Only emits when the room actually changed, so polling does not re-render every 1.5s. */
  private applyRoom(room: RoomState): void {
    const serialized = JSON.stringify(room);
    this.writeCache(room);
    if (serialized === this.lastSerialized && this.snapshot.status === 'live') return;
    this.lastSerialized = serialized;
    this.emit({ room, status: 'live', error: null });
  }

  // ------------------------------------------------------------------- cache

  private readCache(roomId: string): RoomState | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(`${ROOM_CACHE_PREFIX}${roomId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RoomState;
    } catch {
      return null;
    }
  }

  private writeCache(room: RoomState): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`${ROOM_CACHE_PREFIX}${room.roomId}`, JSON.stringify(room));
    } catch {
      /* quota exceeded — the cache is optional */
    }
  }

  // ----------------------------------------------------------------- polling

  public startPolling(roomId: string): void {
    this.currentRoomId = roomId;
    this.lastSerialized = '';
    this.hasLoadedOnce = false;

    const cached = this.readCache(roomId);
    this.snapshot = { room: cached, status: 'connecting', error: null };

    if (this.pollTimer) clearInterval(this.pollTimer);
    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);

    if (typeof document !== 'undefined' && !this.visibilityHandler) {
      // Catch up immediately when the player comes back to the tab.
      this.visibilityHandler = () => {
        if (!document.hidden) void this.poll();
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  public stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.currentRoomId = null;
  }

  private async poll(): Promise<void> {
    const roomId = this.currentRoomId;
    if (!roomId) return;
    // Skip polling a backgrounded tab, but never skip the very first load — a tab
    // opened in the background would otherwise sit on "connecting" forever.
    if (this.hasLoadedOnce && typeof document !== 'undefined' && document.hidden) return;

    try {
      const res = await fetch(`/api/room/${roomId}`, { cache: 'no-store' });
      if (res.status === 404) {
        this.emit({ status: 'missing', error: null });
        return;
      }
      if (!res.ok) {
        this.emit({ status: 'error', error: `Server responded ${res.status}` });
        return;
      }
      this.hasLoadedOnce = true;
      this.applyRoom((await res.json()) as RoomState);
    } catch {
      this.emit({ status: 'error', error: 'Lost connection to the game server. Retrying…' });
    }
  }

  // ----------------------------------------------------------------- actions

  private async post<T extends Record<string, unknown>>(
    roomId: string,
    payload: T
  ): Promise<{ room?: RoomState; error?: string; [key: string]: unknown }> {
    try {
      const res = await fetch(`/api/room/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const error = (data as { error?: string }).error ?? `Request failed (${res.status})`;
        this.emit({ status: res.status === 404 ? 'missing' : 'error', error });
        return { error };
      }

      if (data.room) this.applyRoom(data.room as RoomState);
      return data;
    } catch {
      const error = 'Could not reach the game server.';
      this.emit({ status: 'error', error });
      return { error };
    }
  }

  public async createRoom(roomId: string, hostName: string): Promise<RoomState | null> {
    const data = await this.post(roomId, { action: 'create', playerName: hostName });
    if (data.playerId) this.setMyPlayerId(String(data.playerId));
    return (data.room as RoomState) ?? null;
  }

  public async joinRoom(roomId: string, playerName: string): Promise<{ room: RoomState | null; error?: string }> {
    const data = await this.post(roomId, { action: 'join', playerName });
    if (data.error) return { room: null, error: data.error };
    if (data.playerId) this.setMyPlayerId(String(data.playerId));
    return { room: (data.room as RoomState) ?? null };
  }

  public addTrapWord(roomId: string, word: string, authorId: string, authorName: string, targetPlayerId?: string) {
    return this.post(roomId, { action: 'add_trap', trapWord: word, authorId, authorName, targetPlayerId });
  }

  public markTrapUsed(roomId: string, trapId: string) {
    return this.post(roomId, { action: 'mark_trap_used', trapId });
  }

  public updateLanguages(roomId: string, languages: LanguageCode[], mathEnabled: boolean) {
    return this.post(roomId, { action: 'update_settings', languages, mathEnabled });
  }

  public setTheme(roomId: string, theme: MapTheme) {
    return this.post(roomId, { action: 'set_theme', theme });
  }

  public setAvatar(roomId: string, playerId: string, avatarId: string) {
    return this.post(roomId, { action: 'set_avatar', playerId, avatarId });
  }

  public setPhase(roomId: string, phase: GamePhase) {
    return this.post(roomId, { action: 'update_phase', phase });
  }

  public updateMiniGames(roomId: string, miniGames: MiniGameId[]) {
    return this.post(roomId, { action: 'update_minigames', miniGames });
  }

  /** Starts the match and deals the host their first mini-game. */
  public startMatch(roomId: string) {
    return this.post(roomId, { action: 'start_match' });
  }

  /** Finishing a mini-game banks points and sets the movement for the board. */
  public async completeMiniGame(roomId: string, game: MiniGameId, pointsEarned: number) {
    const data = await this.post(roomId, {
      action: game === 'pitch_bird' ? 'complete_pitch_bird' : 'complete_voice_turn',
      pointsEarned,
    });
    return {
      result: (data.result as TurnResult) ?? null,
      summary: typeof data.summary === 'string' ? data.summary : '',
      error: data.error,
    };
  }

  public finishRoast(roomId: string) {
    return this.post(roomId, { action: 'finish_roast' });
  }

  public buyPowerup(roomId: string, playerId: string, powerupId: string) {
    return this.post(roomId, { action: 'buy_powerup', playerId, powerupId });
  }

  /** Everyone shops at once; the board opens when the last player is done. */
  public finishShopping(roomId: string, playerId: string) {
    return this.post(roomId, { action: 'finish_shopping', playerId });
  }

  // ── Presence ──────────────────────────────────────────────────────────────

  /**
   * Tells the server this player is still here. Without it a closed tab looks
   * identical to somebody taking a long turn, and the room waits forever.
   */
  public heartbeat(roomId: string, playerId: string) {
    return this.post(roomId, { action: 'heartbeat', playerId });
  }

  public leaveRoom(roomId: string, playerId: string) {
    return this.post(roomId, { action: 'leave_room', playerId });
  }

  public kickPlayer(roomId: string, playerId: string, requesterId: string) {
    return this.post(roomId, { action: 'kick_player', playerId, requesterId });
  }

  /**
   * Best-effort "I'm closing the tab" ping. Uses sendBeacon because a normal
   * fetch is cancelled when the page unloads.
   */
  public leaveOnUnload(roomId: string, playerId: string): void {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    try {
      navigator.sendBeacon(
        `/api/room/${roomId}`,
        new Blob([JSON.stringify({ action: 'leave_room', playerId })], { type: 'application/json' })
      );
    } catch {
      /* the heartbeat timeout is the fallback */
    }
  }

  public addSocialReaction(
    roomId: string,
    reaction: SocialReactionId,
    voterId: string,
    voterName: string,
    targetPlayerId: string
  ) {
    return this.post(roomId, {
      action: 'add_social_reaction',
      reaction,
      voterId,
      voterName,
      targetPlayerId,
    });
  }

  public addJudgeVote(
    roomId: string,
    vote: 'pass' | 'fail',
    voterId: string,
    voterName: string,
    targetPlayerId: string
  ) {
    return this.post(roomId, { action: 'add_judge_vote', vote, voterId, voterName, targetPlayerId });
  }

  /**
   * Reveals the movement the mini-game earned. Despite the name there is no
   * randomness here — the server returns the steps banked by the qualifying round.
   */
  public async rollDice(roomId: string) {
    const data = await this.post(roomId, { action: 'roll_dice' });
    return {
      roll: typeof data.roll === 'number' ? data.roll : null,
      outcome: (data.outcome as { banner: string | null; message: string; triggersDare: boolean }) ?? null,
      error: data.error,
    };
  }

  public resolveDare(roomId: string, targetPlayerId: string, passed: boolean) {
    return this.post(roomId, { action: 'resolve_dare', targetPlayerId, passed });
  }

  public usePowerup(roomId: string, powerupId: string) {
    return this.post(roomId, { action: 'use_powerup', powerupId });
  }

  public advanceTurn(roomId: string) {
    return this.post(roomId, { action: 'advance_turn' });
  }
}

export const roomStore = new RoomStoreManager();
