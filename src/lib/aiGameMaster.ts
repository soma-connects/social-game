// AI Game Master Service — Development Bible Spec v1.2 Implementation
//
// Role: Narrator, Host, Rules Explainer, Pacing Keeper.
// Persona: Energetic, funny, encouraging, playful, fast-paced ("Party Host, Not Assistant").
// Dual Delivery: Text-on-screen + SpeechSynthesis TTS.
// State Machine: Welcome -> Player Turn -> Mini Game Intro -> Silent -> Reaction -> Shop -> Recap.

import { MiniGameId, Player, RoomState, SessionMemoryEvent, TeamId } from './types';
import { DEFAULT_ROOM_VIBE, ROOM_VIBES, RoomVibeId } from './roomVibes';

export type AiHostState =
  | 'idle'
  | 'welcome'
  | 'player_turn'
  | 'mini_game_intro'
  | 'silent'
  | 'reaction'
  | 'shop'
  | 'recap';

export interface AiHostPrompt {
  id: string;
  category: 'truth_bluff' | 'debate' | 'icebreaker' | 'personality' | 'dare';
  text: string;
  tone: 'silly' | 'personal' | 'competitive' | 'energetic';
}

export interface RecapHighlights {
  winnerName: string;
  mvpName: string;
  bestSpeaker: string;
  funniestMoment: string;
  biggestComeback: string;
}

// ── Curated Prompt Pools (Spec §4.1 - Safe, silly, non-divisive) ───────────

export const AI_PROMPT_POOLS: AiHostPrompt[] = [
  // Truth or Bluff
  { id: 'tb1', category: 'truth_bluff', tone: 'silly', text: 'Tell us a story about a time you accidentally ruined something. Is it TRUTH or BLUFF?' },
  { id: 'tb2', category: 'truth_bluff', tone: 'personal', text: 'Share your most bizarre hidden talent or habit. Is it real or complete BLUFF?' },
  { id: 'tb3', category: 'truth_bluff', tone: 'silly', text: 'Tell the group about your worst cooking disaster. Truth or Bluff?' },
  { id: 'tb4', category: 'truth_bluff', tone: 'energetic', text: 'Tell us about a time you met a celebrity or someone famous. Is it TRUTH or BLUFF?' },
  { id: 'tb5', category: 'truth_bluff', tone: 'silly', text: 'Tell us about the weirdest place you have ever fallen fast asleep. Truth or Bluff?' },
  { id: 'tb6', category: 'truth_bluff', tone: 'personal', text: 'Tell us about your biggest childhood fear that sounds completely ridiculous now. Truth or Bluff?' },
  { id: 'tb7', category: 'truth_bluff', tone: 'silly', text: 'Tell us about a time you got caught doing something outrageously silly. Is it TRUTH or BLUFF?' },
  { id: 'tb8', category: 'truth_bluff', tone: 'energetic', text: 'Tell us about a wild or terrifying animal encounter you survived. Truth or Bluff?' },
  { id: 'tb9', category: 'truth_bluff', tone: 'personal', text: 'Tell us about a secret food combination you love that everyone else finds gross. Truth or Bluff?' },
  { id: 'tb10', category: 'truth_bluff', tone: 'silly', text: 'Tell us about an unbelievable injury or accident caused by pure clumsiness. Truth or Bluff?' },
  { id: 'tb11', category: 'truth_bluff', tone: 'competitive', text: 'Tell us about an insane prize or contest you once won. Truth or Bluff?' },
  { id: 'tb12', category: 'truth_bluff', tone: 'energetic', text: 'Tell us about a time you accidentally walked into the wrong house or car. Truth or Bluff?' },
  { id: 'tb13', category: 'truth_bluff', tone: 'silly', text: 'Tell us about a ridiculous lie you told as a kid that people actually believed for years. Truth or Bluff?' },
  { id: 'tb14', category: 'truth_bluff', tone: 'personal', text: 'Tell us about a strange phobia or superstition you secretly have. Truth or Bluff?' },
  { id: 'tb15', category: 'truth_bluff', tone: 'energetic', text: 'Tell us about the most expensive thing you broke or lost by mistake. Truth or Bluff?' },

  // Debate (Silly non-divisive topics, Spec §8)
  { id: 'db1', category: 'debate', tone: 'competitive', text: 'DEBATE: Is cereal technically cold soup? Convince the room in 15 seconds!' },
  { id: 'db2', category: 'debate', tone: 'silly', text: 'DEBATE: Would a giraffe wear a tie at the top or bottom of its neck?' },
  { id: 'db3', category: 'debate', tone: 'silly', text: 'DEBATE: Is a hot dog a sandwich? Settle the debate right now!' },

  // Ice Breakers
  { id: 'ib1', category: 'icebreaker', tone: 'personal', text: 'If you could only eat one meal for the rest of your life, what would it be?' },
  { id: 'ib2', category: 'icebreaker', tone: 'silly', text: 'What is the most ridiculous thing you bought because you were bored?' },
  { id: 'ib3', category: 'icebreaker', tone: 'personal', text: 'What song immediately gets you on the dance floor no matter where you are?' },

  // Personality Challenge
  { id: 'pc1', category: 'personality', tone: 'energetic', text: 'Do your most dramatic Hollywood movie confession line with 100% passion!' },
  { id: 'pc2', category: 'personality', tone: 'silly', text: 'Imitate an over-the-top auctioneer trying to sell a plain bottle of water!' },
  { id: 'pc3', category: 'personality', tone: 'energetic', text: 'Give a 10-second fast-talk sports commentary on someone taking a sip of water!' },
];

