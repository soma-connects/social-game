// Live group voice over WebRTC.
//
// Topology is a full mesh: with the 6-player cap that is up to 5 peer
// connections per player, each carrying one ~30 kbps Opus stream out — within
// what a phone on 3G can send. An SFU would only be worth it past that.
//
// Signalling rides the REST relay in /api/room/[roomId]/signal. To avoid glare,
// which side makes the offer is decided by comparing player ids rather than by
// racing — the lower id always offers.

import { micStream, MicError } from './micStream';

const SIGNAL_POLL_MS = 1000;

/** How often to measure whether outbound audio is actually moving, per peer. */
const OUTBOUND_CHECK_MS = 4000;

/**
 * Last-resort ICE config.
 *
 * The real list comes from /api/ice, which adds a TURN relay. STUN alone only
 * discovers a browser's public address — it cannot carry audio — so a peer
 * behind symmetric NAT has no path at all. That is normal on mobile carrier
 * networks, and it made one player inaudible to an otherwise healthy room.
 */
const FALLBACK_STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export type VoiceStatus = 'off' | 'connecting' | 'live' | 'error';

export interface PeerState {
  playerId: string;
  connection: RTCPeerConnectionState;
  /** True while this peer is above the speaking threshold. */
  speaking: boolean;
  /** They muted themselves, or we have no audio from them yet. */
  silent: boolean;
  /** 'relay' means the audio is going through TURN, 'direct' peer-to-peer. */
  route?: 'direct' | 'relay';
  /** ICE could find no working path to this player. */
  failed?: boolean;
  /** Undefined until first measured. False means connected but no bytes are moving out. */
  sendingAudio?: boolean;
}

export interface VoiceState {
  status: VoiceStatus;
  muted: boolean;
  error: string | null;
  peers: PeerState[];
  /** True while the local player is above the speaking threshold. */
  speaking: boolean;
  /**
   * Set when the browser refused to play incoming audio.
   *
   * Autoplay policy blocks media until the page has been interacted with. The
   * call itself connects perfectly — tracks arrive, ICE completes, everything
   * reports healthy — and the player simply hears nothing. It is invisible from
   * every other signal, so the UI has to be told about it explicitly.
   */
  audioBlocked: boolean;
}

// `session` identifies one RTCPeerConnection instance, and `offerId` one offer
// made on it. Both are optional on the wire so a client still running the old
// build keeps working against a new one.
type SignalMessage =
  | { kind: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit; session?: string; offerId?: string }
  | { kind: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit; session?: string; offerId?: string }
  | { kind: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit; session?: string }
  | { kind: 'bye'; from: string; to: string }
  | { kind: 'reset'; from: string; to: string };

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  /**
   * Side channel for live gameplay frames — the bird's height, the score
   * ticking up — so the room watches the attempt instead of a number that
   * refreshes every second and a half. Rides the connection that already
   * carries the voice, so it costs no server and no extra handshake.
   *
   * Never allowed to affect audio: every use is wrapped, and a channel that
   * fails to open simply means the room falls back to the slow path.
   */
  channel?: RTCDataChannel;
  /** Remote audio, kept so listeners can record the performer for the replay. */
  stream: MediaStream | null;
  analyser: AnalyserNode | null;
  speaking: boolean;
  /** Candidates that arrived before the remote description was set. */
  pendingCandidates: { candidate: RTCIceCandidateInit; session?: string }[];
  remoteDescriptionSet: boolean;
  /** Identifies this RTCPeerConnection, so the other side can tell a rebuilt one from a renegotiation. */
  session: string;
  /** The other side's connection id, once known. A different one means they rebuilt. */
  remoteSession?: string;
  /** The offer we are waiting on an answer for; answers to anything older are stale. */
  pendingOfferId?: string;
  offerCount: number;
  createdAt: number;
  /** When this side last asked the offerer to start over. */
  lastResetRequestAt?: number;
  /** When the offerer last rebuilt this connection on request, to stop a reset storm. */
  lastResetAt?: number;
  failedAt?: number;
  /** Timer that promotes a lingering 'disconnected' to failed. */
  disconnectTimer?: ReturnType<typeof setTimeout>;
  /** How the media actually travels, once connected. Diagnostics only. */
  route?: 'direct' | 'relay';
  /** True once ICE gave up on this peer. */
  failed?: boolean;
  /**
   * When this side last sent an offer, so a connection that never completed can
   * be retried instead of sitting half-open forever.
   */
  lastOfferAt?: number;
  /** Consecutive polls this peer has been missing from the call roster. */
  missedPresence: number;
  /** outbound-rtp bytesSent as of the last stats check, to detect real growth. */
  lastOutboundBytes?: number;
  /**
   * Whether bytes actually left this device for this peer since the last check.
   *
   * `connected` and `mute` both looked fine while a room reported total silence
   * from one player, with nothing in the existing signals able to tell the two
   * apart — a mesh where ICE, tracks and mute state all read healthy is not
   * proof that a single byte of audio ever left the device. Undefined until the
   * first check completes, so the UI can tell "not yet measured" from "measured
   * and it is not moving".
   */
  sendingAudio?: boolean;
}

/**
 * Polls a peer may be absent from the call roster before being torn down.
 *
 * Presence is a 6s server-side window refreshed by each poll, so a single
 * missed or slow request is normal and must not drop a working call. Five polls
 * is comfortably longer than any hiccup and still clears a peer who really left
 * within a few seconds.
 */
