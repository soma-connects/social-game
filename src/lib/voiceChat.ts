// Live group voice over WebRTC.
//
// Topology is a full mesh: with a 4-player cap that is 3 peer connections per
// player, which is well within what a phone handles. An SFU would only be worth
// it past roughly 6 participants.
//
// Signalling rides the REST relay in /api/room/[roomId]/signal. To avoid glare,
// which side makes the offer is decided by comparing player ids rather than by
// racing — the lower id always offers.

import { micStream, MicError } from './micStream';

const SIGNAL_POLL_MS = 1000;

/** Google's public STUN servers cover most home and office networks. */
const ICE_SERVERS: RTCIceServer[] = [
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
}

export interface VoiceState {
  status: VoiceStatus;
  muted: boolean;
  error: string | null;
  peers: PeerState[];
  /** True while the local player is above the speaking threshold. */
  speaking: boolean;
}

type SignalMessage =
  | { kind: 'offer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: 'bye'; from: string; to: string };

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  /** Remote audio, kept so listeners can record the performer for the replay. */
  stream: MediaStream | null;
  analyser: AnalyserNode | null;
  speaking: boolean;
  /** Candidates that arrived before the remote description was set. */
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescriptionSet: boolean;
}

const SPEAKING_THRESHOLD = 12;

class VoiceChatManager {
  private roomId: string | null = null;
  private myId: string | null = null;

  private peers = new Map<string, Peer>();
  private localStream: MediaStream | null = null;
  private unsubscribeStream: (() => void) | null = null;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private levelFrame: number | null = null;
  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSpeaking = false;

  private status: VoiceStatus = 'off';
  private error: string | null = null;
  /** Remote playback gain. Ducked while the voice arena is listening. */
  private remoteVolume = 1;

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
      peers: [...this.peers.values()].map((peer) => ({
        playerId: peer.id,
        connection: peer.pc.connectionState,
        speaking: peer.speaking,
        silent: !peer.speaking,
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

    // On a phone the mic is handed to the speech recogniser during a mini-game
    // and given back afterwards. Peer connections outlive that, so the track on
    // each sender has to be swapped rather than the call torn down — otherwise
    // everyone hears silence from this player for the rest of the session.
    this.unsubscribeStream?.();
    this.unsubscribeStream = micStream.onStreamChange((next) => this.onLocalStreamChanged(next));

    this.pollTimer = setInterval(() => void this.pollSignals(), SIGNAL_POLL_MS);
    void this.pollSignals();

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
    micStream.setCallActive(false);

    if (this.roomId && this.myId) {
      // Best effort — the peers also notice via connection state.
      void this.post({ action: 'leave', playerId: this.myId });
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
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
    this.peers.forEach((peer) => {
      peer.audio.volume = this.remoteVolume;
    });
  }

  // ----------------------------------------------------------------- peers

  /** Opens connections to new players and drops ones who left. */
  public syncPeers(peerIds: string[]): void {
    if (!this.myId || this.status === 'off') return;

    const wanted = new Set(peerIds.filter((id) => id !== this.myId));

    this.peers.forEach((peer, id) => {
      if (!wanted.has(id)) {
        this.destroyPeer(peer);
        this.peers.delete(id);
      }
    });

    wanted.forEach((id) => {
      if (!this.peers.has(id)) {
        const peer = this.createPeer(id);
        // Deterministic initiator: the lower id offers. Both sides agree without
        // negotiating who goes first, so there is no offer collision to recover from.
        if (this.myId! < id) void this.makeOffer(peer);
      }
    });

    this.emit();
  }

  private createPeer(peerId: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const audio = typeof window !== 'undefined' ? new Audio() : ({} as HTMLAudioElement);
    if (audio.style) {
      audio.autoplay = true;
      audio.volume = this.remoteVolume;
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
    };

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
    const track = this.localStream?.getAudioTracks()[0] ?? null;
    const transceiver = pc.addTransceiver('audio', {
      direction: 'sendrecv',
      streams: this.localStream ? [this.localStream] : [],
    });
    if (track) void transceiver.sender.replaceTrack(track).catch(() => {});

    pc.onicecandidate = (event) => {
      if (event.candidate && this.myId) {
        void this.send({
          kind: 'ice',
          from: this.myId,
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      peer.stream = stream;
      audio.srcObject = stream;
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
      void audio.play().catch((err) => {
        console.warn('Peer audio autoplay blocked by browser policy:', err);
      });
      this.attachRemoteAnalyser(peer, stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        // Usually a NAT that STUN cannot traverse; a TURN relay is the fix.
        this.error =
          'A peer could not connect directly. Some networks need a TURN relay for voice.';
      }
      this.emit();
    };

    this.peers.set(peerId, peer);
    return peer;
  }

  public resumeAudio(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    this.peers.forEach((peer) => {
      if (peer.audio && peer.audio.play) {
        void peer.audio.play().catch(() => {});
      }
    });
  }

  private destroyPeer(peer: Peer): void {
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
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

  private async makeOffer(peer: Peer): Promise<void> {
    if (!this.myId) return;
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      await this.send({ kind: 'offer', from: this.myId, to: peer.id, sdp: offer });
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
  }

  private async handleSignal(message: SignalMessage): Promise<void> {
    if (!this.myId) return;

    let peer = this.peers.get(message.from);

    switch (message.kind) {
      case 'offer': {
        // The offerer may be a player we have not seen in the room list yet.
        if (!peer) peer = this.createPeer(message.from);
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          peer.remoteDescriptionSet = true;
          await this.flushCandidates(peer);

          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await this.send({ kind: 'answer', from: this.myId, to: message.from, sdp: answer });
        } catch {
          this.error = 'Could not answer a voice connection.';
        }
        this.emit();
        break;
      }

      case 'answer': {
        if (!peer) break;
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          peer.remoteDescriptionSet = true;
          await this.flushCandidates(peer);
        } catch {
          /* a stale answer for a connection we already replaced */
        }
        this.emit();
        break;
      }

      case 'ice': {
        if (!peer) break;
        // Candidates routinely arrive before the description; queue them or the
        // connection silently fails to gather a working path.
        if (!peer.remoteDescriptionSet) {
          peer.pendingCandidates.push(message.candidate);
          break;
        }
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        } catch {
          /* candidate no longer applicable */
        }
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

  private async flushCandidates(peer: Peer): Promise<void> {
    const queued = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of queued) {
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