/** Gemini TTS streams 16-bit mono PCM at this rate. */
const GEMINI_TTS_SAMPLE_RATE = 24000;
/** First audio normally lands in ~1s; past this the browser voice is the better host. */
const FIRST_AUDIO_TIMEOUT_MS = 4000;

class AiGameMasterEngine {
  private currentState: AiHostState = 'idle';
  private usedPromptIds: Set<string> = new Set();
  private lastSelectedPlayerId: string | null = null;
  private ttsVoice: SpeechSynthesisVoice | null = null;
  private memoryCache: SessionMemoryEvent[] = [];

  /**
   * One audio context for every host line, unlocked by the player's first tap.
   *
   * Phones only let a page start sound from inside a user gesture. The Gemini
   * voice arrives a second after the line is asked for — well outside any tap —
   * and the old player built a fresh AudioContext per line, so on a phone it was
   * born suspended and silent. That is why the Gemini path was switched off. A
   * single context resumed on the first tap stays unlocked for the session.
   */
  private audioCtx: AudioContext | null = null;
  /** Stops whatever host line is playing now. */
  private stopPlayback: (() => void) | null = null;
  /** Bumped per line, so a slow line never plays over the one that replaced it. */
  private speakToken = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        const ctx = this.getAudioContext();
        if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
      };
      for (const event of ['pointerdown', 'touchstart', 'keydown']) {
        window.addEventListener(event, unlock, { passive: true });
      }
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        // Prefer English voices with natural tone
        this.ttsVoice =
          voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha'))) ||
          voices.find((v) => v.lang.startsWith('en')) ||
          null;
      };
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }

  public getState(): AiHostState {
    return this.currentState;
  }

  public setState(state: AiHostState) {
    this.currentState = state;
  }

  /**
   * Says a host line in the Gemini voice, falling back to the browser's.
   *
   * Returns the text immediately so callers can show it while it is spoken.
   */
  public speak(text: string): string {
    if (!this.voiceMuted) void this.speakWithGemini(text);
    return text;
  }

  private voiceMuted = false;

  /**
   * Silences the host until unmuted — the current line and every one after it.
   *
   * The banner's mute used to call speechSynthesis.cancel() directly, which
   * stopped only the line already playing: the next line spoke regardless, and
   * a Gemini line was not stopped at all.
   */
  public isVoiceMuted(): boolean {
    return this.voiceMuted;
  }

  public setVoiceMuted(muted: boolean): void {
    this.voiceMuted = muted;
    if (muted) {
      this.speakToken++;
      this.stopSpeaking();
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.audioCtx = new Ctor();
    }
    return this.audioCtx;
  }

  private stopSpeaking(): void {
    this.stopPlayback?.();
    this.stopPlayback = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /**
   * Streams the line from /api/ai-tts and plays each chunk as it lands.
   *
   * The browser voice takes over when the context is still locked (no tap
   * yet), when no audio arrives within FIRST_AUDIO_TIMEOUT_MS, or on any error
   * before the first chunk — a host that goes silent is worse than a robotic one.
   */
  private async speakWithGemini(text: string): Promise<void> {
    const token = ++this.speakToken;
    this.stopSpeaking();

    const ctx = this.getAudioContext();
    if (ctx && ctx.state !== 'running') await ctx.resume().catch(() => {});
    if (!ctx || ctx.state !== 'running') {
      this.speakBrowserFallback(text);
      return;
    }

    const controller = new AbortController();
    const sources: AudioBufferSourceNode[] = [];
    this.stopPlayback = () => {
      controller.abort();
      sources.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* not started yet, or already ended */
        }
      });
    };
    const giveUp = setTimeout(() => controller.abort(), FIRST_AUDIO_TIMEOUT_MS);

    let gotAudio = false;
    let nextStart = 0;
    let carry: number | null = null;
    try {
      const res = await fetch('/api/ai-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`TTS ${res.status}`);

      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done || token !== this.speakToken) break;

        // 16-bit samples can straddle network chunks; hold an odd byte over.
        let bytes = value;
        if (carry !== null) {
          const joined = new Uint8Array(bytes.length + 1);
          joined[0] = carry;
          joined.set(bytes, 1);
          bytes = joined;
          carry = null;
        }
        if (bytes.length % 2 === 1) {
          carry = bytes[bytes.length - 1];
          bytes = bytes.subarray(0, bytes.length - 1);
        }
        const samples = bytes.length / 2;
        if (samples === 0) continue;

        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const buffer = ctx.createBuffer(1, samples, GEMINI_TTS_SAMPLE_RATE);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        // A small lead on the first chunk absorbs network jitter between the next few.
        const startAt = Math.max(ctx.currentTime + (gotAudio ? 0.02 : 0.15), nextStart);
        source.start(startAt);
        nextStart = startAt + buffer.duration;
        sources.push(source);

        if (!gotAudio) {
          gotAudio = true;
          clearTimeout(giveUp);
        }
      }
    } catch {
      if (!gotAudio && token === this.speakToken) this.speakBrowserFallback(text);
    } finally {
      clearTimeout(giveUp);
    }
  }

  private speakBrowserFallback(text: string): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      // Browser voices read emoji out by name ("fire", "party popper").
      const spoken = text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').trim();
      if (!spoken) return;
      const utterance = new SpeechSynthesisUtterance(spoken);
      if (this.ttsVoice) utterance.voice = this.ttsVoice;
      utterance.rate = 1.05;
      utterance.pitch = 1.1;
      window.speechSynthesis.speak(utterance);
    }
  }

  /** Welcome Message (Session Start) */
  public getWelcomeSpeech(): string {
    this.currentState = 'welcome';
    const lines = [
      "🔥 Yo family! Welcome to Voice Party Arcade! I'm your AI Game Master. Oya let's make some noise!",
      "🎉 Welcome to Voice Party! Clear your throats and get ready to sing, debate, and roast!",
      "🎙️ Welcome party people! Voice Arena is live! Let's see who owns the mic today!",
    ];
    const text = lines[Math.floor(Math.random() * lines.length)];
    return this.speak(text);
  }

  /** Turn Announcement */
  public getTurnSpeech(playerName: string, teamName?: string): string {
    this.currentState = 'player_turn';
    this.lastSelectedPlayerId = playerName;
    const text = teamName
      ? `🔥 Team ${teamName.toUpperCase()} is up! Oya ${playerName}, step up to the mic!`
      : `🔥 Next up... ${playerName}! Step up to the mic and show us what you've got!`;
    return this.speak(text);
  }

  /** One-sentence rules explanation before mini-game (Spec §3) */
  public getMiniGameIntro(gameId: MiniGameId): string {
    this.currentState = 'mini_game_intro';
    let text = '';
    if (gameId === 'pitch_bird') {
      text = "🐦 PitchBird! Sing high notes to fly over pillars, and stop speaking to drop with gravity!";
    } else if (gameId === 'solfege') {
      text = "🎵 Solfege Note Match! Match the pitch of the musical note (Do-Re-Mi) with your voice!";
    } else if (gameId === 'truth_or_bluff') {
      text = "🎭 Truth or Bluff! Two stories, but one is a complete lie. Don't get fooled!";
    } else if (gameId === 'story_builder') {
      text = "📖 Story Builder! Add to the growing story, one sentence at a time!";
    } else if (gameId === 'debate') {
      text = "⚖️ Debate! Argue your side of a silly topic and let the crowd vote!";
    } else if (gameId === 'guess_the_voice') {
      text = "🕵️ Guess the Voice! Someone is recording a disguised message. Can you guess who?";
    } else if (gameId === 'trivia_showdown') {
      text = "🧠 Trivia Showdown! Be the first to buzz in and answer the question correctly!";
    } else {
      text = "🎙️ Voice Arena! Pronounce the prompt clearly into your mic before the timer dies!";
    }
    // Automatically transition to Silent so AI doesn't talk over performer (Spec §3 rule)
    setTimeout(() => {
      this.currentState = 'silent';
    }, 4000);
    return this.speak(text);
  }

  /** Reactive Commentary on game events */
  public getEventReaction(type: 'score' | 'trap' | 'crash' | 'win', name: string, detail?: string): string {
    this.currentState = 'reaction';
    let text = '';
    if (type === 'score') {
      text = `🔥 Clean performance, ${name}! +${detail ?? '100'} points banked!`;
    } else if (type === 'trap') {
      text = `🚨 Ouch! ${name} hit a trap word! No wahala, keep moving!`;
    } else if (type === 'crash') {
      text = `💥 Boom! ${name} crashed into a pillar! Don't give up, try again next turn!`;
    } else if (type === 'win') {
      text = `🏆 CHAMPION ALERT! ${name} HAS WON THE MATCH! OSCAR PERFORMANCE!`;
    }
    return this.speak(text);
  }

  public getTruthBluffReact(winnerCount: number): string {
    this.currentState = 'reaction';
    let text = '';
    if (winnerCount === 0) {
      text = "🎭 Masterclass bluff! Absolutely nobody guessed the lie!";
    } else if (winnerCount === 1) {
      text = "🔍 Sharp eye! Only one player saw right through that bluff!";
    } else {
      text = `🧠 High IQ room! ${winnerCount} players caught the bluff!`;
    }
    return this.speak(text);
  }

  public getTeamBattleIntro(games: MiniGameId[]): string {
    this.currentState = 'mini_game_intro';
    const text = `🔥 TEAM BATTLE! It's Red vs Blue! We have ${games.length} rounds of madness. Let's see who takes the crown!`;
    return this.speak(text);
  }

  public getTeamBattleRoundResult(winnerTeam: TeamId, score: number): string {
    this.currentState = 'reaction';
    const text = `🔥 Team ${winnerTeam.toUpperCase()} takes the round with ${score} points! The crowd goes wild!`;
    return this.speak(text);
  }

  public getTeamBattleRecap(winningTeam: TeamId, finalScore: Record<TeamId, number>): string {
    this.currentState = 'recap';
    const text = `🏆 And that's game! Team ${winningTeam.toUpperCase()} wins the Team Battle! Final score: Red ${finalScore.red}, Blue ${finalScore.blue}. Incredible performance!`;
    return this.speak(text);
  }

  public getTruthBluffPrompt(playerName: string): string {
    return this.speak(`Alright ${playerName}, it's your turn. Tell us your true story and your fake story!`);
  }

  public getTriviaIntro(): string {
    return this.speak("🧠 Get ready! I'm reading the question now. Buzz in fast!");
  }

  public addMemoryEvent(room: RoomState, playerId: string, playerName: string, category: SessionMemoryEvent['category'], text: string) {
    const event: SessionMemoryEvent = { playerId, playerName, category, text, timestamp: Date.now() };
    this.memoryCache.push(event);
    if (room.sessionMemory) {
      room.sessionMemory.push(event);
    }
  }

  public getMemoryEvents(room?: RoomState): SessionMemoryEvent[] {
    return room?.sessionMemory || this.memoryCache;
  }

  /** Async real-time Gemini LLM powered prompt generator */
  public async fetchGeminiChallenge(playerName?: string, roomVibe?: RoomVibeId): Promise<AiHostPrompt> {
    try {
      const res = await fetch('/api/ai-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'challenge', playerName, roomVibe }),
      });
      const data = await res.json();
      if (data.success && data.text) {
        const geminiPrompt: AiHostPrompt = {
          id: `gemini_${Date.now()}`,
          category: 'personality',
          tone: 'energetic',
          text: data.text,
        };
        return geminiPrompt;
      }
    } catch (e) {
      console.error('Failed to fetch Gemini challenge:', e);
    }
    // Offline/no-API-key fallback: still lean toward the room's mood.
    const preferredCategory = ROOM_VIBES[roomVibe ?? DEFAULT_ROOM_VIBE].preferredCategories[0];
    return this.getRandomChallenge(preferredCategory);
  }

  /** Get unused AI Challenge prompt (Spec §4.2 No-Repeat & §4.4 Weighting) */
  public getRandomChallenge(category?: string, excludePlayerId?: string): AiHostPrompt {
    let pool = AI_PROMPT_POOLS.filter((p) => !this.usedPromptIds.has(p.id));
    if (category) {
      const catPool = pool.filter((p) => p.category === category);
      if (catPool.length > 0) pool = catPool;
    }
    if (pool.length === 0) {
      this.usedPromptIds.clear(); // Reset session pool if exhausted
      pool = AI_PROMPT_POOLS;
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    this.usedPromptIds.add(chosen.id);
    return chosen;
  }

  /** Deterministic End-of-Session Recap (Spec §7) */
  public generateRecap(room: RoomState): RecapHighlights {
    this.currentState = 'recap';
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    const winner = room.winner || sorted[0] || { name: 'Player 1', score: 0 };
    const mvp = sorted[0] || winner;

    const comebackPlayer = [...room.players].sort((a, b) => (b.vibeScore ?? 0) - (a.vibeScore ?? 0))[0] || winner;

    return {
      winnerName: winner.name,
      mvpName: `${mvp.name} (${mvp.score} pts)`,
      bestSpeaker: `${winner.name} (100% Accuracy)`,
      funniestMoment: `Sarah described a giraffe as "a horse with a crane"`,
      biggestComeback: comebackPlayer.name,
    };
  }
}

export const aiGameMaster = new AiGameMasterEngine();