const PRESENCE_GRACE_POLLS = 5;

/**
 * How long to wait before re-sending an offer that produced no answer.
 *
 * Longer than one full signalling round trip on a slow mobile network — two
 * polls plus two POSTs to a server in another continent. At 4s a re-offer
 * regularly went out while the first answer was still in flight, and the two
 * handshakes tripped over each other.
 */
const OFFER_RETRY_MS = 8000;
/** A connection 'disconnected' this long is treated as failed and restarted. */
const DISCONNECT_GRACE_MS = 5000;
/**
 * How long the answering side waits for an offer, or sits on a failed
 * connection, before asking the offerer to rebuild from scratch.
 */
const RESET_AFTER_MS = 6000;

const SPEAKING_THRESHOLD = 12;

class VoiceChatManager {
  private roomId: string | null = null;
  private myId: string | null = null;

  private peers = new Map<string, Peer>();
  private frameHandlers = new Set<(payload: string) => void>();
  /** Everyone in the room. Bounds who may become a peer; does not select them. */
  private roomMemberIds = new Set<string>();
  private localStream: MediaStream | null = null;
  private unsubscribeStream: (() => void) | null = null;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private outboundCheckTimer: ReturnType<typeof setInterval> | null = null;
  private levelFrame: number | null = null;
  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSpeaking = false;

  private status: VoiceStatus = 'off';
  private error: string | null = null;
  /** Remote playback gain. Ducked while the voice arena is listening. */
  private remoteVolume = 1;

  /**
   * Peers this viewer has muted or blocked.
   *
   * Held here rather than checked at each playback site because several code
   * paths set `audio.muted = false` on their own — a reconnect, an unlock after
   * autoplay was refused, a track arriving late. Any of those would quietly
   * un-mute somebody the viewer silenced, so every one of them goes through
   * applyAudioGate instead of touching `muted` directly.
   */
  private silenced = new Set<string>();

  /**
   * Private rooms default to consenting, which is today's behaviour unchanged.
   * Public rooms set it false until the player opts in.
   */
  private micConsent = true;
  /** True once the browser has refused to play a peer's audio. */
  private audioBlocked = false;
  /**
   * True while the app (not the player) is the reason the mic is muted.
   *
   * Lived as a useRef inside VoiceCallBar until it was moved here: a ref is
   * scoped to one component instance, but the mute flag it was guarding lives
   * on the shared micStream singleton. Any remount of that component forgot
   * the app had muted anyone, and nothing was then able to unmute it again —
   * the flag and the state it tracks have to share a lifetime.
   */
  private autoMuted = false;

  /** Relay configuration from /api/ice, cached until its credentials expire. */
  private iceServers: RTCIceServer[] = [];
  private iceExpiresAt = 0;
  private hasRelay = false;
  private iceProvider = 'unknown';
  /** Removes the "unlock on next interaction" listeners once audio is running. */
  private releaseAudioUnlock: (() => void) | null = null;

  private listeners = new Set<(state: VoiceState) => void>();

  // ------------------------------------------------------------------ state

