'use client';

// PitchBird — a 2D side-scrolling mini-game where the player's vocal pitch
// controls a flying avatar. Higher pitch = fly up, silence/low = gravity down.
//
// The game renders entirely on an HTML5 Canvas element with a 60fps
// requestAnimationFrame loop. Obstacles scroll from right to left in three
// varieties (high gate, low gate, narrow gap). Score accumulates for every
// gate passed and for distance travelled.
//
// This component is self-contained: it manages its own game loop, physics,
// collision detection, rendering, and audio feedback. The parent only needs
// to provide the player object and a completion callback.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Player } from '@/lib/types';
import { usePitchDetection, CALIBRATION_MS } from '@/hooks/usePitchDetection';
import { audioSFX } from '@/lib/audioFeedback';
import { roomStore } from '@/lib/roomStore';
import { Mic, MicOff, Volume2 } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────

const CANVAS_W = 800;
const CANVAS_H = 500;

// Pitch commands POSITION, not acceleration.
//
// The first version applied gravity and a lift force and integrated twice, so
// the player was steering acceleration. Holding a steady note meant a constant
// net force, so you accelerated into the ceiling instead of hovering — the only
// way to hold height was to pin lift at exactly GRAVITY/LIFT_FORCE and never
// drift, which is not humanly possible with a voice.
//
// Now pitch maps directly to a target height and the bird is pulled toward it
// by a damped spring. Sing a note, sit at that height. This is how pitch-driven
// games like Pitch Hero handle it.

/** Pull toward the pitch's target height. Lower = smooth & controlled acceleration. */
const SPRING = 0.06;
/** Velocity retained per frame for smooth, stable damping. */
const DAMPING = 0.82;
/** Safety clamp so the bird moves at a controlled, comfortable speed. */
const MAX_VY = 7;

/** Playable band, inset from the canvas edges so the extremes stay reachable. */
const TOP_MARGIN = 60;
const BOTTOM_MARGIN = 60;

const PLAYER_RADIUS = 22;

const GATE_WIDTH = 50;
// Gate difficulty is set by the safe-zone half-width at spawn time (see the
// gate-spawning block), not by a raw gap size — the window has to be expressed
// in terms of the player's reachable band to stay flyable.
// Pacing is set against how fast a voice can actually move the bird: a full
// traverse of the playable band takes ~0.8s, so gates need to arrive slowly
// enough to sing your way between two of them without rushing.
const INITIAL_SPEED = 4.0;      // px/frame scroll speed
const MAX_SPEED = 8.0;
const SPEED_RAMP = 0.004;      // speed increase per frame

const GATE_SPAWN_INTERVAL_START = 240; // frames (~4s at 60fps)
const GATE_SPAWN_INTERVAL_MIN = 150;   // frames (~2.5s)

// ── Types ──────────────────────────────────────────────────────────────────

type GateType = 'high' | 'low' | 'steady';

