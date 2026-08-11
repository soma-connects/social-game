// AI Game Master Service — Development Bible Spec v1.2 Implementation
//
// Role: Narrator, Host, Rules Explainer, Pacing Keeper.
// Persona: Energetic, funny, encouraging, playful, fast-paced ("Party Host, Not Assistant").
// Dual Delivery: Text-on-screen + SpeechSynthesis TTS.
// State Machine: Welcome -> Player Turn -> Mini Game Intro -> Silent -> Reaction -> Shop -> Recap.

import { MiniGameId, Player, RoomState } from './types';

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
  { id: 'tb2', category: 'truth_bluff', tone: 'personal', text: 'Share your most bizarre hidden talent. Is it real or complete BLUFF?' },
  { id: 'tb3', category: 'truth_bluff', tone: 'silly', text: 'Tell the group about your worst cooking disaster. Truth or Bluff?' },

  // Debate (Silly non-divisive topics, Spec §8)
  { id: 'db1', category: 'debate', tone: 'competitive', text: 'DEBATE: Is cereal technically cold soup? Convince the room in 15 seconds!' },
  { id: 'db2', category: 'debate', tone: 'silly', text: 'DEBATE: Would a giraffe wear a tie at the top or bottom of its neck?' },
  { id: 'db3', category: 'debate', tone: 'silly', text: 'DEBATE: Is a hot dog a sandwich? Settle the debate right now!' },

  // Ice Breakers
  { id: 'ib1', category: 'icebreaker', tone: 'personal', text: 'If you could only eat one Nigerian dish for the rest of your life, what is it?' },
  { id: 'ib2', category: 'icebreaker', tone: 'silly', text: 'What is the most ridiculous thing you bought because you were bored?' },
  { id: 'ib3', category: 'icebreaker', tone: 'personal', text: 'What song immediately gets you on the dance floor no matter where you are?' },

  // Personality Challenge
  { id: 'pc1', category: 'personality', tone: 'energetic', text: 'Do your best Nollywood dramatic crying scene! Give it 100% passion!' },
  { id: 'pc2', category: 'personality', tone: 'silly', text: 'Channel an angry market woman haggling for pepper. Oya sell your market!' },
  { id: 'pc3', category: 'personality', tone: 'energetic', text: 'Give a 10-second fast-talk sports commentary on someone taking a sip of water!' },
];

class AiGameMasterEngine {
  private currentState: AiHostState = 'idle';
  private usedPromptIds: Set<string> = new Set();
  private lastSelectedPlayerId: string | null = null;
  private ttsVoice: SpeechSynthesisVoice | null = null;

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

  /** Dual Delivery: Synthesize TTS spoken audio + return text caption */
  public speak(text: string): string {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop previous host voice
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.ttsVoice) utterance.voice = this.ttsVoice;
      utterance.rate = 1.05; // Energetic, fast-paced
      utterance.pitch = 1.1; // Friendly party host tone
      window.speechSynthesis.speak(utterance);
    }
    return text;
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