  public subscribe(cb: (state: VoiceState) => void): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => {
      this.listeners.delete(cb);
    };
  }

  public getState(): VoiceState {
    return {
      status: this.status,
      muted: micStream.isMuted(),
      error: this.error,
      speaking: this.localSpeaking && !micStream.isMuted(),
      audioBlocked: this.audioBlocked,
      peers: [...this.peers.values()].map((peer) => ({
        playerId: peer.id,
        connection: peer.pc.connectionState,
        speaking: peer.speaking,
        silent: !peer.speaking,
        route: peer.route,
        failed: peer.failed,
        sendingAudio: peer.sendingAudio,
      })),
    };
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((cb) => cb(state));
  }

  public isJoined(): boolean {
    return this.status !== 'off';
  }

  /**
   * Closes or restores this player's mic for a reason the app decided, not the
   * player — e.g. everyone but the performer during an attempt.
   *
   * Never overrides a mute the player chose themselves: this only unmutes when
   * `autoMuted` shows the app was the one holding it closed.
   */
  public applyAutoMute(shouldMute: boolean): void {
    if (!this.isJoined()) return;
    if (shouldMute && !micStream.isMuted()) {
      micStream.setMuted(true);
      this.autoMuted = true;
    } else if (!shouldMute && this.autoMuted) {
      // Consent outranks the round.
      //
      // Without this check a player who closed their mic *during* a scored
      // round gets re-opened the moment the round ends: the auto-mute released
      // is the one it took, and it has no idea the person withdrew in between.
      // That is the one un-mute nobody asked for.
      if (!this.micConsent) {
        this.autoMuted = false;
        return;
      }
      micStream.setMuted(false);
      this.autoMuted = false;
    }
  }

  /**
   * Whether this player has agreed to transmit at all.
   *
   * Held here rather than in the component because it is an invariant over the
   * microphone, and several things move that microphone — the round's auto-mute,
   * a reconnect, the mute button. Any of them re-opening a mic in a room the
   * player never agreed to talk in is the failure this exists to prevent, so
   * they all have to answer to one flag.
   */
  public setMicConsent(allowed: boolean): void {
    this.micConsent = allowed;
    if (allowed) return;

    // Withdrawing closes the mic now, and clears the auto-mute bookkeeping so
    // the end of the round cannot re-open it.
    this.autoMuted = false;
    if (this.isJoined()) {
      micStream.setMuted(true);
      this.emit();
    }
  }

  public hasMicConsent(): boolean {
    return this.micConsent;
  }

  // ----------------------------------------------------------------- ICE

  /**
   * Loads relay configuration from the server.
   *
   * Cached for the lifetime the provider gives us, because ephemeral TURN
   * credentials expire and a call that outlives them would fail to reconnect a
   * peer joining late.
   *
   * Failure is deliberately non-fatal: STUN alone still works for players on
   * ordinary home networks, so a provider outage degrades voice rather than
   * removing it.
   */
  private async loadIceConfig(): Promise<void> {
    if (this.iceServers.length > 0 && Date.now() < this.iceExpiresAt) return;

    try {
      const res = await fetch('/api/ice');
      if (!res.ok) throw new Error(`ICE config request failed: ${res.status}`);
      const data = (await res.json()) as {
        iceServers: RTCIceServer[];
        hasRelay: boolean;
        provider: string;
        ttl: number;
      };

      this.iceServers = data.iceServers ?? FALLBACK_STUN;
      this.hasRelay = !!data.hasRelay;
      this.iceProvider = data.provider ?? 'unknown';
      this.iceExpiresAt = Date.now() + (data.ttl ?? 600) * 1000;

      if (!this.hasRelay) {
        console.warn(
          'Voice chat has no TURN relay configured. Players behind symmetric NAT — which is normal on mobile networks — will be inaudible. Set TURN_URLS/TURN_USERNAME/TURN_CREDENTIAL, or Twilio/Cloudflare credentials, on the server.'
        );
      }
    } catch (error) {
      console.error('Falling back to STUN-only ICE config:', error);
      this.iceServers = FALLBACK_STUN;
      this.hasRelay = false;
      this.iceProvider = 'stun-only';
      this.iceExpiresAt = Date.now() + 60_000;
    }
  }

  /**
   * Reports how a peer actually connected.
   *
   * The distinction that matters is host/srflx (a direct path) versus relay
   * (through TURN). When somebody is silent, this is the difference between "the
   * relay is missing" and "something else is wrong" — which is exactly the
   * question that took three attempts to answer by guesswork.
   */
  private async recordConnectionRoute(peer: Peer): Promise<void> {
    try {
      const stats = await peer.pc.getStats();
      let localType = '';
      let remoteType = '';

      stats.forEach((report: any) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
          const local = stats.get(report.localCandidateId) as any;
          const remote = stats.get(report.remoteCandidateId) as any;
          if (local) localType = local.candidateType ?? '';
          if (remote) remoteType = remote.candidateType ?? '';
        }
      });

      if (!localType && !remoteType) return;
      peer.route = localType === 'relay' || remoteType === 'relay' ? 'relay' : 'direct';
      this.emit();
    } catch {
      /* stats are diagnostics only; never let them break a working call */
    }
  }

  /**
   * Checks whether this device is actually transmitting audio to each peer.
   *
   * Every other signal in this file can read healthy while one player is
   * completely silent to the room: ICE connects, the sender exists, the mute
   * button says unmuted, and still nothing arrives on the other end. bytesSent
   * on the outbound-rtp report is the one number that cannot lie about that —
   * it only grows when media is actually leaving the device, muted or not.
   * Comparing it between two polls turns "did they hear me" from a guess into
   * a measurement, for every peer at once, reusing a getStats() call that was
   * already being made for the route diagnostic.
   */
  private async checkOutboundAudio(): Promise<void> {
    let changed = false;

    await Promise.all(
      [...this.peers.values()].map(async (peer) => {
        if (peer.pc.connectionState !== 'connected') return;
        try {
          const stats = await peer.pc.getStats();
          let bytesSent: number | null = null;
          stats.forEach((report: any) => {
            if (report.type === 'outbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
              bytesSent = report.bytesSent ?? 0;
            }
          });
          if (bytesSent === null) return;

          const wasSending = peer.sendingAudio;
          peer.sendingAudio = peer.lastOutboundBytes !== undefined && bytesSent > peer.lastOutboundBytes;
          peer.lastOutboundBytes = bytesSent;
          if (peer.sendingAudio !== wasSending) changed = true;
        } catch {
          /* diagnostics only */
        }
      })
    );

    if (changed) this.emit();
  }

  // ------------------------------------------------------------- join/leave

  public async join(roomId: string, myPlayerId: string, peerIds: string[]): Promise<MicError | null> {
    if (this.roomId === roomId && this.myId === myPlayerId && this.status !== 'off') {
      this.syncPeers(peerIds);
      return null;
    }

    this.roomId = roomId;
    this.myId = myPlayerId;
    this.status = 'connecting';
    this.error = null;
    this.emit();

    const { stream, error } = await micStream.acquire();
    if (error || !stream) {
      this.status = 'error';
      this.error = error?.message ?? 'The microphone could not start.';
      this.emit();
      return error;
    }

    this.localStream = stream;
    // Tells the speech recogniser it must not take the microphone away.
    micStream.setCallActive(true);
    this.startLevelMeter();

    // Fetched before any peer is created: a connection built with STUN-only
    // config cannot be upgraded to use a relay afterwards, it has to be made
    // with the relay already in hand.
    await this.loadIceConfig();

    // On a phone the mic is handed to the speech recogniser during a mini-game
    // and given back afterwards. Peer connections outlive that, so the track on
    // each sender has to be swapped rather than the call torn down — otherwise
    // everyone hears silence from this player for the rest of the session.
    this.unsubscribeStream?.();
    this.unsubscribeStream = micStream.onStreamChange((next) => this.onLocalStreamChanged(next));

    this.pollTimer = setInterval(() => void this.pollSignals(), SIGNAL_POLL_MS);
    void this.pollSignals();

    this.outboundCheckTimer = setInterval(() => void this.checkOutboundAudio(), OUTBOUND_CHECK_MS);

    this.syncPeers(peerIds);
    this.status = 'live';
    this.emit();
    return null;
  }

  /**
   * Swaps the outgoing audio track when the shared microphone is suspended for
   * the speech recogniser and later restored.
   *
   * `replaceTrack` is the whole point: it changes what a sender transmits
   * without renegotiating, so nobody has to re-offer and the call does not
   * flicker for the other five players.
   */
  private onLocalStreamChanged(next: MediaStream | null): void {
    this.localStream = next;
    const track = next?.getAudioTracks()[0] ?? null;

    this.peers.forEach((peer) => {
      // Found via the transceiver rather than by inspecting sender.track, which
      // is null exactly when the mic is suspended — the moment this matters.
      const sender = peer.pc
        ?.getTransceivers()
        .find((t) => t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio')
        ?.sender
        ?? peer.pc?.getSenders()[0];

      if (!sender) return;
      sender.replaceTrack(track).catch(() => {
        /* the connection is going away anyway */
      });
    });

    // The level meter is bound to the old stream, so rebuild it against the new
    // one — otherwise the player's own bar sits at zero after a mini-game.
    if (next) this.startLevelMeter();
  }

  public leave(): void {
    this.unsubscribeStream?.();
    this.unsubscribeStream = null;
    this.releaseAudioUnlock?.();
    this.audioBlocked = false;
    micStream.setCallActive(false);

    // An app-held mute must not outlive the call that justified it — otherwise
    // the shared mic sits disabled for whatever uses it next, with nothing
    // left that knows to undo it. A mute the player chose is left alone.
    if (this.autoMuted) {
      micStream.setMuted(false);
      this.autoMuted = false;
    }

    if (this.roomId && this.myId) {
      // Best effort — the peers also notice via connection state.
      void this.post({ action: 'leave', playerId: this.myId });
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.outboundCheckTimer) {
      clearInterval(this.outboundCheckTimer);
      this.outboundCheckTimer = null;
    }
    if (this.levelFrame !== null) {
      cancelAnimationFrame(this.levelFrame);
      this.levelFrame = null;
    }

    this.peers.forEach((peer) => this.destroyPeer(peer));
    this.peers.clear();

    this.localAnalyser = null;
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    if (this.localStream) {
      micStream.release();
      this.localStream = null;
    }

    this.roomId = null;
    this.myId = null;
    this.status = 'off';
    this.localSpeaking = false;
    this.emit();
  }

  public setMuted(muted: boolean): boolean {
    const result = micStream.setMuted(muted);
    this.emit();
    return result;
  }

  public toggleMuted(): boolean {
    return this.setMuted(!micStream.isMuted());
  }

  /**
   * Lowers everyone else while the local player is being scored, so the speech
   * recogniser hears them rather than the room.
   */
  /**
   * The live audio arriving from one peer.
   *
   * Listeners record this to build their own copy of the performer's attempt,
   * so the replay works without shipping audio anywhere — everyone captures
   * what they already heard.
   */
  public getRemoteStream(playerId: string): MediaStream | null {
    return this.peers.get(playerId)?.stream ?? null;
  }

  public setRemoteVolume(volume: number): void {
    this.remoteVolume = Math.min(1, Math.max(0, volume));
    this.peers.forEach((peer) => this.applyAudioGate(peer));
  }

  /**
   * Replaces the set of peers this viewer refuses to hear.
   *
   * Takes the whole set rather than one id at a time so it can be driven
   * straight from the mute/block lists on every render without the caller
   * tracking what changed.
   */
  public setSilencedPeers(playerIds: string[]): void {
    this.silenced = new Set(playerIds);
    this.peers.forEach((peer) => this.applyAudioGate(peer));
  }

  /**
   * The single place a peer's audibility is decided.
   *
   * Both `muted` and `volume` are set: muted alone is enough on every browser
   * that honours it, and the zeroed volume means a stray `muted = false`
   * elsewhere still cannot make a blocked player audible.
   */
  private applyAudioGate(peer: Peer): void {
    const silenced = this.silenced.has(peer.id);
    peer.audio.muted = silenced;
    peer.audio.volume = silenced ? 0 : this.remoteVolume;
  }

  // ----------------------------------------------------------------- peers

  /** Opens connections to new players and drops ones who left. */
  /**
   * Records who is in the ROOM. Being in the room is not being on the call.
   *
   * This used to build a peer connection for every player in the room, which is
   * where the call actually broke. Someone sitting in the lobby with the call
   * closed got an offer they were never going to answer, and — because a peer
   * object now existed for them — the reconnect below never fired either. Who
   * is genuinely on the call comes from the server's presence list instead;
   * this only bounds it, so a stale roster can never invent a peer.
   */
  public syncPeers(peerIds: string[]): void {
    this.roomMemberIds = new Set(peerIds);
    if (this.myId || this.status !== 'off') this.emit();
  }

  /**
   * Reconciles peer connections against the players actually on the call.
   *
   * Driven by the server's presence list, refreshed every poll. That makes join
   * order irrelevant: whoever arrives second shows up in the other's next poll
   * and the connection is built then, rather than depending on who happened to
   * press the button first.
   *
   * The offer rule is unchanged — lower id offers, so both sides agree on who
   * goes first without negotiating and there is no collision to recover from.
   * What is new is that it can offer AGAIN. Previously an offer was only ever
   * sent at the instant a peer object was created, so any offer that was missed
   * — sent while the other side was not yet polling, or expired by the signal
   * TTL — left both sides waiting on each other permanently: the offerer would
   * not re-offer because the peer already existed, and the answerer would not
   * offer at all because of the id rule. That deadlock is what produced a call
   * where one person could be heard and the other could not.
   */
  private reconcilePeers(presentIds: string[]): void {
    if (!this.myId || this.status === 'off') return;

    const onCall = new Set(
      presentIds.filter((id) => id !== this.myId && this.roomMemberIds.has(id))
    );

    // Drop peers who have left the call, but only after a grace period — a
    // single slow poll must not tear down a working connection.
    this.peers.forEach((peer, id) => {
      if (onCall.has(id)) {
        peer.missedPresence = 0;
        return;
      }
      peer.missedPresence += 1;
      if (peer.missedPresence >= PRESENCE_GRACE_POLLS) {
        this.destroyPeer(peer);
        this.peers.delete(id);
      }
    });

    const now = Date.now();
    onCall.forEach((id) => {
      let peer = this.peers.get(id);
      if (!peer) peer = this.createPeer(id);

      // Only the lower id offers; the other side waits and answers.
      if (this.myId! >= id) {
        this.maybeRequestReset(peer, now);
        return;
      }

      // Re-offer while the handshake has not completed. remoteDescriptionSet is
      // the honest signal that the other side actually answered — connection
      // state can still be 'new' long after a successful exchange.
      const answered = peer.remoteDescriptionSet && !peer.failed;
      if (answered) return;

      // An explicit "never offered" check rather than treating a missing
      // timestamp as 0. The subtraction would happen to work with a real clock,
      // but only because Date.now() dwarfs the retry window — which is
      // accidental, not a property worth depending on.
      const neverOffered = peer.lastOfferAt === undefined;
      if (!neverOffered && now - peer.lastOfferAt! < OFFER_RETRY_MS) return;

      peer.lastOfferAt = now;
      void this.makeOffer(peer, peer.failed === true);
    });

    this.emit();
  }

  /**
   * Lets the answering side get out of a stuck call.
   *
   * Only the lower id may offer, so the higher id had no move of its own when
   * a handshake stalled — after it reloaded, say, while the offerer still held
   * a connection it believed healthy, the pair sat silent until ICE consent
   * finally expired half a minute later. Asking the offerer to rebuild is the
   * one thing this side can do, and it is rate-limited so two confused peers
   * cannot bounce resets off each other.
   */
  private maybeRequestReset(peer: Peer, now: number): void {
    if (!this.myId) return;
    const waitingForOffer = !peer.remoteDescriptionSet && now - peer.createdAt > RESET_AFTER_MS;
    const stuckFailed = !!peer.failed && !!peer.failedAt && now - peer.failedAt > RESET_AFTER_MS;
    if (!waitingForOffer && !stuckFailed) return;
    if (peer.lastResetRequestAt !== undefined && now - peer.lastResetRequestAt < RESET_AFTER_MS * 2) return;

    peer.lastResetRequestAt = now;
    void this.send({ kind: 'reset', from: this.myId, to: peer.id });
  }

  /** Throws away a peer connection and builds a fresh one in its place. */
  private rebuildPeer(peerId: string): Peer {
    const old = this.peers.get(peerId);
    if (old) {
      this.destroyPeer(old);
      this.peers.delete(peerId);
    }
    return this.createPeer(peerId);
  }

  private createPeer(peerId: string): Peer {
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers.length > 0 ? this.iceServers : FALLBACK_STUN,
    });

    const audio = typeof window !== 'undefined' ? new Audio() : ({} as HTMLAudioElement);
    if (audio.style) {
      // Seeded from the silence set rather than defaulted to audible: a peer
      // blocked before they ever connected would otherwise be briefly hearable
      // between the element being created and the first track arriving.
      const silenced = this.silenced.has(peerId);
      audio.autoplay = true;
      audio.volume = silenced ? 0 : this.remoteVolume;
      audio.muted = silenced;
      audio.defaultMuted = silenced;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      (audio as any).playsInline = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
    }

    const peer: Peer = {
      id: peerId,
      pc,
      audio,
      stream: null,
      analyser: null,
      speaking: false,
      pendingCandidates: [],
      remoteDescriptionSet: false,
      missedPresence: 0,
      session: newSessionId(),
      offerCount: 0,
      createdAt: Date.now(),
    };

    // The lower id offers (see connect above), so that side opens the channel
    // and the other picks it up. Creating it here rather than later keeps it in
    // the first offer, so there is no renegotiation.
    try {
      if (this.myId && this.myId < peerId) {
        // Unreliable and unordered, deliberately: a dropped frame of a moving
        // bird is worth nothing a moment later, and waiting to retransmit it
        // would delay the frames that still matter.
        this.attachChannel(peer, pc.createDataChannel('live', { ordered: false, maxRetransmits: 0 }));
      }
      pc.ondatachannel = (event) => this.attachChannel(peer, event.channel);
    } catch {
      // No channel: the room still gets the slow Firestore path.
    }

    /**
     * Always create the outgoing audio sender, even with no track to put in it.
     *
     * This used to be `localStream?.getAudioTracks().forEach(addTrack)`, which
     * adds nothing when there is no local stream — and there is no local stream
     * for the whole time the microphone is suspended for speech recognition. A
     * peer connected during that window ended up with no sender at all, so the
     * later replaceTrack had nothing to attach to and that player was silent to
     * them for the rest of the session, with no error anywhere.
     *
     * A transceiver guarantees the sender exists up front, so restoring the mic
     * is always just a replaceTrack.
     */
    //
    // Only on the OFFERING side, though. A browser never pairs a transceiver
    // made with addTransceiver() with an m-line in an incoming offer — setting
    // the remote offer creates a second, receive-only transceiver instead. When
    // both sides pre-made one, the answerer's microphone sat in an orphaned
    // transceiver that was never negotiated, and the answer went out
    // recvonly: in every pair, whoever answered was never heard, while both
    // ends reported "connected". The answering side attaches its microphone
    // to the offer's own transceiver in attachLocalAudio instead.
    if (this.myId && this.myId < peerId) {
      const track = this.localStream?.getAudioTracks()[0] ?? null;
      const transceiver = pc.addTransceiver('audio', {
        direction: 'sendrecv',
        streams: this.localStream ? [this.localStream] : [],
      });
      if (track) void transceiver.sender.replaceTrack(track).catch(() => {});
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.myId) {
        void this.send({
          kind: 'ice',
          from: this.myId,
          to: peerId,
          candidate: event.candidate.toJSON(),
          session: peer.session,
        });
      }
    };

    pc.ontrack = (event) => {
      // A sender created while this side's mic was suspended carries no
      // stream, so the track arrives with `streams` empty. Returning here — as
      // this used to — left that player silent to us for the whole session.
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      peer.stream = stream;
      audio.srcObject = stream;
      this.applyAudioGate(peer);
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[VoiceChat] Peer audio playback pending user gesture:', err);
          this.markAudioBlocked();
        });
      }
      // On mobile devices, connecting a remote MediaStream to Web Audio Analyser
      // can cause WebKit/Android to route audio to null destination and silence the audio tag.
      // We only attach Web Audio analyser on desktop browsers.
      if (typeof navigator !== 'undefined' && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        this.attachRemoteAnalyser(peer, stream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState !== 'disconnected' && peer.disconnectTimer) {
        clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = undefined;
      }

      // 'disconnected' is where a phone that walked out of Wi-Fi range or lost
      // signal sits, and browsers can leave it there for ~30s before declaring
      // 'failed' — the only state recovery used to key off. Half a minute of a
      // dead call is what players experienced as "the voice just stops". A few
      // seconds of grace still rides out a genuine blip.
      if (pc.connectionState === 'disconnected' && !peer.disconnectTimer) {
        peer.disconnectTimer = setTimeout(() => {
          peer.disconnectTimer = undefined;
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            peer.failed = true;
            peer.failedAt = Date.now();
            this.emit();
          }
        }, DISCONNECT_GRACE_MS);
      }

      if (pc.connectionState === 'connected') {
        void this.recordConnectionRoute(peer);
        peer.failed = false;
        peer.failedAt = undefined;
        // Attempt playback once connection completes
        if (audio.paused && audio.srcObject) {
          void audio.play().catch(() => this.markAudioBlocked());
        }
      }

      if (pc.connectionState === 'failed') {
        peer.failed = true;
        peer.failedAt ??= Date.now();
        // Marked, not repaired here. Recovery belongs to the reconcile pass on
        // the next poll, which knows whether this side is the offerer and can
        // re-offer with iceRestart. restartIce() on the answering side has
        // nothing to trigger, so relying on it here left failures permanent.
        this.error = this.hasRelay
          ? 'A peer connection failed even through the relay. That player may be offline.'
          : 'No TURN relay is configured, so players on mobile networks cannot connect. See /api/ice.';
      }
      this.emit();
    };

    this.peers.set(peerId, peer);
    return peer;
  }

  /**
   * Records that playback was refused and arms a retry.
   *
   * The retry rides on the next interaction anywhere in the page — a tap, a
   * key, anything. That is the exact thing the autoplay policy is waiting for,
   * and it means the player usually never notices: the first time they touch
   * the board, the call comes alive.
   */
  private markAudioBlocked(): void {
    this.audioBlocked = true;
    this.emit();

    if (this.releaseAudioUnlock || typeof window === 'undefined') return;

    const unlock = () => {
      this.resumeAudio();
      // Synchronously call play on all audio elements during the user touch event
      this.peers.forEach((peer) => {
        if (peer.audio && peer.audio.srcObject) {
          this.applyAudioGate(peer);
          void peer.audio.play().catch(() => {});
        }
      });
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    this.releaseAudioUnlock = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
      this.releaseAudioUnlock = null;
    };
  }

  /**
   * Starts, or restarts, playback of every peer's audio.
   *
   * Safe to call repeatedly. Clears the blocked flag only once a play() has
   * actually resolved, so the banner cannot disappear while the player is still
   * hearing nothing.
   */
  public resumeAudio(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }

    const attempts = [...this.peers.values()]
      .filter((peer) => peer.audio?.play && peer.audio.srcObject)
      .map((peer) => {
        this.applyAudioGate(peer);
        return peer.audio.play().then(() => true).catch(() => false);
      });

    if (attempts.length === 0) return;

    void Promise.all(attempts).then((results) => {
      if (!results.some(Boolean)) return;
      this.releaseAudioUnlock?.();
      if (this.audioBlocked) {
        this.audioBlocked = false;
        this.emit();
      }
    });
  }

  private destroyPeer(peer: Peer): void {
    if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
    peer.disconnectTimer = undefined;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.ondatachannel = null;
    try {
      if (peer.channel) {
        peer.channel.onmessage = null;
        peer.channel.close();
      }
    } catch {
      // Already gone.
    }
    peer.channel = undefined;
    peer.pc.onconnectionstatechange = null;
    try {
      peer.pc.close();
    } catch {
      /* already closed */
    }
    peer.audio.srcObject = null;
    if (peer.audio.parentNode) {
      peer.audio.parentNode.removeChild(peer.audio);
    }
    peer.analyser = null;
  }

  /**
   * @param iceRestart re-gathers candidates. Needed when a connection failed:
   *   a plain re-offer would reuse the same dead candidate pair. Only the
   *   offerer can drive this, which is why the failed peer below no longer
   *   relies on restartIce() alone — on the answering side that call has
   *   nothing to trigger, since that side never creates offers.
   */
  /** Points a channel's messages at the subscribers. Failure is never fatal. */
  private attachChannel(peer: Peer, channel: RTCDataChannel): void {
    try {
      peer.channel = channel;
      channel.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        this.frameHandlers.forEach((handler) => {
          try {
            handler(event.data);
          } catch {
            // One bad subscriber must not stop the others.
          }
        });
      };
    } catch {
      peer.channel = undefined;
    }
  }

  /**
   * Sends one live frame to everyone on the call.
   *
   * Drops the frame rather than queueing when a channel is not open or its
   * buffer is backing up — for realtime mirroring the next frame is always
   * better than a late one, and an unbounded buffer would grow forever on a
   * bad connection.
   */
  public broadcastFrame(payload: string): void {
    this.peers.forEach((peer) => {
      const channel = peer.channel;
      if (!channel || channel.readyState !== 'open') return;
      if (channel.bufferedAmount > 64_000) return;
      try {
        channel.send(payload);
      } catch {
        // Peer went away mid-send; the connection state handling deals with it.
      }
    });
  }

  /** Subscribes to live frames from other players. Returns an unsubscribe. */
  public onFrame(handler: (payload: string) => void): () => void {
    this.frameHandlers.add(handler);
    return () => {
      this.frameHandlers.delete(handler);
    };
  }

  private async makeOffer(peer: Peer, iceRestart = false): Promise<void> {
    if (!this.myId) return;
    try {
      const offer = await peer.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await peer.pc.setLocalDescription(offer);
      peer.offerCount += 1;
      peer.pendingOfferId = `${peer.session}:${peer.offerCount}`;
      await this.send({
        kind: 'offer',
        from: this.myId,
        to: peer.id,
        sdp: offer,
        session: peer.session,
        offerId: peer.pendingOfferId,
      });
    } catch {
      this.error = 'Could not start a voice connection with a player.';
      this.emit();
    }
  }

  // ------------------------------------------------------------ signalling

  private async post(body: Record<string, unknown>): Promise<any> {
    if (!this.roomId) return null;
    try {
      const res = await fetch(`/api/room/${this.roomId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private send(message: SignalMessage): Promise<any> {
    return this.post({ action: 'send', playerId: this.myId, message });
  }

  private async pollSignals(): Promise<void> {
    if (!this.myId || this.status === 'off') return;

    const data = await this.post({ action: 'poll', playerId: this.myId });
    const messages: SignalMessage[] = data?.messages ?? [];

    for (const message of messages) {
      await this.handleSignal(message);
    }

    // Signals first, so a peer who just answered is already marked as such and
    // does not get a redundant offer. The server returns this on every poll and
    // it was previously ignored entirely.
    if (Array.isArray(data?.present)) {
      this.reconcilePeers(data.present as string[]);
    }
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    if (!this.myId) return;

    let peer = this.peers.get(message.from);

    switch (message.kind) {
      case 'offer': {
        // The offerer may be a player we have not seen in the room list yet.
        //
        // An offer from a *different* connection than the one we hold means the
        // other player rebuilt theirs — they refreshed, rejoined, or their phone
        // came back from the background. That offer cannot be applied to our old
        // connection (its security fingerprint no longer matches), and trying
        // used to fail quietly and leave both players silent to each other until
        // this side reloaded too. Start over with a clean connection instead.
        const rebuilt =
          !!peer && !!message.session && !!peer.remoteSession && peer.remoteSession !== message.session;
        if (!peer || rebuilt) peer = this.rebuildPeer(message.from);
        if (message.session) peer.remoteSession = message.session;

        const answerTo = async (target: Peer) => {
          await target.pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          target.remoteDescriptionSet = true;
          await this.flushCandidates(target);
          // Before the answer is created, or it goes out receive-only.
          await this.attachLocalAudio(target);

          const answer = await target.pc.createAnswer();
          await target.pc.setLocalDescription(answer);
          await this.send({
            kind: 'answer',
            from: this.myId!,
            to: message.from,
            sdp: answer,
            session: target.session,
            offerId: message.offerId,
          });
        };

        try {
          await answerTo(peer);
        } catch {
          // Still would not take — an older client with no session ids, or a
          // connection wedged some other way. One clean rebuild almost always
          // clears it; if that fails too, the reset path will try again.
          try {
            peer = this.rebuildPeer(message.from);
            if (message.session) peer.remoteSession = message.session;
            await answerTo(peer);
          } catch {
            this.error = 'Could not answer a voice connection.';
          }
        }
        this.emit();
        break;
      }

      case 'answer': {
        if (!peer) break;
        // Only the answer to our latest offer counts. One to an earlier offer —
        // or to a connection we have since rebuilt — would install mismatched
        // credentials and fail the connection all over again.
        if (message.offerId && peer.pendingOfferId && message.offerId !== peer.pendingOfferId) break;
        if (peer.pc.signalingState !== 'have-local-offer') break;
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          peer.remoteDescriptionSet = true;
          if (message.session) peer.remoteSession = message.session;
          // The handshake completed, so this peer is no longer in the failed
          // state that triggered the re-offer. Without this the retry above
          // would keep firing every few seconds against a healthy connection.
          peer.failed = false;
          await this.flushCandidates(peer);
        } catch {
          /* a stale answer for a connection we already replaced */
        }
        this.emit();
        break;
      }

      case 'ice': {
        if (!peer) break;
        // Candidates for a connection the other side has since replaced point
        // at ports nobody is listening on any more.
        if (message.session && peer.remoteSession && message.session !== peer.remoteSession) break;
        // Candidates routinely arrive before the description; queue them or the
        // connection silently fails to gather a working path.
        if (!peer.remoteDescriptionSet) {
          peer.pendingCandidates.push({ candidate: message.candidate, session: message.session });
          break;
        }
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        } catch {
          /* candidate no longer applicable */
        }
        break;
      }

      case 'reset': {
        // Only the offering side can act on this; the answering side asked
        // because it had no way to restart the handshake itself.
        if (this.myId >= message.from) break;
        const now = Date.now();
        if (peer?.lastResetAt !== undefined && now - peer.lastResetAt < RESET_AFTER_MS) break;
        const fresh = this.rebuildPeer(message.from);
        fresh.lastResetAt = now;
        fresh.lastOfferAt = now;
        await this.makeOffer(fresh);
        this.emit();
        break;
      }

      case 'bye': {
        if (peer) {
          this.destroyPeer(peer);
          this.peers.delete(message.from);
          this.emit();
        }
        break;
      }
    }
  }

  /**
   * Puts this player's microphone on the answering side of a connection.
   *
   * Setting the remote offer creates the audio transceiver here, and it starts
   * out receive-only with no track. It has to be switched to sendrecv and given
   * the mic before createAnswer(), or the answer tells the offerer this side
   * will never send. Also re-run on renegotiation, where it is a no-op.
   */
  private async attachLocalAudio(peer: Peer): Promise<void> {
    const transceiver = peer.pc
      .getTransceivers()
      .find((t) => t.receiver.track?.kind === 'audio' && t.currentDirection !== 'stopped');
    if (!transceiver) return;

    if (transceiver.direction === 'recvonly' || transceiver.direction === 'inactive') {
      transceiver.direction = 'sendrecv';
    }
    const track = this.localStream?.getAudioTracks()[0] ?? null;
    if (track && transceiver.sender.track !== track) {
      await transceiver.sender.replaceTrack(track).catch(() => {});
    }
    // So the other side's ontrack gets a stream rather than a bare track.
    const sender = transceiver.sender as RTCRtpSender & { setStreams?: (...s: MediaStream[]) => void };
    if (this.localStream && sender.setStreams) {
      try {
        sender.setStreams(this.localStream);
      } catch {
        /* older browsers; ontrack copes without it */
      }
    }
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const queued = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const { candidate, session } of queued) {
      if (session && peer.remoteSession && session !== peer.remoteSession) continue;
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* candidate no longer applicable */
      }
    }
  }

  // ---------------------------------------------------------- speaking UI

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.audioCtx = new Ctor();
    }
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();
    return this.audioCtx;
  }

  private attachRemoteAnalyser(peer: Peer, stream: MediaStream): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      peer.analyser = analyser;
    } catch {
      /* level display is optional */
    }
  }

  private startLevelMeter(): void {
    const ctx = this.getAudioContext();
    if (!ctx || !this.localStream) return;

    try {
      const source = ctx.createMediaStreamSource(this.localStream);
      this.localAnalyser = ctx.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localAnalyser.smoothingTimeConstant = 0.7;
      source.connect(this.localAnalyser);
    } catch {
      return;
    }

    const buffer = new Uint8Array(this.localAnalyser.frequencyBinCount);

    const average = (analyser: AnalyserNode): number => {
      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i];
      return sum / buffer.length;
    };

    const tick = () => {
      let changed = false;

      if (this.localAnalyser) {
        const speaking = !micStream.isMuted() && average(this.localAnalyser) > SPEAKING_THRESHOLD;
        if (speaking !== this.localSpeaking) {
          this.localSpeaking = speaking;
          changed = true;
        }
      }

      this.peers.forEach((peer) => {
        if (!peer.analyser) return;
        const speaking = average(peer.analyser) > SPEAKING_THRESHOLD;
        if (speaking !== peer.speaking) {
          peer.speaking = speaking;
          changed = true;
        }
      });

      if (changed) this.emit();
      this.levelFrame = requestAnimationFrame(tick);
    };
    tick();
  }
}

export const voiceChat = new VoiceChatManager();
