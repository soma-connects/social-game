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
import { RoomVibeId } from './roomVibes';
import { LudoSetup } from './ludo/ludoTypes';
import { ChessSetup } from './chess/chessTypes';
import { KaraokeSetup } from './karaoke/karaokeTypes';
import { HangoutDeckId } from './hangout/hangoutTypes';
import { getIdToken } from './firebase/auth';
import { liveLink } from './liveLink';

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

  /**
   * Identity is stored per room, not globally.
   *
   * A single shared slot broke as soon as a browser touched two rooms: joining
   * the second overwrote the first room's credentials, and a request still in
   * flight to the old room came back 401 and wiped the session for the room the
   * player had just walked into. Keying by room also means going back to an
   * earlier room re-claims the same seat instead of creating a duplicate player.
   *
   * Callers that omit the room fall back to whichever room is being watched.
   */
  private roomKey(base: string, roomId?: string): string | null {
    const id = (roomId ?? this.currentRoomId)?.toUpperCase();
    return id ? `${base}_${id}` : null;
  }

  public getMyPlayerId(roomId?: string): string | null {
    if (typeof window === 'undefined') return null;
    const key = this.roomKey(MY_PLAYER_ID_KEY, roomId);
    return key ? localStorage.getItem(key) : null;
  }

  public setMyPlayerId(id: string, roomId?: string): void {
    if (typeof window === 'undefined') return;
    const key = this.roomKey(MY_PLAYER_ID_KEY, roomId);
    if (key) localStorage.setItem(key, id);
  }

  public getMyToken(roomId?: string): string | null {
    if (typeof window === 'undefined') return null;
    const key = this.roomKey(MY_TOKEN_KEY, roomId);
    return key ? localStorage.getItem(key) : null;
  }

  public setMyToken(token: string, roomId?: string): void {
    if (typeof window === 'undefined') return;
    const key = this.roomKey(MY_TOKEN_KEY, roomId);
    if (key) localStorage.setItem(key, token);
  }

  /** Forgets who this browser was in one room, so it offers a fresh join. */
  public clearSession(roomId?: string): void {
    if (typeof window === 'undefined') return;
    const idKey = this.roomKey(MY_PLAYER_ID_KEY, roomId);
    const tokenKey = this.roomKey(MY_TOKEN_KEY, roomId);
    if (idKey) localStorage.removeItem(idKey);
    if (tokenKey) localStorage.removeItem(tokenKey);
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
        // The token for THIS room, not whichever room was touched last.
        body: JSON.stringify({ token: this.getMyToken(roomId) ?? '', ...payload }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const error = (data as { error?: string }).error ?? `Request failed (${res.status})`;

        // The stored credential no longer matches any player in this room — it
        // was reset, or this is a session from before tokens existed. Clearing
        // it drops the UI back to the join screen instead of retrying forever
        // against an identity the server has never heard of. Scoped to the room
        // that rejected us, so a late reply from a room the player has already
        // left cannot log them out of the one they are in.
        if (res.status === 401 && (data as { code?: string }).code === 'no_session') {
          this.clearSession(roomId);
        }

        // A stale room's failure is not this room's problem either.
        if (roomId.toUpperCase() === (this.currentRoomId ?? '').toUpperCase()) {
          this.emit({ status: res.status === 404 ? 'missing' : 'error', error });
        }
        return { error };
      }

      if (typeof data.token === 'string') this.setMyToken(data.token, roomId);

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
    const data = await this.post(roomId, {
      action: 'create',
      playerName: hostName,
      roomType,
      // Durable identity, so this match ends up in the host's permanent record.
      // Null when auth is unavailable, which the server treats as anonymous.
      idToken: await getIdToken(),
    });
    if (data.playerId) this.setMyPlayerId(String(data.playerId), roomId);
    return (data.room as RoomState) ?? null;
  }

  public async joinRoom(roomId: string, playerName: string): Promise<{ room: RoomState | null; error?: string }> {
    // Sent so a refresh re-claims the seat this browser already holds instead of
    // burning another slot, or colliding with someone of the same name.
    const data = await this.post(roomId, {
      action: 'join',
      playerName,
      playerId: this.getMyPlayerId(roomId) ?? '',
      idToken: await getIdToken(),
    });
    if (data.error) return { room: null, error: data.error };
    if (data.playerId) this.setMyPlayerId(String(data.playerId), roomId);
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

  public setRoomVibe(roomId: string, roomVibe: RoomVibeId) {
    return this.post(roomId, { action: 'update_room_vibe', roomVibe });
  }

  // ── AI Master game ────────────────────────────────────────────────────────

  public startAiMaster(roomId: string) {
    return this.post(roomId, { action: 'ai_master_start' });
  }

  public aiMasterRespond(roomId: string, response: string) {
    return this.post(roomId, { action: 'ai_master_respond', response });
  }

  public aiMasterVote(roomId: string, verdict: 'pass' | 'fail') {
    return this.post(roomId, { action: 'ai_master_vote', verdict });
  }

  public aiMasterVerdict(roomId: string) {
    return this.post(roomId, { action: 'ai_master_verdict' });
  }

  public aiMasterNextRound(roomId: string) {
    return this.post(roomId, { action: 'ai_master_next_round' });
  }

  public aiMasterBribe(roomId: string, amount: number, ask: 'skip' | 'life' | 'redirect') {
    return this.post(roomId, { action: 'ai_master_bribe', amount, ask });
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

  /** Starts the game the series is sitting on. Host only. */
  public teamBattleBeginGame(roomId: string) {
    return this.post(roomId, { action: 'team_battle_begin_game' });
  }


  public balanceTeams(roomId: string) {
    return this.post(roomId, { action: 'balance_teams' });
  }

  /** Starts the match and deals the host their first mini-game. */
  /** Abandons the current match and puts everyone back in the lobby. Host only. */
  public endMatch(roomId: string) {
    return this.post(roomId, { action: 'end_match' });
  }

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

  public startChessMatch(roomId: string, setup: ChessSetup) {
    return this.post(roomId, {
      action: 'chess_start_match',
      mode: setup.mode,
      timeControl: setup.timeControl,
      botDifficulty: setup.botDifficulty,
      humanColor: setup.humanColor,
    });
  }

  /** Replays the same line-up with the colours swapped. */
  public chessRematch(roomId: string) {
    return this.post(roomId, { action: 'chess_rematch' });
  }

  public makeChessMove(roomId: string, playerId: string, from: string, to: string, promotion?: string) {
    return this.post(roomId, { action: 'chess_make_move', playerId, from, to, promotion });
  }

  /**
   * Submits a computer move.
   *
   * `expectedPly` is the position the engine actually thought about. Whoever
   * drives the bots can change hands mid-game, and this is what stops the
   * incoming client from replaying a move for a position that has moved on.
   */
  public makeChessBotMove(
    roomId: string,
    from: string,
    to: string,
    promotion: string | undefined,
    expectedPly: number
  ) {
    return this.post(roomId, { action: 'chess_make_move', from, to, promotion, expectedPly });
  }

  /** A computer teammate's suggestion for its human partner in 2v2. */
  public proposeChessBotMove(
    roomId: string,
    from: string,
    to: string,
    san: string | undefined,
    promotion: string | undefined,
    expectedPly: number
  ) {
    return this.post(roomId, { action: 'chess_bot_propose', from, to, san, promotion, expectedPly });
  }

  public proposeChessMove(roomId: string, playerId: string, from: string, to: string, san?: string, promotion?: string) {
    return this.post(roomId, { action: 'chess_propose_move', playerId, from, to, san, promotion });
  }

  /** Reports that the side to move ran out of time. The server re-checks it. */
  public chessTimeout(roomId: string) {
    return this.post(roomId, { action: 'chess_timeout' });
  }

  /** Withdraws a 2v2 move suggestion. */
  public clearChessProposal(roomId: string, playerId: string) {
    return this.post(roomId, { action: 'chess_clear_proposal', playerId });
  }

  public resignChess(roomId: string, playerId: string) {
    return this.post(roomId, { action: 'chess_resign', playerId });
  }

  // ── Karaoke Stage ─────────────────────────────────────────────────────────

  public startKaraoke(roomId: string, setup: KaraokeSetup) {
    return this.post(roomId, {
      action: 'karaoke_start',
      setlist: setup.setlist,
      order: setup.order,
    });
  }

  /**
   * Posts a finished performance.
   *
   * Scored in the browser because that is where the microphone is — a pitch
   * trace is sixty samples a second and shipping it would cost more traffic
   * than the rest of the game put together. `seq` names the turn it belongs
   * to, so a retry cannot score the same song twice.
   */
  public submitKaraokePerformance(
    roomId: string,
    performance: {
      seq: number;
      songId: string;
      accuracy: number;
      notesHit: number;
      notesTotal: number;
      bestStreak: number;
      points: number;
      grade: string;
      verdict: string;
    }
  ) {
    return this.post(roomId, { action: 'karaoke_submit', ...performance });
  }

  /** A reaction to the performance on screen. Worth points to the singer. */
  public cheerKaraoke(roomId: string, reaction: SocialReactionId) {
    return this.post(roomId, { action: 'karaoke_cheer', reaction });
  }

  public karaokeNext(roomId: string) {
    return this.post(roomId, { action: 'karaoke_next' });
  }

  public karaokeEncore(roomId: string) {
    return this.post(roomId, { action: 'karaoke_encore' });
  }

  // ── Hangout Lounge ────────────────────────────────────────────────────────

  public openHangout(roomId: string, spotlightSeconds = 60) {
    return this.post(roomId, { action: 'hangout_open', spotlightSeconds });
  }

  public hangoutTakeMic(roomId: string) {
    return this.post(roomId, { action: 'hangout_take_mic' });
  }

  public hangoutPassMic(roomId: string, targetId: string) {
    return this.post(roomId, { action: 'hangout_pass_mic', targetId });
  }

  public hangoutDropMic(roomId: string) {
    return this.post(roomId, { action: 'hangout_drop_mic' });
  }

  /** `text` is only used by the AI deck, which is written in the browser. */
  public hangoutDraw(roomId: string, deck: HangoutDeckId, text?: string) {
    return this.post(roomId, { action: 'hangout_draw', deck, text });
  }

  public hangoutSound(roomId: string, padId: string) {
    return this.post(roomId, { action: 'hangout_sound', padId });
  }

  public hangoutReact(roomId: string, reaction: SocialReactionId) {
    return this.post(roomId, { action: 'hangout_react', reaction });
  }

  public startLudoMatch(roomId: string, setup?: LudoSetup) {
    return this.post(roomId, {
      action: 'ludo_start_match',
      seatCount: setup?.seatCount ?? 4,
      seatKinds: setup?.seatKinds,
      botSkill: setup?.botSkill ?? 'normal',
    });
  }

  /** Replays the same lineup on a fresh board. */
  public ludoRematch(roomId: string) {
    return this.post(roomId, { action: 'ludo_rematch' });
  }

  public rollLudoDice(roomId: string) {
    return this.post(roomId, { action: 'ludo_roll_dice' });
  }

  public moveLudoToken(roomId: string, tokenId: number) {
    return this.post(roomId, { action: 'ludo_move_token', tokenId });
  }

  /**
   * Plays one step of a computer seat's turn.
   *
   * `seq` names the turn the caller is acting on. Every browser in the room
   * sees the computer's turn arrive at the same instant and every one of them
   * sends this; the sequence number is what makes the extra copies harmless.
   */
  public ludoBotStep(roomId: string, seq: number) {
    return this.post(roomId, { action: 'ludo_bot_step', seq });
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

    // The peer mesh gets it first, and gets it every time.
    //
    // This is what makes the room able to actually watch somebody play. The
    // write below is rate-limited to something a shared Firestore document can
    // survive, which is nowhere near fast enough to follow a game — but a data
    // channel already open to everybody costs nothing per frame, so the same
    // call feeds both and liveLink decides how often to put one on the wire.
    liveLink.send({
      game: this.snapshot.room?.currentMiniGame ?? 'other',
      prompt: state.prompt,
      detail: state.detail,
      status: state.status,
      score: state.score,
      progress: state.progress,
      good: state.good,
    });

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