interface Gate {
  x: number;
  gapTop: number;    // top of the gap opening
  gapBottom: number;  // bottom of the gap opening
  type: GateType;
  passed: boolean;
  scored: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

type GameState = 'calibrating' | 'playing' | 'crashed' | 'finished';

// ── Parallax city layer definitions ────────────────────────────────────────

interface CityLayer {
  speed: number;     // relative to scroll speed (0–1)
  color: string;
  buildingHeights: number[]; // 0–1 normalised heights
  offset: number;    // current scroll offset (mutated in-place each frame)
}

function makeCityLayers(): CityLayer[] {
  const randHeights = (n: number, min: number, max: number) =>
    Array.from({ length: n }, () => min + Math.random() * (max - min));

  return [
    { speed: 0.1, color: 'rgba(30,20,50,0.6)', buildingHeights: randHeights(20, 0.15, 0.35), offset: 0 },
    { speed: 0.25, color: 'rgba(45,30,70,0.6)', buildingHeights: randHeights(15, 0.2, 0.5), offset: 0 },
    { speed: 0.45, color: 'rgba(60,40,90,0.7)', buildingHeights: randHeights(12, 0.25, 0.65), offset: 0 },
  ];
}

// ── Component ──────────────────────────────────────────────────────────────

interface PitchBirdCanvasProps {
  player: Player;
  /** Needed so spectators can be shown what is happening. */
  roomId: string;
  onComplete: (score: number) => void;
}

export default function PitchBirdCanvas({ player, roomId, onComplete }: PitchBirdCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const {
    pitch,
    volume,
    lift,
    isCalibrated,
    isActive,
    startCalibration,
    stopDetection,
  } = usePitchDetection();

  const [gameState, setGameState] = useState<GameState>('calibrating');
  const [finalScore, setFinalScore] = useState(0);
  const [micError, setMicError] = useState(false);
  const [calCountdown, setCalCountdown] = useState(Math.round(CALIBRATION_MS / 1000));

  // Game state refs (mutated in the animation loop, not React state)
  const stateRef = useRef({
    playerY: CANVAS_H / 2,
    vy: 0,
    score: 0,
    distance: 0,
    gates: [] as Gate[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    frameCount: 0,
    scrollSpeed: INITIAL_SPEED,
    nextGateIn: 210,
    spawnedGateCount: 0,
    cityLayers: makeCityLayers(),
    flashAlpha: 0,
    flashColor: 'red',
    shakeX: 0,
    shakeY: 0,
    overheating: false,
    overheatCooldown: 0,
    scrapeThrottle: 0,
    gameState: 'calibrating' as GameState,
  });

  // Load the player avatar image
  const avatarImgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const faceUrl = player.avatar.faceUrl;
    if (faceUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = faceUrl;
      avatarImgRef.current = img;
    }
  }, [player.avatar.faceUrl]);

