import {
  GamePhase,
  LanguageCode,
  LiveMiniGameState,
  MapTheme,
  MiniGameId,
  RoomState,
  SocialReactionId,
  TeamId,
  TurnResult,
} from './types';

const ROOM_CACHE_PREFIX = 'voice_party_room_';
const MY_PLAYER_ID_KEY = 'voice_party_my_player_id';
/**
 * Proves to the server which player this browser is.
 *
 * Player ids are visible to everyone in the room — they are in the room
 * document the whole room subscribes to — so they cannot double as a
 * credential. The server issues this alongside the id at create/join and
 * checks it on every action that changes anything.
 */
const MY_TOKEN_KEY = 'voice_party_my_token';

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
 * Reads come from a live Firestore subscription; writes go through the room API,
 * which is the only thing allowed to change game state. localStorage is purely a
 * cache of the last known state so a refresh has something to paint immediately
 * — it is never used to invent a room or to apply a move the server has not
 * accepted. That split matters: an older version applied dice rolls and dare
 * results to local objects, and the next update silently threw them away.
 */
class RoomStoreManager {
  private listeners = new Set<Listener>();
  private currentRoomId: string | null = null;

  private snapshot: RoomSnapshot = { room: null, status: 'connecting', error: null };
  private lastSerialized = '';
  private unsubscribeFirestore: (() => void) | null = null;

  // ---------------------------------------------------------------- identity

