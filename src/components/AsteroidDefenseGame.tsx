'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Player, RoomState } from '@/lib/types';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import { SpeechDiagnostics, speechEngine } from '@/lib/speechService';
import { measurePixelText } from '@/lib/pixelFont';
import { BakedSprite, ROCK_PALETTES, makeAsteroidSprite, makeHeartSprite } from '@/lib/pixelSprites';
import {
  Asteroid,
  Backdrop,
  GROUND_Y,
  PALETTE,
  REACH_Y,
  SceneState,
  TURRET_X,
  TURRET_Y,
  VH,
  VW,
  drawFrame,
  makeBackdrop,
  makeStarfield,
  updateBackdrop,
} from '@/lib/asteroidScene';

interface AsteroidDefenseGameProps {
  room: RoomState;
  activePlayer: Player;
  onCompleteTurn: (pointsEarned: number) => void;
}

/**
 * Deliberately short, phonetically distinct words.
 *
 * Speech recognition is the whole input device here, so near-homophones make
 * the game feel broken rather than hard: BEAM and BEAN, or PEW and "few", get
 * scored against whichever the recogniser guessed. Everything below is chosen
 * to be hard to mishear as another entry in the list.
 */
const WORDS = [
  'SUN', 'MOON', 'STAR', 'ROCK', 'FIRE', 'ICE', 'ZAP', 'BOOM',
  'JUMP', 'FLASH', 'LASER', 'COMET', 'ORBIT', 'PLANET', 'ROBOT',
  'ENGINE', 'SHIELD', 'TIGER', 'RIVER', 'THUNDER', 'CRYSTAL',
  'DRAGON', 'PHOENIX', 'GALAXY', 'MAGNET', 'PIRATE', 'VOLCANO',
];

/** Points cap for the board game, matching MINIGAME_MAX_SCORE.asteroid_defense. */
const MAX_POINTS = 300;

type GameState = SceneState & {
  nextId: number;
  spawnEvery: number;
  baseSpeed: number;
  aimTarget: number;
  /** word -> when we last fired on it, to debounce the recogniser repeating. */
  firedAt: Map<string, number>;
  active: boolean;
};

function freshState(): GameState {
  return {
    asteroids: [],
    particles: [],
    lasers: [],
    shockwaves: [],
    floaters: [],
    stars: makeStarfield(),
    score: 0,
    lives: 3,
    wave: 1,
    combo: 0,
    frames: 0,
    aim: -Math.PI / 2,
    muzzleFlash: 0,
    shake: 0,
    flash: 0,
    heart: null,
    backdrop: null,
    nextId: 1,
    spawnEvery: 75,
    baseSpeed: 0.35,
    aimTarget: -Math.PI / 2,
    firedAt: new Map(),
    active: false,
  };
}