  // ─── Calibration ─────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await startCalibration();
      if (!ok && !cancelled) setMicError(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer during calibration
  useEffect(() => {
    if (gameState !== 'calibrating') return;
    const interval = setInterval(() => {
      setCalCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState]);

  // Transition to playing when calibrated
  useEffect(() => {
    if (isCalibrated && gameState === 'calibrating') {
      setGameState('playing');
      stateRef.current.gameState = 'playing';
    }
  }, [isCalibrated, gameState]);

  // ─── Game Loop ───────────────────────────────────────────────────────

  const liftRef = useRef(0);
  const volumeRef = useRef(0);
  const pitchRef = useRef(0);
  liftRef.current = lift;
  volumeRef.current = volume;
  pitchRef.current = pitch;

  const handleCrash = useCallback((score: number) => {
    setGameState('crashed');
    setFinalScore(score);
    stateRef.current.gameState = 'crashed';
    audioSFX.playCrashBoom();

    // Shake the wrapper
    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.style.animation = 'none';
      void wrapper.offsetHeight;
      wrapper.style.animation = 'panicShake 0.3s ease-in-out 3';
    }
  }, []);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const s = stateRef.current;
    s.playerY = CANVAS_H / 2;
    s.vy = 0;
    s.score = 0;
    s.distance = 0;
    s.gates = [];
    s.particles = [];
    s.floatingTexts = [];
    s.frameCount = 0;
    s.scrollSpeed = INITIAL_SPEED;
    // First gate spawns quickly (~1.2s) so player doesn't wait in empty air.
    s.nextGateIn = 75;
    s.spawnedGateCount = 0;
    s.cityLayers = makeCityLayers();

    const loop = () => {
      if (s.gameState !== 'playing') return;

      s.frameCount++;
      s.distance += s.scrollSpeed;
      s.scrollSpeed = Math.min(MAX_SPEED, INITIAL_SPEED + s.frameCount * SPEED_RAMP);

      const currentLift = liftRef.current;
      const currentVolume = volumeRef.current;

      // ── Pitch & Volume → Responsive Flight Physics ─────────────
      if (currentLift > 0.01) {
        const lowY = CANVAS_H - BOTTOM_MARGIN - PLAYER_RADIUS;
        const highY = TOP_MARGIN + PLAYER_RADIUS;
        // Pitch/Volume drives target height with instant 0.12 spring factor
        const targetY = lowY - currentLift * (lowY - highY);
        s.vy += (targetY - s.playerY) * 0.12;
        s.vy *= 0.82;
      } else {
        // Gravity pulls bird down instantly when voice stops
        s.vy += 0.55;
        s.vy *= 0.88;
      }

      s.vy = Math.max(-8, Math.min(8, s.vy));
      s.playerY += s.vy;

      // Clamp to canvas bounds
      if (s.playerY < PLAYER_RADIUS) {
        s.playerY = PLAYER_RADIUS;
        s.vy = 0;
      }
      if (s.playerY > CANVAS_H - PLAYER_RADIUS) {
        s.playerY = CANVAS_H - PLAYER_RADIUS;
        s.vy = 0;
        // Ground scrape effect
        if (s.scrapeThrottle <= 0) {
          audioSFX.playTireScrape();
          s.scrapeThrottle = 15;
          // Spark particles
          for (let i = 0; i < 3; i++) {
            s.particles.push({
              x: 100 - PLAYER_RADIUS,
              y: CANVAS_H - PLAYER_RADIUS + 5,
              vx: -1 - Math.random() * 2,
              vy: -1 - Math.random() * 3,
              life: 15 + Math.random() * 10,
              color: Math.random() > 0.5 ? '#FFD000' : '#FF5722',
            });
          }
        }
      }
      if (s.scrapeThrottle > 0) s.scrapeThrottle--;

      // ── Overheating check (screaming too loud) ───────────────────
      if (currentVolume > 88) {
        s.overheating = true;
        s.overheatCooldown = 60;
      } else if (s.overheatCooldown > 0) {
        s.overheatCooldown--;
        if (s.overheatCooldown <= 0) s.overheating = false;
      }

      // Let the room watch: distance and score, throttled in roomStore.
      if (roomId) {
        roomStore.pushLiveState(roomId, player.id, {
          prompt: `${Math.floor(s.distance / 10)}m`,
          detail: 'flying on pitch',
          score: s.score,
          status: s.overheating ? 'straining!' : 'in the air',
          good: true,
        });
      }

      // ── Gate spawning ────────────────────────────────────────────
      s.nextGateIn--;
      if (s.nextGateIn <= 0) {
        s.spawnedGateCount++;

        // The opener is deliberately the middle gate. The bird floats at
        // mid-height when nobody is singing, so a 'high' first gate asked the
        // player to already be at the top of their range before they had worked
        // out what the game wanted — an unwinnable start.
        let gateType: GateType;
        if (s.spawnedGateCount === 1) {
          gateType = 'steady'; // 1st: right where the bird already is
        } else if (s.spawnedGateCount === 2) {
          gateType = 'high';   // 2nd: fly high — raise your voice
        } else if (s.spawnedGateCount === 3) {
          gateType = 'low';    // 3rd: dive low — lower your voice
        } else {
          gateType = ['high', 'low', 'steady'][Math.floor(Math.random() * 3)] as GateType;
        }

        // Gates are built from the safe zone the player must hold, then the
        // walls are derived from it. Doing it the other way round is how the
        // previous version ended up with a "RAISE VOICE" gate whose safe zone
        // excluded the top of the player's range.
        //
        // bandTop = highest note, bandBottom = lowest note. Every gate must
        // leave a reachable window inside that band, or it is unflyable.
        const bandTop = TOP_MARGIN + PLAYER_RADIUS;
        const bandBottom = CANVAS_H - BOTTOM_MARGIN - PLAYER_RADIUS;

        // The window shrinks as the run goes on, but stays generous: this is a
        // party mini-game feeding a board game, not a precision test. The floor
        // covers the spring's ~12px overshoot, the lag through the median
        // filter, and the fact that a voice simply is not a joystick.
        const safeHalf = Math.max(80, 130 - s.frameCount * 0.008);

        // Each type parks the window in a different third of the vocal range,
        // far enough from the edges that the target stays reachable.
        // Calculate clear, guaranteed-passable maneuvering gaps for each gate type.
        // CANVAS_H = 500. A gap of 180px-240px leaves generous space for the avatar (radius 22px).
        let gapTop: number;
        let gapBottom: number;

        if (gateType === 'high') {
          // RAISE VOICE ⬆️: Single bottom pillar standing up from gapTop to CANVAS_H.
          // Open sky passage above: 0 to gapTop (190px–240px open air!).
          gapTop = 210 + (Math.random() - 0.5) * 40;
          gapBottom = CANVAS_H;
        } else if (gateType === 'low') {
          // LOWER VOICE ⬇️: Single top pillar hanging down from 0 to gapTop.
          // Open ground passage below: gapTop to CANVAS_H (200px–240px open passage!).
          gapTop = 280 + (Math.random() - 0.5) * 40;
          gapBottom = CANVAS_H;
        } else {
          // HOLD STEADY 🎵: Double pillar (top 0..gapTop, bottom gapBottom..CANVAS_H).
          // Open middle passage: gapTop to gapBottom (190px generous opening!).
          const center = 250 + (Math.random() - 0.5) * 40;
          gapTop = center - 95;
          gapBottom = center + 95;
        }

        s.gates.push({
          x: CANVAS_W + GATE_WIDTH,
          gapTop,
          gapBottom,
          type: gateType,
          passed: false,
          scored: false,
        });

        const spawnInterval = Math.max(
          GATE_SPAWN_INTERVAL_MIN,
          GATE_SPAWN_INTERVAL_START - s.frameCount * 0.12
        );
        s.nextGateIn = spawnInterval;
      }

      // ── Gate movement + collision ────────────────────────────────
      const playerX = 100;
      for (const gate of s.gates) {
        gate.x -= s.scrollSpeed;

        // Check if player is inside gate column
        if (
          !gate.passed &&
          playerX + PLAYER_RADIUS > gate.x &&
          playerX - PLAYER_RADIUS < gate.x + GATE_WIDTH
        ) {
          let hasCrashed = false;
          if (gate.type === 'high') {
            // Single bottom pillar standing up from gapTop down to CANVAS_H
            // Hits if player Y + radius goes below gapTop (into the pillar)
            if (s.playerY + PLAYER_RADIUS > gate.gapTop) hasCrashed = true;
          } else if (gate.type === 'low') {
            // Single top pillar hanging down from 0 to gapTop
            // Hits if player Y - radius goes above gapTop (into top pillar)
            if (s.playerY - PLAYER_RADIUS < gate.gapTop) hasCrashed = true;
          } else {
            // Double pillar (top wall 0..gapTop, bottom wall gapBottom..CANVAS_H)
            if (s.playerY - PLAYER_RADIUS < gate.gapTop || s.playerY + PLAYER_RADIUS > gate.gapBottom) {
              hasCrashed = true;
            }
          }

          if (hasCrashed) {
            // CRASH!
            s.flashAlpha = 0.6;
            s.flashColor = 'rgba(255,50,50,0.6)';
            gate.passed = true;
            handleCrash(s.score);
            return;
          }
        }

        // Score when player passes the gate
        if (!gate.scored && gate.x + GATE_WIDTH < playerX - PLAYER_RADIUS) {
          gate.scored = true;
          gate.passed = true;
          const gap = gate.gapBottom - gate.gapTop;
          const points = gap < 140 ? 150 : 100;
          s.score += points;
          audioSFX.playGatePassed();

          s.floatingTexts.push({
            x: playerX + 30,
            y: s.playerY - 30,
            text: `+${points}`,
            life: 50,
            color: '#00E676',
          });

          s.flashAlpha = 0.15;
          s.flashColor = 'rgba(0,230,118,0.3)';
        }
      }

      // Remove off-screen gates
      s.gates = s.gates.filter((g) => g.x + GATE_WIDTH > -20);

      // Distance score (1 point per ~60 frames)
      if (s.frameCount % 60 === 0) s.score += 10;

      // ── Particles ────────────────────────────────────────────────
      s.particles = s.particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life--;
        return p.life > 0;
      });

      // ── Floating texts ───────────────────────────────────────────
      s.floatingTexts = s.floatingTexts.filter((t) => {
        t.y -= 1;
        t.life--;
        return t.life > 0;
      });

      // Flash decay
      if (s.flashAlpha > 0) s.flashAlpha -= 0.02;

      // ── Rendering ────────────────────────────────────────────────
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      skyGrad.addColorStop(0, '#0a0a2e');
      skyGrad.addColorStop(0.4, '#1a103a');
      skyGrad.addColorStop(0.7, '#2d1854');
      skyGrad.addColorStop(1, '#1a0a30');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Stars
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 97 + s.frameCount * 0.05) % CANVAS_W);
        const sy = (i * 53) % (CANVAS_H * 0.5);
        const sr = 0.5 + (Math.sin(s.frameCount * 0.02 + i) + 1) * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Parallax city layers
      for (const layer of s.cityLayers) {
        layer.offset = (layer.offset + s.scrollSpeed * layer.speed) % CANVAS_W;
        const bw = CANVAS_W / layer.buildingHeights.length;

        ctx.fillStyle = layer.color;
        for (let i = 0; i < layer.buildingHeights.length + 2; i++) {
          const bh = layer.buildingHeights[i % layer.buildingHeights.length] * CANVAS_H * 0.5;
          const bx = i * bw - layer.offset;
          ctx.fillRect(bx, CANVAS_H - bh, bw - 2, bh);

          // Lit windows
          if (layer.speed > 0.2) {
            ctx.fillStyle = `rgba(255,208,0,${0.15 + Math.sin(s.frameCount * 0.01 + i) * 0.1})`;
            for (let wy = CANVAS_H - bh + 8; wy < CANVAS_H - 8; wy += 14) {
              for (let wx = bx + 4; wx < bx + bw - 6; wx += 10) {
                if (((i + Math.floor(wy / 14)) * 7) % 3 !== 0) {
                  ctx.fillRect(wx, wy, 4, 6);
                }
              }
            }
            ctx.fillStyle = layer.color;
          }
        }
      }

      // Ground line
      ctx.fillStyle = '#3b0764';
      ctx.fillRect(0, CANVAS_H - 4, CANVAS_W, 4);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(0, CANVAS_H - 5, CANVAS_W, 1);

      // ── Gates ────────────────────────────────────────────────────
      for (const gate of s.gates) {
        const gateColor = gate.type === 'high' ? '#ef4444' : gate.type === 'low' ? '#3b82f6' : '#eab308';
        const gateGlow = gate.type === 'high' ? 'rgba(239,68,68,0.35)' : gate.type === 'low' ? 'rgba(59,130,246,0.35)' : 'rgba(234,179,8,0.35)';

        if (gate.type === 'high') {
          // Single bottom pillar standing UP from ground (gapTop to CANVAS_H)
          ctx.fillStyle = gateGlow;
          ctx.fillRect(gate.x - 4, gate.gapTop - 4, GATE_WIDTH + 8, CANVAS_H - gate.gapTop + 4);
          ctx.fillStyle = gateColor;
          ctx.fillRect(gate.x, gate.gapTop, GATE_WIDTH, CANVAS_H - gate.gapTop);

          // Glowing top cap light
          ctx.fillStyle = '#ffedd5';
          ctx.fillRect(gate.x - 2, gate.gapTop, GATE_WIDTH + 4, 8);

          // Hazard stripes
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          for (let sy = gate.gapTop + 10; sy < CANVAS_H; sy += 16) {
            ctx.fillRect(gate.x, sy, GATE_WIDTH, 4);
          }
        } else if (gate.type === 'low') {
          // Single top pillar hanging DOWN from ceiling (0 to gapTop)
          ctx.fillStyle = gateGlow;
          ctx.fillRect(gate.x - 4, 0, GATE_WIDTH + 8, gate.gapTop + 4);
          ctx.fillStyle = gateColor;
          ctx.fillRect(gate.x, 0, GATE_WIDTH, gate.gapTop);

          // Glowing bottom cap light
          ctx.fillStyle = '#dbeafe';
          ctx.fillRect(gate.x - 2, gate.gapTop - 8, GATE_WIDTH + 4, 8);

          // Hazard stripes
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          for (let sy = 0; sy < gate.gapTop - 8; sy += 16) {
            ctx.fillRect(gate.x, sy, GATE_WIDTH, 4);
          }
        } else {
          // Double pillar (top wall 0..gapTop, bottom wall gapBottom..CANVAS_H)
          ctx.fillStyle = gateGlow;
          ctx.fillRect(gate.x - 4, 0, GATE_WIDTH + 8, gate.gapTop + 4);
          ctx.fillRect(gate.x - 4, gate.gapBottom - 4, GATE_WIDTH + 8, CANVAS_H - gate.gapBottom + 4);

          ctx.fillStyle = gateColor;
          ctx.fillRect(gate.x, 0, GATE_WIDTH, gate.gapTop);
          ctx.fillRect(gate.x, gate.gapBottom, GATE_WIDTH, CANVAS_H - gate.gapBottom);

          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          for (let sy = 0; sy < gate.gapTop; sy += 16) {
            ctx.fillRect(gate.x, sy, GATE_WIDTH, 4);
          }
          for (let sy = gate.gapBottom; sy < CANVAS_H; sy += 16) {
            ctx.fillRect(gate.x, sy, GATE_WIDTH, 4);
          }
        }

        // Gate label
        if (gate.x > 0 && gate.x < CANVAS_W) {
          ctx.save();
          ctx.font = 'bold 11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';

          let labelText = '';
          let labelY = 0;

          if (gate.type === 'high') {
            labelText = 'RAISE VOICE ⬆️';
            labelY = Math.max(25, gate.gapTop - 15);
          } else if (gate.type === 'low') {
            labelText = 'LOWER VOICE ⬇️';
            labelY = Math.min(CANVAS_H - 25, gate.gapTop + 25);
          } else {
            labelText = 'HOLD STEADY 🎵';
            labelY = gate.gapTop + (gate.gapBottom - gate.gapTop) / 2 + 4;
          }

          // Label pill background
          const labelWidth = ctx.measureText(labelText).width + 12;
          ctx.fillStyle = 'rgba(11,14,27,0.85)';
          ctx.fillRect(gate.x + GATE_WIDTH / 2 - labelWidth / 2, labelY - 10, labelWidth, 16);

          ctx.fillStyle = '#FFD000';
          ctx.fillText(labelText, gate.x + GATE_WIDTH / 2, labelY + 2);
          ctx.restore();
        }
      }

      // ── Player avatar ────────────────────────────────────────────
      ctx.save();

      // Overheating glow
      if (s.overheating) {
        const heatGrad = ctx.createRadialGradient(
          playerX, s.playerY, PLAYER_RADIUS,
          playerX, s.playerY, PLAYER_RADIUS * 3
        );
        heatGrad.addColorStop(0, 'rgba(255,87,34,0.5)');
        heatGrad.addColorStop(0.5, 'rgba(255,30,0,0.2)');
        heatGrad.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = heatGrad;
        ctx.beginPath();
        ctx.arc(playerX, s.playerY, PLAYER_RADIUS * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Volume-reactive halo
      const haloSize = PLAYER_RADIUS + 6 + (currentVolume / 100) * 12;
      const haloGrad = ctx.createRadialGradient(
        playerX, s.playerY, PLAYER_RADIUS,
        playerX, s.playerY, haloSize
      );
      haloGrad.addColorStop(0, `rgba(0,230,118,${0.3 + currentVolume / 300})`);
      haloGrad.addColorStop(1, 'rgba(0,230,118,0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(playerX, s.playerY, haloSize, 0, Math.PI * 2);
      ctx.fill();

      // Avatar circle
      ctx.beginPath();
      ctx.arc(playerX, s.playerY, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (avatarImgRef.current?.complete && avatarImgRef.current.naturalWidth > 0) {
        ctx.drawImage(
          avatarImgRef.current,
          playerX - PLAYER_RADIUS,
          s.playerY - PLAYER_RADIUS,
          PLAYER_RADIUS * 2,
          PLAYER_RADIUS * 2
        );
      } else {
        // Fallback: coloured circle with emoji
        ctx.fillStyle = player.avatar.color;
        ctx.fill();
        ctx.font = '20px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(player.avatar.emoji, playerX, s.playerY);
      }

      ctx.restore();

      // Avatar border ring
      ctx.strokeStyle = s.overheating ? '#FF5722' : player.avatar.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(playerX, s.playerY, PLAYER_RADIUS + 1, 0, Math.PI * 2);
      ctx.stroke();

      // ── Particles ────────────────────────────────────────────────
      for (const p of s.particles) {
        ctx.globalAlpha = p.life / 25;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ── Floating texts ───────────────────────────────────────────
      for (const t of s.floatingTexts) {
        ctx.globalAlpha = Math.min(1, t.life / 20);
        ctx.font = 'bold 18px system-ui';
        ctx.fillStyle = t.color;
        ctx.textAlign = 'center';
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;

      // ── "Choi, take am easy!" popup ──────────────────────────────
      if (s.overheating) {
        ctx.save();
        const popupW = 180;
        const popupH = 32;
        const popupX = playerX + PLAYER_RADIUS + 15;
        const popupY = s.playerY - 30;

        ctx.fillStyle = 'rgba(255,87,34,0.9)';
        ctx.beginPath();
        ctx.roundRect(popupX, popupY, popupW, popupH, 8);
        ctx.fill();

        ctx.font = 'bold 11px system-ui';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText('🔥 Choi, take am easy!', popupX + 10, popupY + 20);
        ctx.restore();
      }

      // ── Flash overlay ────────────────────────────────────────────
      if (s.flashAlpha > 0) {
        ctx.fillStyle = s.flashColor;
        ctx.globalAlpha = s.flashAlpha;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.globalAlpha = 1;
      }

      // ── HUD ──────────────────────────────────────────────────────

      // Score
      ctx.save();
      ctx.font = 'bold 16px system-ui';
      ctx.fillStyle = '#FFD000';
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      ctx.fillText(`SCORE: ${s.score}`, 16, 30);

      // Distance
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#aaa';
      ctx.fillText(`${Math.floor(s.distance / 10)}m`, 16, 48);

      // Pitch readout
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px system-ui';
      ctx.fillStyle = pitchRef.current > 0 ? '#00E676' : '#666';
      ctx.fillText(`${pitchRef.current > 0 ? pitchRef.current + ' Hz' : '—'}`, CANVAS_W - 16, 30);

      // Volume bar
      const vBarW = 60;
      const vBarH = 6;
      const vBarX = CANVAS_W - 16 - vBarW;
      const vBarY = 38;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(vBarX, vBarY, vBarW, vBarH);
      ctx.fillStyle = currentVolume > 85 ? '#FF5722' : '#00E676';
      ctx.fillRect(vBarX, vBarY, (currentVolume / 100) * vBarW, vBarH);
      ctx.restore();

      // ── Pitch gauge (right side vertical bar) ────────────────────
      const gaugeX = CANVAS_W - 20;
      const gaugeTop = 60;
      const gaugeH = CANVAS_H - 80;

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(gaugeX - 5, gaugeTop, 10, gaugeH);

      // Lift indicator
      const liftY = gaugeTop + gaugeH * (1 - currentLift);
      ctx.fillStyle = '#00E676';
      ctx.beginPath();
      ctx.arc(gaugeX, liftY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Labels
      ctx.font = '9px system-ui';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.fillText('HIGH', gaugeX, gaugeTop - 4);
      ctx.fillText('LOW', gaugeX, gaugeTop + gaugeH + 14);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [gameState, handleCrash, player.avatar.color, player.avatar.emoji]);

  // ─── Completion handler ──────────────────────────────────────────────

  const handleFinish = useCallback(() => {
    stopDetection();
    onComplete(finalScore);
  }, [stopDetection, onComplete, finalScore]);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div
        ref={wrapperRef}
        className="glass-card rounded-3xl p-3 sm:p-4 border border-partyPurple/50 relative overflow-hidden"
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-2 mb-2">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🐦</span>
            <div>
              <h3 className="text-sm font-black text-white tracking-wider uppercase">
                PitchBird — Qualifying Round
              </h3>
              <p className="text-[10px] text-gray-400">
                Hold a note to hold a height. Your score sets how far you move.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isActive ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-500/30">
                <Mic className="w-3 h-3" /> LIVE
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 bg-red-500/20 px-2.5 py-1 rounded-full border border-red-500/30">
                <MicOff className="w-3 h-3" /> OFF
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400 bg-white/5 px-2 py-1 rounded-full">
              <Volume2 className="w-3 h-3" /> {volume}%
            </span>
          </div>
        </div>

        {/* Calibration overlay */}
        {gameState === 'calibrating' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-3xl">
            <div className="text-center space-y-4 px-6">
              <div className="text-6xl animate-bounce">🎤</div>
              <h3 className="text-2xl font-black text-white">CALIBRATING YOUR VOICE</h3>
              <p className="text-sm text-gray-300 max-w-xs mx-auto">
                Slide <span className="text-partyYellow font-bold">&quot;AHHH&quot;</span> from your{' '}
                <span className="text-blue-400 font-bold">DEEPEST</span> voice up to your{' '}
                <span className="text-red-400 font-bold">HIGHEST</span> squeak.
              </p>
              <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                Go for the full range — one flat note here makes the bird twitchy.
              </p>
              <div className="text-5xl font-black text-partyYellow animate-pulse">
                {calCountdown > 0 ? calCountdown : '🚀'}
              </div>
              {pitch > 0 && (
                <p className="text-xs text-emerald-400 font-mono">
                  Detecting: {pitch} Hz — Volume: {volume}%
                </p>
              )}
              {micError && (
                <p className="text-xs text-red-400">
                  Microphone error — check permissions and try again.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Crashed overlay */}
        {gameState === 'crashed' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm rounded-3xl">
            <div className="text-center space-y-4 px-6">
              <div className="text-6xl">💥</div>
              <h3 className="text-3xl font-black text-white">CRASH!</h3>
              <p className="text-sm text-gray-300">
                You flew <span className="font-bold text-partyYellow">{Math.floor(stateRef.current.distance / 10)}m</span>
              </p>
              <p className="text-2xl font-black text-partyYellow">+{finalScore} POINTS</p>
              <button
                onClick={handleFinish}
                className="bg-partyYellow hover:bg-yellow-400 text-partyDark font-black text-base px-8 py-3.5 rounded-2xl transition-all shadow-xl"
              >
                CONTINUE TO ROADMAP →
              </button>
            </div>
          </div>
        )}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full rounded-2xl border border-white/10"
          style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}`, imageRendering: 'auto' }}
        />
      </div>

      {/* Controls hint */}
      {gameState === 'playing' && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="glass-pill rounded-xl px-3 py-2 border border-red-500/30">
            <p className="text-red-400 font-black text-xs">⬆️ SCREAM</p>
            <p className="text-[10px] text-gray-400">Fly over NEPA cables</p>
          </div>
          <div className="glass-pill rounded-xl px-3 py-2 border border-yellow-500/30">
            <p className="text-yellow-400 font-black text-xs">🎵 HUM</p>
            <p className="text-[10px] text-gray-400">Steady through gaps</p>
          </div>
          <div className="glass-pill rounded-xl px-3 py-2 border border-blue-500/30">
            <p className="text-blue-400 font-black text-xs">⬇️ WHISPER</p>
            <p className="text-[10px] text-gray-400">Duck under bridges</p>
          </div>
        </div>
      )}
    </div>
  );
}
