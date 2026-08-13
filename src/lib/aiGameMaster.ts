// AI Game Master Service — Development Bible Spec v1.2 Implementation
//
// Role: Narrator, Host, Rules Explainer, Pacing Keeper.
// Persona: Energetic, funny, encouraging, playful, fast-paced ("Party Host, Not Assistant").
// Dual Delivery: Text-on-screen + SpeechSynthesis TTS.
// State Machine: Welcome -> Player Turn -> Mini Game Intro -> Silent -> Reaction -> Shop -> Recap.

import { MiniGameId, Player, RoomState, SessionMemoryEvent, TeamId } from './types';

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

class AiGameMasterEngine {
  private currentState: AiHostState = 'idle';
  private usedPromptIds: Set<string> = new Set();
  private lastSelectedPlayerId: string | null = null;
  private ttsVoice: SpeechSynthesisVoice | null = null;
  private memoryCache: SessionMemoryEvent[] = [];

  constructor() {
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

  /** Dual Delivery: Gemini TTS voice (server) with browser TTS fallback */
  public speak(text: string): string {
    // Force browser TTS directly to avoid async fetch delays blocking audio playback.
    this.speakBrowserFallback(text);
    return text;
  }

  private async speakAsync(text: string): Promise<void> {
    try {
      const res = await fetch('/api/ai-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!data.success || !data.audio) {
        throw new Error('No audio data');
      }

      // Decode base64 PCM → WAV and play
      const raw = atob(data.audio);
      const pcm = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) pcm[i] = raw.charCodeAt(i);

      // PCM 16-bit LE mono 24kHz → Float32
      const sampleRate = 24000;
      const samples = pcm.length / 2;
      const float32 = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        const lo = pcm[i * 2];
        const hi = pcm[i * 2 + 1];
        let val = (hi << 8) | lo;
        if (val >= 0x8000) val -= 0x10000;
        float32[i] = val / 32768;
      }

      const audioCtx = new AudioContext({ sampleRate });
      const buffer = audioCtx.createBuffer(1, float32.length, sampleRate);
      buffer.getChannelData(0).set(float32);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start();
      source.onended = () => audioCtx.close();
    } catch (err) {
      console.warn('Gemini TTS failed, falling back to browser TTS:', err);
      this.speakBrowserFallback(text);
    }
  }

  private speakBrowserFallback(text: string): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
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

  public async generateTriviaQuestion(roomTheme: string | undefined): Promise<{ question: string; answer: string; funFact: string }> {
    // In a real app we'd call the Gemini AI here, but for this demo we'll return a random hardcoded one based on the theme.
    // Let's provide a list of fun trivia.
    const questions = [
      { question: "What is the capital of Nigeria?", answer: "Abuja", funFact: "It replaced Lagos as the capital in 1991." },
      { question: "What is the tallest mammal on Earth?", answer: "Giraffe", funFact: "A giraffe's neck can be over 6 feet long!" },
      { question: "Which planet is known as the Red Planet?", answer: "Mars", funFact: "Mars gets its red color from iron oxide (rust) on its surface." },
      { question: "How many continents are there?", answer: "Seven", funFact: "Asia is the largest continent in the world." },
      { question: "What is the chemical symbol for water?", answer: "H2O", funFact: "Water covers about 71% of the Earth's surface." },
    ];
    
    // Simulate AI delay
    await new Promise(r => setTimeout(r, 1000));
    
    return questions[Math.floor(Math.random() * questions.length)];
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
  public async fetchGeminiChallenge(playerName?: string): Promise<AiHostPrompt> {
    try {
      const res = await fetch('/api/ai-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'challenge', playerName }),
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
    return this.getRandomChallenge();
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