  public getMyPlayerId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(MY_PLAYER_ID_KEY);
  }

  public setMyPlayerId(id: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MY_PLAYER_ID_KEY, id);
  }

  public getMyToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(MY_TOKEN_KEY);
  }

  public setMyToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MY_TOKEN_KEY, token);
  }

  /** Forgets who this browser was, so the next screen offers a fresh join. */
  public clearSession(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(MY_PLAYER_ID_KEY);
    localStorage.removeItem(MY_TOKEN_KEY);
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

  /** Opens a live Firestore subscription to the room. */
  public startPolling(roomId: string): void {
    this.stopPolling();

    this.currentRoomId = roomId;
    this.lastSerialized = '';

    const cached = this.readCache(roomId);
    this.snapshot = { room: cached, status: 'connecting', error: null };

    // Firebase is imported lazily so it never runs during SSR. That makes
    // attaching the listener asynchronous, so the room this call was made for
    // is captured and re-checked once the imports land — otherwise a fast
    // unmount, or switching rooms, leaves an orphan listener running forever on
    // the room we just left.
    void (async () => {
      const [{ doc, onSnapshot }, { db }] = await Promise.all([
        import('firebase/firestore'),
        import('./firebase/client'),
      ]);
      if (this.currentRoomId !== roomId) return;

      const unsubscribe = onSnapshot(
        doc(db, 'rooms', roomId),
        (snapshot) => {
          if (this.currentRoomId !== roomId) return;
          if (!snapshot.exists()) {
            this.emit({ status: 'missing', error: null });
            return;
          }
          this.applyRoom(snapshot.data() as RoomState);
        },
        (error) => {
          console.error('Firestore listener error:', error);
          if (this.currentRoomId !== roomId) return;
          this.emit({ status: 'error', error: 'Lost connection to the game server. Retrying…' });
        }
      );

      // stopPolling may have run while the imports were in flight.
      if (this.currentRoomId !== roomId) {
        unsubscribe();
        return;
      }
      this.unsubscribeFirestore = unsubscribe;
    })();
  }

  public stopPolling(): void {
    this.currentRoomId = null;
    if (this.unsubscribeFirestore) {
      this.unsubscribeFirestore();
      this.unsubscribeFirestore = null;
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
        // Attached to every request; the server ignores it where it is not
        // needed and rejects the request where it is missing.
        body: JSON.stringify({ token: this.getMyToken() ?? '', ...payload }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const error = (data as { error?: string }).error ?? `Request failed (${res.status})`;

        // The stored credential no longer matches any player — the room was
        // reset, or this is a session from before tokens existed. Clearing it
        // drops the UI back to the join screen instead of retrying forever
        // against an identity the server has never heard of.
        if (res.status === 401 && (data as { code?: string }).code === 'no_session') {
          this.clearSession();
        }

        this.emit({ status: res.status === 404 ? 'missing' : 'error', error });
        return { error };
      }

      if (typeof data.token === 'string') this.setMyToken(data.token);

      if (data.room) this.applyRoom(data.room as RoomState);
      return data;
    } catch {
      const error = 'Could not reach the game server.';
      this.emit({ status: 'error', error });
      return { error };
    }
  }

  /**
   * Sends an arbitrary room action.
   *
   * The mini-games used to call fetch directly, which meant they bypassed the
   * auth token, the shared error handling and the snapshot update. Everything
   * that talks to the room API should come through here.
   */
  public send(roomId: string, payload: Record<string, unknown>) {
    return this.post(roomId, payload);
  }

  public async createRoom(roomId: string, hostName: string, roomType: 'board_game' | 'team_battle' = 'board_game'): Promise<RoomState | null> {
    const data = await this.post(roomId, { action: 'create', playerName: hostName, roomType });
    if (data.playerId) this.setMyPlayerId(String(data.playerId));
    return (data.room as RoomState) ?? null;
  }

  public async joinRoom(roomId: string, playerName: string): Promise<{ room: RoomState | null; error?: string }> {
    // Sent so a refresh re-claims the seat this browser already holds instead of
    // burning another slot, or colliding with someone of the same name.
    const data = await this.post(roomId, {
      action: 'join',
      playerName,
      playerId: this.getMyPlayerId() ?? '',
    });
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

  // ── Teams ─────────────────────────────────────────────────────────────────

  public setTeamMode(roomId: string, teamMode: boolean) {
    return this.post(roomId, { action: 'set_team_mode', teamMode });
  }

  public setTeam(roomId: string, playerId: string, teamId: TeamId) {
    return this.post(roomId, { action: 'set_team', playerId, teamId });
  }

  public switchTeam(roomId: string, targetPlayerId: string, teamId: TeamId) {
    return this.post(roomId, { action: 'switch_team', targetPlayerId, teamId });
  }

  public teamBattleStartSeries(roomId: string, selectedGames: MiniGameId[]) {
    return this.post(roomId, { action: 'team_battle_start_series', selectedGames });
  }

  public teamBattleNextGame(roomId: string) {
    return this.post(roomId, { action: 'team_battle_next_game' });
  }

  public teamBattleScore(roomId: string, winnerTeam: TeamId) {
    return this.post(roomId, { action: 'team_battle_score', winnerTeam });
  }

  public balanceTeams(roomId: string) {
    return this.post(roomId, { action: 'balance_teams' });
  }

  /** Starts the match and deals the host their first mini-game. */
  public startMatch(roomId: string) {
    return this.post(roomId, { action: 'start_match' });
  }

  /** Finishing a mini-game banks points and sets the movement for the board. */
  public async completeMiniGame(roomId: string, game: MiniGameId, pointsEarned: number) {
    const ACTION: Record<MiniGameId, string> = {
      pitch_bird: 'complete_pitch_bird',
      solfege: 'complete_solfege',
      voice_arena: 'complete_voice_turn',
      spelling_bee: 'complete_voice_turn',
      truth_or_bluff: 'complete_truth_bluff',
      story_builder: 'complete_voice_turn',
      debate: 'complete_voice_turn',
      guess_the_voice: 'complete_voice_turn',
      trivia_showdown: 'complete_voice_turn',
      asteroid_defense: 'complete_voice_turn',
    };
    const data = await this.post(roomId, {
      action: ACTION[game] ?? 'complete_voice_turn',
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

  public submitTruthBluffClaims(roomId: string, playerId: string, claims: string[], lieIndex: number) {
    return this.post(roomId, { action: 'truth_bluff_submit_claims', playerId, claims, lieIndex });
  }

  public voteTruthBluff(roomId: string, playerId: string, voteIndex: number) {
    return this.post(roomId, { action: 'truth_bluff_vote', playerId, voteIndex });
  }

  public revealTruthBluff(roomId: string, playerId: string) {
    return this.post(roomId, { action: 'truth_bluff_reveal', playerId });
  }

  public submitStoryBuilder(roomId: string, playerId: string, sentence: string, phase?: string) {
    return this.post(roomId, { action: 'story_builder_submit', playerId, sentence, phase });
  }

  public voteStoryBuilder(roomId: string, voterId: string, votedPlayerId: string) {
    return this.post(roomId, { action: 'story_builder_vote', voterId, votedPlayerId });
  }

  public submitDebate(roomId: string, phase: string) {
    return this.post(roomId, { action: 'debate_submit', phase });
  }

  public voteDebate(roomId: string, voterId: string, vote: number) {
    return this.post(roomId, { action: 'debate_vote', voterId, vote });
  }

  public submitGuessVoice(roomId: string, audioBlobUrl?: string, phase?: string) {
    return this.post(roomId, { action: 'guess_voice_submit', audioBlobUrl, phase });
  }

  public voteGuessVoice(roomId: string, voterId: string, guessedPlayerId: string) {
    return this.post(roomId, { action: 'guess_voice_vote', voterId, guessedPlayerId });
  }

  /**
   * Reports what the performer is doing so spectators can follow along.
   *
   * Throttled and fire-and-forget: this runs from inside game loops, and a
   * dropped frame of spectator detail matters far less than stalling the game
   * that is producing it.
   *
   * The throttle is deliberately coarse. Each push rewrites the whole room
   * document and pushes a snapshot to every client, so this is the most
   * expensive thing the game does per second — and spectators only need the
   * gist of the attempt, not a frame-accurate mirror of it.
   */
  private lastLivePush = 0;
  private lastLiveBody = '';
  public pushLiveState(
    roomId: string,
    playerId: string,
    state: Omit<LiveMiniGameState, 'playerId' | 'game' | 'at'>,
    minIntervalMs = 1500
  ): void {
    const now = Date.now();
    if (now - this.lastLivePush < minIntervalMs) return;

    // Nothing spectators can see has changed — don't pay for a write.
    const body = JSON.stringify(state);
    if (body === this.lastLiveBody) return;

    this.lastLivePush = now;
    this.lastLiveBody = body;

    void fetch(`/api/room/${roomId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'push_live_state',
        token: this.getMyToken() ?? '',
        playerId,
        state,
      }),
    }).catch(() => {
      /* spectator detail is optional; never surface this */
    });
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
   * Best-effort "this tab is going away" ping, via sendBeacon because a normal
   * fetch is cancelled during unload.
   *
   * Marks the player away rather than removing them — `pagehide` also fires on
   * an ordinary refresh, and a reload must not eject somebody from their own
   * game. The next heartbeat undoes it; a real close leaves it standing and the
   * round skips them.
   */
  public markAwayOnUnload(roomId: string, playerId: string): void {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    try {
      navigator.sendBeacon(
        `/api/room/${roomId}`,
        new Blob(
          [JSON.stringify({ action: 'mark_away', token: this.getMyToken() ?? '', playerId })],
          { type: 'application/json' }
        )
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
      waitingForBranch: !!data.waitingForBranch,
      error: data.error,
    };
  }

  public resolveDare(roomId: string, targetPlayerId: string, passed: boolean) {
    return this.post(roomId, { action: 'resolve_dare', targetPlayerId, passed });
  }

  /** `targetPlayerId` is required by the offensive items; the server enforces it. */
  public usePowerup(roomId: string, powerupId: string, targetPlayerId?: string) {
    return this.post(roomId, { action: 'use_powerup', powerupId, targetPlayerId });
  }

  public advanceTurn(roomId: string) {
    return this.post(roomId, { action: 'advance_turn' });
  }
}

export const roomStore = new RoomStoreManager();