export default function AsteroidDefenseGame({
  room,
  activePlayer,
  onCompleteTurn,
}: AsteroidDefenseGameProps) {
  const [status, setStatus] = useState<'intro' | 'playing' | 'game_over'>('intro');
  const [hud, setHud] = useState({ score: 0, lives: 3, wave: 1 });
  const [transcript, setTranscript] = useState('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [bgmMuted, setBgmMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [speechDiag, setSpeechDiag] = useState<SpeechDiagnostics | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<{ stop: () => void } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef(0);
  const game = useRef<GameState>(freshState());
  const onCompleteRef = useRef(onCompleteTurn);
  onCompleteRef.current = onCompleteTurn;

  /**
   * Rocks are baked up front rather than at spawn.
   *
   * Generating a sprite costs a few hundred microseconds of pixel work, and
   * doing it inside the loop dropped a frame every time a rock appeared â€” which
   * is exactly the stutter that reads as the game being laggy. Twenty variants
   * across four palettes is more than enough that repeats go unnoticed.
   */
  const rockPool = useRef<{ sprite: BakedSprite; radius: number }[]>([]);
  const backdropRef = useRef<Backdrop | null>(null);
  const [ready, setReady] = useState(false);

  const stopEverything = useCallback(() => {
    game.current.active = false;
    cancelAnimationFrame(rafRef.current);
    sessionRef.current?.stop();
    sessionRef.current = null;
    speechEngine.stopAudioAnalyser();
    audioRef.current?.pause();
    (window as any).pauseStarfield = false;
  }, []);

  useEffect(() => {
    // The page-wide starfield is pure decoration and this screen has its own â€”
    // no reason to pay for both while a game loop is running.
    (window as any).pauseStarfield = true;
    game.current.heart = makeHeartSprite(PALETTE.danger);
    setIsMicMuted(speechEngine.getIsMicMuted());

    // Bake the art while the intro card is up. Spread across animation frames
    // so even on a slow phone the button stays responsive instead of the tab
    // locking up for the length of the whole batch.
    let cancelled = false;
    let handle = 0;
    const queue: (() => void)[] = [
      () => {
        backdropRef.current = makeBackdrop();
      },
      ...Array.from({ length: 20 }, (_, i) => () => {
        const radius = 11 + (i % 7);
        rockPool.current.push({
          sprite: makeAsteroidSprite(radius, 1000 + i * 7919, ROCK_PALETTES[i % ROCK_PALETTES.length]),
          radius,
        });
      }),
    ];

    const pump = () => {
      if (cancelled) return;
      const until = performance.now() + 6;
      while (queue.length > 0 && performance.now() < until) queue.shift()!();
      if (queue.length > 0) handle = requestAnimationFrame(pump);
      else setReady(true);
    };
    handle = requestAnimationFrame(pump);

    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
      stopEverything();
    };
  }, [stopEverything]);

  /**
   * Idle attract loop behind the intro card.
   *
   * The scenery is already baked by the time the card is up, so showing a live
   * sky costs almost nothing and means the player never looks at a black box
   * wondering whether the game has hung.
   */
  useEffect(() => {
    if (!ready || status !== 'intro') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const idle: SceneState = {
      ...freshState(),
      heart: game.current.heart,
      backdrop: backdropRef.current,
    };

    let handle = 0;
    const tick = () => {
      idle.frames++;
      if (idle.backdrop) updateBackdrop(idle.backdrop);
      for (const star of idle.stars) {
        star.y += star.speed;
        if (star.y > VH) {
          star.y = 0;
          star.x = Math.floor(Math.random() * VW);
        }
      }
      drawFrame(ctx, idle);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [ready, status]);

  // â”€â”€ spawning â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const spawnAsteroid = () => {
    const s = game.current;

    // Never put the same word in the sky twice: the player says one word and
    // both rocks are legitimate targets, which reads as the game ignoring them.
    const inPlay = new Set(s.asteroids.filter((a) => !a.dead).map((a) => a.word));
    const available = WORDS.filter((w) => !inPlay.has(w));
    if (available.length === 0) return;

    const word = available[Math.floor(Math.random() * available.length)];

    // Taken from the pre-baked pool â€” see rockPool. Falls back to baking one
    // only if the pool somehow has not finished, which the intro gate prevents.
    const pool = rockPool.current;
    const picked = pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : { sprite: makeAsteroidSprite(13, 1, ROCK_PALETTES[0]), radius: 13 };
    const { sprite, radius } = picked;

    // Keep the whole label on screen, not just the rock.
    const margin = Math.max(radius, measurePixelText(word) / 2 + 3) + 2;

    s.asteroids.push({
      id: s.nextId++,
      x: Math.round(margin + Math.random() * (VW - margin * 2)),
      y: -radius - 10,
      word,
      speed: s.baseSpeed * (0.85 + Math.random() * 0.4),
      radius,
      sprite,
      drift: (Math.random() - 0.5) * 0.12,
      locked: false,
      dead: false,
    });
  };

  const burst = (x: number, y: number, color: string, count: number) => {
    const s = game.current;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 1.9;
      const life = 14 + Math.random() * 16;
      s.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color,
        size: Math.random() < 0.35 ? 2 : 1,
      });
    }
  };

  const destroy = (target: Asteroid) => {
    const s = game.current;
    target.dead = true;

    s.combo += 1;
    const bonus = Math.min(10, (s.combo - 1) * 2);
    const points = 10 + bonus;
    s.score += points;

    s.lasers.push({ tx: target.x, ty: target.y, age: 0 });
    s.shockwaves.push({ x: target.x, y: target.y, age: 0, color: PALETTE.laser });
    s.muzzleFlash = 5;
    s.shake = 3;
    burst(target.x, target.y, PALETTE.laser, 10);
    burst(target.x, target.y, '#8b95ad', 14);
    s.floaters.push({
      x: target.x,
      y: target.y - 4,
      text: bonus > 0 ? `+${points}!` : `+${points}`,
      age: 0,
      color: bonus > 0 ? PALETTE.gold : PALETTE.text,
    });

    audioSFX.playChoiSuccess();
  };

  // â”€â”€ voice â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleSpeech = (text: string) => {
    const s = game.current;
    if (!s.active) return;

    const spoken = text.toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (spoken.length === 0) return;

    const now = Date.now();
    // The recogniser streams the same interim phrase over and over, so every
    // word in it is considered but each may only fire once per second. Keying
    // the debounce on the word â€” rather than on "the last word changed", which
    // is what this used to do â€” means saying the same word twice in a row
    // works, and so does calling two targets in one breath.
    for (const word of spoken) {
      if (now - (s.firedAt.get(word) ?? 0) < 1000) continue;
      const target = s.asteroids
        .filter((a) => !a.dead && !a.locked && a.word === word)
        .sort((p, q) => q.y - p.y)[0];
      if (!target) continue;
      s.firedAt.set(word, now);
      destroy(target);
    }
  };

  // â”€â”€ the loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const finish = useCallback(() => {
    const earned = Math.min(MAX_POINTS, game.current.score);
    stopEverything();
    setStatus('game_over');
    setTimeout(() => onCompleteRef.current(earned), 4000);
  }, [stopEverything]);

  const timeAccRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const step = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const dt = Math.min(time - lastTimeRef.current, 100);
    lastTimeRef.current = time;

    timeAccRef.current += dt;
    if (timeAccRef.current < 16) {
      rafRef.current = requestAnimationFrame(step);
      return;
    }
    timeAccRef.current -= 16.666;
    if (timeAccRef.current > 16.666) timeAccRef.current = 16.666;

    const s = game.current;
    const canvas = canvasRef.current;
    if (!s.active || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    s.frames++;

    // Difficulty: a new wave every ~12s, each faster and busier. The ramp leans
    // on the spawn rate as much as the speed, because more words in the sky is
    // what actually raises the reading load.
    if (s.frames % 720 === 0) {
      s.wave++;
      s.spawnEvery = Math.max(40, s.spawnEvery - 10);
      s.baseSpeed += 0.05;
      audioSFX.playPowerUpZap();
    }
    if (s.frames % s.spawnEvery === 0) spawnAsteroid();

    if (s.backdrop) updateBackdrop(s.backdrop);

    // Starfield drift.
    for (const star of s.stars) {
      star.y += star.speed;
      if (star.y > VH) {
        star.y = 0;
        star.x = Math.floor(Math.random() * VW);
      }
    }

    // Asteroids.
    for (let i = s.asteroids.length - 1; i >= 0; i--) {
      const a = s.asteroids[i];
      if (a.dead) {
        s.asteroids.splice(i, 1);
        continue;
      }

      a.y += a.speed;
      a.x = Math.max(a.radius, Math.min(VW - a.radius, a.x + a.drift));

      if (!a.locked && a.y > REACH_Y) {
        a.locked = true;
        s.combo = 0;
        audioSFX.playPop();
      }

      if (a.y - a.radius > GROUND_Y) {
        a.dead = true;
        s.lives -= 1;
        s.combo = 0;
        s.shake = 7;
        s.flash = 4;
        burst(a.x, GROUND_Y, PALETTE.danger, 26);
        audioSFX.playWhaalaFailure();
        if (s.lives <= 0) {
          finish();
          return;
        }
      }
    }

    // Aim at the lowest rock still in reach, so the barrel tracks the threat.
    const threat = s.asteroids.filter((a) => !a.dead && !a.locked).sort((p, q) => q.y - p.y)[0];
    s.aimTarget = threat
      ? Math.atan2(threat.y - TURRET_Y, threat.x - TURRET_X)
      : -Math.PI / 2;

    // Shortest-path easing, so the barrel never swings the long way round.
    let delta = s.aimTarget - s.aim;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    s.aim += delta * 0.18;

    // Age the effects.
    if (s.muzzleFlash > 0) s.muzzleFlash--;
    if (s.shake > 0) s.shake = Math.max(0, s.shake - 0.5);
    if (s.flash > 0) s.flash--;

    for (let i = s.lasers.length - 1; i >= 0; i--) {
      if (++s.lasers[i].age > 7) s.lasers.splice(i, 1);
    }
    for (let i = s.shockwaves.length - 1; i >= 0; i--) {
      if (++s.shockwaves[i].age > 12) s.shockwaves.splice(i, 1);
    }
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.045;
      if (--p.life <= 0) s.particles.splice(i, 1);
    }
    for (let i = s.floaters.length - 1; i >= 0; i--) {
      const f = s.floaters[i];
      f.y -= 0.45;
      if (++f.age > 34) s.floaters.splice(i, 1);
    }

    drawFrame(ctx, s);

    // React state drives only the surrounding chrome, so it is updated when a
    // number actually changes rather than sixty times a second.
    setHud((prev) =>
      prev.score === s.score && prev.lives === s.lives && prev.wave === s.wave
        ? prev
        : { score: s.score, lives: s.lives, wave: s.wave }
    );

    if (s.frames % 45 === 0) {
      roomStore.pushLiveState(room.roomId, activePlayer.id, {
        score: s.score,
        status: `Wave ${s.wave} â€” ${s.lives} shield${s.lives === 1 ? '' : 's'} left`,
        prompt: threat?.word,
        good: s.lives > 1,
      });
    }

    rafRef.current = requestAnimationFrame(step);
    // Every helper reads through the ref, so the loop is never rebuilt mid-game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.roomId, activePlayer.id, finish]);

  // â”€â”€ start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const startGame = async () => {
    const accessError = await speechEngine.probeMicPermission();
    if (accessError) {
      setMicError(
        typeof accessError === 'string'
          ? accessError
          : 'Microphone access is needed to fire the laser.'
      );
      return;
    }
    setMicError(null);
    setStatus('playing');

    const heart = game.current.heart ?? makeHeartSprite(PALETTE.danger);
    game.current = {
      ...freshState(),
      heart,
      backdrop: backdropRef.current ?? makeBackdrop(),
      active: true,
    };

    setHud({ score: 0, lives: 3, wave: 1 });
    setTranscript('');

    if (audioRef.current) {
      audioRef.current.volume = 0.25;
      audioRef.current.play().catch(() => {
        /* autoplay refused â€” the game plays perfectly well without music */
      });
    }

    sessionRef.current = speechEngine.listenForSpeech({
      targetWord: '',
      language: 'en-US',
      onResult: (res) => {
        setTranscript(res.transcript);
        handleSpeech(res.transcript);
      },
      onError: () => {
        /* the recogniser restarts itself; a dropped phrase is not fatal */
      },
    });

    // Seed the first rock so the screen is never empty on start.
    spawnAsteroid();
    rafRef.current = requestAnimationFrame(step);
  };

  /**
   * Watches for a round where the recogniser is running but hearing nothing.
   *
   * On a phone this is otherwise indistinguishable from a broken game: the mic
   * indicator is on, words fall, and no laser ever fires. Reading back what the
   * speech layer actually did turns "it doesn't work on mobile" into something
   * with a cause attached.
   */
  useEffect(() => {
    if (status !== 'playing') {
      setSpeechDiag(null);
      return;
    }
    const timer = setInterval(() => {
      const d = speechEngine.getDiagnostics();
      const silentFor = d.startedAt ? Date.now() - d.startedAt : 0;
      setSpeechDiag(d.results === 0 && silentFor > 7000 ? d : null);
    }, 2000);
    return () => clearInterval(timer);
  }, [status]);

  const toggleMic = () => setIsMicMuted(speechEngine.toggleMicMute());

  const toggleBgm = () => {
    if (!audioRef.current) return;
    const next = !bgmMuted;
    audioRef.current.muted = next;
    setBgmMuted(next);
  };

  // â”€â”€ chrome â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="rounded-3xl border border-cyan-500/30 bg-[#080b12] p-3 sm:p-5 space-y-3 shadow-2xl">
      <audio ref={audioRef} src="/audios/psychronic-let-the-games-begin-21858.mp3" loop preload="none" />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl leading-none">â˜„ï¸</span>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black tracking-[0.2em] text-cyan-300">
              ASTEROID DEFENSE
            </h2>
            <p className="text-[10px] sm:text-xs text-cyan-500/80 truncate">
              Call the word on the rock to blast it
            </p>
          </div>
        </div>

        {status === 'playing' && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={toggleBgm}
              aria-label={bgmMuted ? 'Unmute music' : 'Mute music'}
              className="p-2 rounded-lg border border-white/10 bg-black/40 text-gray-300 hover:text-white transition"
            >
              {bgmMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleMic}
              aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`p-2 rounded-lg border transition ${
                isMicMuted
                  ? 'bg-red-500/20 border-red-500/40 text-red-400'
                  : 'bg-black/40 border-white/10 text-gray-300 hover:text-white'
              }`}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

      {/* The screen. Fixed 16:9 so the pixel grid is never stretched â€” the old
          version drew at 600x400 into a wider box, squashing every rock. */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-cyan-900/60 bg-[#080b12]">
        <canvas
          ref={canvasRef}
          width={VW}
          height={VH}
          className="absolute inset-0 w-full h-full"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Nothing heard for several seconds — say why, rather than letting the
            player shout at a game that looks fine. */}
        {speechDiag && (
          <div className="absolute inset-x-2 bottom-2 rounded-lg border border-amber-500/50 bg-black/85 px-3 py-2 text-[10px] leading-relaxed text-amber-200">
            <p className="font-black tracking-wider">NOT HEARING YOU</p>
            <p className="text-amber-300/80">
              {!speechDiag.supported
                ? 'This browser has no speech recognition. Chrome on Android works; Firefox and most in-app browsers do not.'
                : speechDiag.lastError === 'not-allowed' || speechDiag.lastError === 'service-not-allowed'
                ? 'Microphone permission was refused. Tap the padlock in the address bar and allow it.'
                : speechDiag.lastError === 'language-not-supported'
                ? `No speech model for ${speechDiag.locale} on this device.`
                : speechDiag.lastError === 'network'
                ? 'Speech recognition needs a network connection on this device.'
                : 'The microphone opened but no speech came through. Check that another app is not holding it.'}
            </p>
            <p className="mt-1 font-mono text-[9px] text-amber-500/70">
              {speechDiag.locale} · restarts {speechDiag.restarts} · mic{' '}
              {speechDiag.suspendedMic ? 'handed over' : 'shared'} · err {speechDiag.lastError ?? 'none'}
            </p>
          </div>
        )}

        {/* Scanlines, for the arcade cabinet feel. */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25 mix-blend-overlay"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, rgba(0,0,0,0.55) 0px, rgba(0,0,0,0.55) 1px, transparent 1px, transparent 3px)',
          }}
        />

        {status === 'intro' && (
          // Only partly opaque, so the attract loop shows through behind it.
          <div className="absolute inset-0 flex items-center justify-center bg-[#080b12]/70 px-5 text-center">
            <div className="space-y-4 max-w-md rounded-xl border border-cyan-900/60 bg-[#080b12]/90 px-5 py-5">
              <p className="text-cyan-300 font-black tracking-[0.3em] text-xs sm:text-sm animate-pulse">
                INCOMING METEOR SHOWER
              </p>
              <p className="text-[11px] sm:text-sm text-gray-400 leading-relaxed">
                Every rock carries a word. Say it out loud and the station fires.
                They fall faster each wave â€” and anything that drops past the
                <span className="text-cyan-400"> scan line</span> is out of the
                turret&apos;s reach.
              </p>
              {micError && (
                <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {micError}
                </p>
              )}
              <button
                onClick={startGame}
                disabled={!ready}
                className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-900 disabled:text-cyan-500 text-[#080b12] rounded-lg font-black tracking-[0.2em] text-sm shadow-lg shadow-cyan-500/30 transition active:scale-95 disabled:active:scale-100"
              >
                {ready ? 'START DEFENSE' : 'CALIBRATINGâ€¦'}
              </button>
            </div>
          </div>
        )}

        {status === 'game_over' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#080b12]/95 px-5 text-center">
            <div className="space-y-3">
              <h3 className="text-2xl sm:text-3xl font-black tracking-[0.2em] text-red-400">
                STATION BREACHED
              </h3>
              <p className="text-sm text-gray-300">
                Final score <span className="text-yellow-400 font-black">{hud.score}</span> Â· reached
                wave <span className="text-cyan-300 font-black">{hud.wave}</span>
              </p>
              <p className="text-[11px] text-gray-500">Returning to the boardâ€¦</p>
            </div>
          </div>
        )}
      </div>

      {status === 'playing' && (
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="text-gray-500 shrink-0">HEARD</span>
          <span className="flex-1 truncate rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-cyan-300">
            {transcript || 'â€¦'}
          </span>
        </div>
      )}
    </div>
  );
}

