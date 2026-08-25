/**
 * Rendering for Asteroid Defense.
 *
 * Kept apart from the component so the look can be inspected and tweaked
 * without a live microphone session, and so the game loop reads as game logic
 * rather than as six hundred lines of fillRect.
 *
 * Everything is drawn on a 320x180 grid and scaled up by CSS with smoothing
 * off. Nothing in here may use fractional coordinates — a half-pixel rectangle
 * is anti-aliased by the browser, and one blurry edge is enough to break the
 * illusion that this is pixel art.
 */

import { drawPixelText, drawPixelTextShadowed, measurePixelText } from './pixelFont';
import {
  BakedSprite,
  makeNebulaLayer,
  makePlanetSprite,
  makeSatelliteSprite,
  makeShipSprite,
} from './pixelSprites';

export const VW = 320;
export const VH = 180;

/** Below this line the turret can no longer traverse — the "out of reach" zone. */
export const REACH_Y = VH - 52;
/** Where the station hull starts. */
export const GROUND_Y = VH - 26;
export const TURRET_X = VW / 2;
export const TURRET_Y = GROUND_Y - 6;

export const PALETTE = {
  space: '#080b12',
  starFar: '#2a3852',
  starMid: '#6d8bb8',
  starNear: '#eef4ff',
  hull: '#161d2b',
  hullLit: '#2c3a52',
  hullEdge: '#5c76a3',
  hullRim: '#8fb4d9',
  window: '#ffd67a',
  windowDim: '#3a4258',
  dome: '#123240',
  domeLit: '#2b8ba3',
  steel: '#7c8aa5',
  steelLit: '#b9c6db',
  reach: '#1f6f6b',
  horizon: '#0f2a3a',
  thruster: '#ff9d4a',
  cometHead: '#ffffff',
  cometTail: '#8fd7ff',
  laser: '#a5f3fc',
  laserCore: '#ffffff',
  laserGlow: '#22d3ee',
  text: '#f0f6fc',
  gold: '#ffd000',
  danger: '#ef4444',
  plate: '#070a10',
};

export interface Asteroid {
  id: number;
  x: number;
  y: number;
  word: string;
  speed: number;
  radius: number;
  sprite: BakedSprite;
  /** Slow horizontal drift, so a column of rocks never marches in a line. */
  drift: number;
  /** Set once it drops past the reach line and can no longer be shot. */
  locked: boolean;
  dead: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface Laser {
  tx: number;
  ty: number;
  age: number;
}

export interface Shockwave {
  x: number;
  y: number;
  age: number;
  color: string;
}

export interface FloatingScore {
  x: number;
  y: number;
  text: string;
  age: number;
  color: string;
}

export interface Star {
  x: number;
  y: number;
  speed: number;
  color: string;
}

// ── the environment ─────────────────────────────────────────────────────────
//
// Everything below is scenery: it never interacts with the game, it exists so
// the sky is somewhere rather than a black rectangle. All of it is baked at
// load and moves at a fraction of the gameplay speed, so it reads as depth
// instead of competing with the rocks the player has to read.

/** A large body parked in the background, drifting almost imperceptibly. */
export interface Body {
  sprite: BakedSprite;
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  /** Drawn dimmed, so it never fights the foreground for attention. */
  alpha: number;
}

/** A ship or satellite crossing the frame, respawning off-screen. */
export interface Traffic {
  sprite: BakedSprite;
  x: number;
  y: number;
  vx: number;
  alpha: number;
  /** Frames until it enters again after leaving. */
  cooldown: number;
  flipped: boolean;
  trail: boolean;
}

/** Tumbling junk in the middle distance. */
export interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

/** A comet streaking across, on a long random timer. */
export interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  cooldown: number;
}

export interface Backdrop {
  nebula: BakedSprite | null;
  nebulaX: number;
  bodies: Body[];
  traffic: Traffic[];
  debris: Debris[];
  comet: Comet;
}

export interface SceneState {
  asteroids: Asteroid[];
  particles: Particle[];
  lasers: Laser[];
  shockwaves: Shockwave[];
  floaters: FloatingScore[];
  stars: Star[];
  score: number;
  lives: number;
  wave: number;
  combo: number;
  frames: number;
  /** Where the barrel currently points. */
  aim: number;
  muzzleFlash: number;
  shake: number;
  flash: number;
  heart: BakedSprite | null;
  backdrop: Backdrop | null;
}

/**
 * Builds the scenery. Called once, off the game loop.
 *
 * Roughly 4ms of pixel work, which is why it happens while the intro card is up
 * rather than on the first frame — and why the rocks come from a pre-baked pool
 * instead of being generated at spawn time.
 */
export function makeBackdrop(): Backdrop {
  const nebula = makeNebulaLayer(VW, VH, 20260813, ['#131c33', '#1b2647', '#26325e']);

  const gasGiant = makePlanetSprite({
    radius: 34,
    seed: 7717,
    palette: ['#2a1d3d', '#4a2f57', '#6b4372', '#a06a94'],
    ring: true,
    limb: '#e6b3d8',
  });
  // Deliberately larger and bluer than any rock. A grey body at rock scale
  // reads as a target, and the player wastes a breath calling a word at it.
  const moon = makePlanetSprite({
    radius: 19,
    seed: 4242,
    palette: ['#151d2e', '#213049', '#2f4468', '#3f5c8a'],
    limb: '#7fa6d9',
  });

  return {
    nebula,
    nebulaX: 0,
    // Dim: scenery has to sit clearly behind the rocks the player must read.
    bodies: [
      { sprite: gasGiant, x: 254, y: 40, driftX: -0.006, driftY: 0.002, alpha: 0.45 },
      { sprite: moon, x: 46, y: 104, driftX: -0.011, driftY: -0.003, alpha: 0.4 },
    ],
    traffic: [
      {
        sprite: makeShipSprite('#4a5f82', '#7fe3ff', '#ff9d4a'),
        x: -30,
        y: 30,
        vx: 0.32,
        alpha: 0.85,
        cooldown: 240,
        flipped: false,
        trail: true,
      },
      {
        sprite: makeSatelliteSprite('#5c6a80', '#2e5fa3', '#ffd000'),
        x: VW + 20,
        y: 112,
        vx: -0.14,
        alpha: 0.7,
        cooldown: 900,
        flipped: false,
        trail: false,
      },
    ],
    debris: Array.from({ length: 16 }, () => ({
      x: Math.random() * VW,
      y: Math.random() * VH,
      vx: (Math.random() - 0.5) * 0.1,
      vy: 0.04 + Math.random() * 0.09,
      size: Math.random() < 0.25 ? 2 : 1,
      color: Math.random() < 0.5 ? '#39404f' : '#4a5568',
    })),
    comet: { x: 0, y: 0, vx: 0, vy: 0, life: 0, cooldown: 400 },
  };
}

/** Advances the scenery. Separate from drawing so a paused frame stays still. */
export function updateBackdrop(b: Backdrop): void {
  b.nebulaX -= 0.035;
  if (b.nebulaX <= -VW) b.nebulaX += VW;

  for (const body of b.bodies) {
    body.x += body.driftX;
    body.y += body.driftY;
    // Wrap around rather than drifting away forever.
    if (body.x < -body.sprite.half * 2) body.x = VW + body.sprite.half;
    if (body.y < -body.sprite.half * 2) body.y = VH * 0.6;
    if (body.y > VH * 0.75) body.y = -body.sprite.half;
  }

  for (const t of b.traffic) {
    if (t.cooldown > 0) {
      t.cooldown--;
      continue;
    }
    t.x += t.vx;
    const off = t.vx > 0 ? t.x > VW + 20 : t.x < -20;
    if (off) {
      // Send it back the other way after a long pause, so traffic is an event
      // rather than a conveyor belt.
      t.vx = -t.vx;
      t.flipped = !t.flipped;
      t.x = t.vx > 0 ? -20 : VW + 20;
      t.y = 22 + Math.random() * (REACH_Y - 50);
      t.cooldown = 500 + Math.floor(Math.random() * 900);
    }
  }

  for (const d of b.debris) {
    d.x += d.vx;
    d.y += d.vy;
    if (d.y > VH) {
      d.y = -2;
      d.x = Math.random() * VW;
    }
    if (d.x < -2) d.x = VW;
    if (d.x > VW + 2) d.x = -2;
  }

  const c = b.comet;
  if (c.life > 0) {
    c.x += c.vx;
    c.y += c.vy;
    c.life--;
  } else if (c.cooldown > 0) {
    c.cooldown--;
  } else {
    // Launch a new one from a random edge on a shallow downward arc.
    const fromLeft = Math.random() < 0.5;
    c.x = fromLeft ? -10 : VW + 10;
    c.y = 10 + Math.random() * 50;
    c.vx = (fromLeft ? 1 : -1) * (1.6 + Math.random() * 1.2);
    c.vy = 0.5 + Math.random() * 0.5;
    c.life = 150;
    c.cooldown = 600 + Math.floor(Math.random() * 900);
  }
}

function drawBackdrop(ctx: CanvasRenderingContext2D, b: Backdrop): void {
  if (b.nebula) {
    ctx.globalAlpha = 0.55;
    // Drawn twice so the scroll has no seam.
    ctx.drawImage(b.nebula.canvas, Math.round(b.nebulaX), 0);
    ctx.drawImage(b.nebula.canvas, Math.round(b.nebulaX) + VW, 0);
    ctx.globalAlpha = 1;
  }

  for (const body of b.bodies) {
    ctx.globalAlpha = body.alpha;
    ctx.drawImage(body.sprite.canvas, Math.round(body.x - body.sprite.half), Math.round(body.y - body.sprite.half));
    ctx.globalAlpha = 1;
  }

  for (const d of b.debris) {
    ctx.fillStyle = d.color;
    ctx.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size);
  }

  for (const t of b.traffic) {
    if (t.cooldown > 0) continue;
    ctx.globalAlpha = t.alpha;
    const x = Math.round(t.x - t.sprite.half);
    const y = Math.round(t.y - t.sprite.half);
    if (t.vx < 0) {
      // Mirrored rather than baked twice.
      ctx.save();
      ctx.translate(x + t.sprite.canvas.width, y);
      ctx.scale(-1, 1);
      ctx.drawImage(t.sprite.canvas, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(t.sprite.canvas, x, y);
    }
    if (t.trail) {
      ctx.fillStyle = PALETTE.thruster;
      const tx = t.vx > 0 ? x - 3 : x + t.sprite.canvas.width + 1;
      ctx.fillRect(tx, y + 4, 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  const c = b.comet;
  if (c.life > 0) {
    // Tail is a run of fading pixels behind the head, not a blurred line.
    const len = 14;
    for (let i = len; i > 0; i--) {
      ctx.globalAlpha = (1 - i / len) * 0.8;
      ctx.fillStyle = i > len * 0.6 ? PALETTE.cometTail : PALETTE.cometHead;
      ctx.fillRect(Math.round(c.x - c.vx * i * 0.8), Math.round(c.y - c.vy * i * 0.8), 1, 1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.cometHead;
    ctx.fillRect(Math.round(c.x), Math.round(c.y), 2, 2);
  }
}

export function makeStarfield(count = 150): Star[] {
  return Array.from({ length: count }, () => {
    const depth = Math.random();
    return {
      x: Math.floor(Math.random() * VW),
      y: Math.floor(Math.random() * VH),
      speed: 0.05 + depth * 0.32,
      color: depth > 0.86 ? PALETTE.starNear : depth > 0.5 ? PALETTE.starMid : PALETTE.starFar,
    };
  });
}

// ── pieces ──────────────────────────────────────────────────────────────────

/**
 * The station along the bottom edge.
 *
 * Built as a stepped silhouette with pylons and lit windows rather than a flat
 * bar — a single dark slab read as "the canvas ran out" rather than as a place
 * the player is defending.
 */
function drawStation(ctx: CanvasRenderingContext2D, frames: number): void {
  // A cold glow above the hull, so the base looks lit from within.
  for (let i = 0; i < 7; i++) {
    ctx.globalAlpha = 0.13 - i * 0.017;
    ctx.fillStyle = PALETTE.horizon;
    ctx.fillRect(0, GROUND_Y - 7 + i, VW, 1);
  }
  ctx.globalAlpha = 1;

  // Pylons and blocks breaking the skyline, on a fixed rhythm so it reads as
  // built structure rather than noise.
  const towers = [18, 46, 84, 196, 236, 268, 298];
  for (const tx of towers) {
    const h = 4 + ((tx * 7) % 9);
    const w = 5 + ((tx * 3) % 5);
    ctx.fillStyle = PALETTE.hull;
    ctx.fillRect(tx, GROUND_Y - h, w, h);
    ctx.fillStyle = PALETTE.hullLit;
    ctx.fillRect(tx, GROUND_Y - h, w, 1);
    ctx.fillStyle = PALETTE.hullEdge;
    ctx.fillRect(tx, GROUND_Y - h, 1, h);

    // Blinking beacon on the taller pylons.
    if (h > 8) {
      const on = Math.floor(frames / 25 + tx) % 3 === 0;
      ctx.fillStyle = on ? PALETTE.danger : PALETTE.hullLit;
      ctx.fillRect(tx + (w >> 1), GROUND_Y - h - 2, 1, 2);
    }
  }

  // Main hull.
  ctx.fillStyle = PALETTE.hull;
  ctx.fillRect(0, GROUND_Y, VW, VH - GROUND_Y);
  ctx.fillStyle = PALETTE.hullLit;
  ctx.fillRect(0, GROUND_Y + 1, VW, 2);
  ctx.fillStyle = PALETTE.hullRim;
  ctx.fillRect(0, GROUND_Y, VW, 1);

  // Panel seams give the hull scale.
  ctx.fillStyle = PALETTE.hullLit;
  for (let x = 10; x < VW; x += 21) ctx.fillRect(x, GROUND_Y + 3, 1, VH - GROUND_Y - 3);

  // Warm windows, cycling so the station looks inhabited. Heights vary on a
  // fixed pattern so the row reads as architecture rather than as a dashed line.
  for (let x = 5; x < VW - 5; x += 7) {
    const on = (x * 3 + Math.floor(frames / 30)) % 5 < 3;
    const tall = (x / 7) % 3 === 0;
    ctx.fillStyle = on ? PALETTE.window : PALETTE.windowDim;
    ctx.fillRect(x, GROUND_Y + (tall ? 6 : 8), 2, tall ? 5 : 3);
  }

  // Dome over the turret. Drawn against a dark outline and given a bright rim so
  // it separates from the hull it sits on rather than melting into it.
  ctx.fillStyle = PALETTE.space;
  for (let dy = 0; dy < 12; dy++) {
    const w = Math.round(Math.sqrt(Math.max(0, 121 - dy * dy)) * 1.6);
    ctx.fillRect(TURRET_X - w - 1, GROUND_Y - dy - 1, w * 2 + 2, 1);
  }
  ctx.fillStyle = PALETTE.dome;
  for (let dy = 0; dy < 10; dy++) {
    const w = Math.round(Math.sqrt(Math.max(0, 100 - dy * dy)) * 1.6);
    ctx.fillRect(TURRET_X - w, GROUND_Y - dy, w * 2, 1);
  }
  // Rim light down the left of the dome, following its curve.
  ctx.fillStyle = PALETTE.domeLit;
  for (let dy = 1; dy < 10; dy += 2) {
    const w = Math.round(Math.sqrt(Math.max(0, 100 - dy * dy)) * 1.6);
    ctx.fillRect(TURRET_X - w, GROUND_Y - dy, 3, 1);
    ctx.fillRect(TURRET_X + w - 3, GROUND_Y - dy, 3, 1);
  }
  ctx.fillStyle = PALETTE.hullRim;
  ctx.fillRect(TURRET_X - 18, GROUND_Y - 1, 36, 1);
}

function drawTurret(ctx: CanvasRenderingContext2D, aim: number, muzzleFlash: number): void {
  // Barrel: stepped along the aim vector so it stays on the pixel grid rather
  // than being a rotated (and therefore anti-aliased) rectangle.
  const len = 14;
  const dx = Math.cos(aim);
  const dy = Math.sin(aim);

  // Dark outline first, then the lit barrel over it, so the cannon keeps a
  // clean edge against both the starfield and the dome behind it.
  for (let i = 0; i < len; i++) {
    const px = Math.round(TURRET_X + dx * i);
    const py = Math.round(TURRET_Y + dy * i);
    ctx.fillStyle = PALETTE.space;
    ctx.fillRect(px - 2, py - 2, 5, 5);
  }
  for (let i = 0; i < len; i++) {
    const px = Math.round(TURRET_X + dx * i);
    const py = Math.round(TURRET_Y + dy * i);
    const muzzle = i > len - 4;
    ctx.fillStyle = muzzle ? PALETTE.steelLit : PALETTE.steel;
    const thick = muzzle ? 3 : 2;
    ctx.fillRect(px - (thick >> 1), py - (thick >> 1), thick, thick);
  }
  // Emitter tip always glows, so the player can see where the shot comes from.
  const tipX = Math.round(TURRET_X + dx * len);
  const tipY = Math.round(TURRET_Y + dy * len);
  ctx.fillStyle = PALETTE.laserGlow;
  ctx.fillRect(tipX - 1, tipY - 1, 2, 2);

  // Mount.
  ctx.fillStyle = PALETTE.space;
  ctx.fillRect(TURRET_X - 7, TURRET_Y - 4, 14, 9);
  ctx.fillStyle = PALETTE.steel;
  ctx.fillRect(TURRET_X - 6, TURRET_Y - 3, 12, 8);
  ctx.fillStyle = PALETTE.steelLit;
  ctx.fillRect(TURRET_X - 6, TURRET_Y - 3, 12, 1);
  ctx.fillRect(TURRET_X - 6, TURRET_Y - 3, 1, 8);
  ctx.fillStyle = PALETTE.domeLit;
  ctx.fillRect(TURRET_X - 3, TURRET_Y + 1, 6, 2);

  if (muzzleFlash > 0) {
    const mx = Math.round(TURRET_X + dx * len);
    const my = Math.round(TURRET_Y + dy * len);
    ctx.fillStyle = muzzleFlash > 3 ? PALETTE.laserCore : PALETTE.laser;
    ctx.fillRect(mx - 2, my - 2, 5, 5);
    ctx.fillRect(mx - 3, my - 1, 7, 3);
    ctx.fillRect(mx - 1, my - 3, 3, 7);
  }
}

function drawReachLine(ctx: CanvasRenderingContext2D, frames: number): void {
  const offset = Math.floor(frames / 3) % 8;
  for (let x = -8 + offset; x < VW; x += 8) {
    ctx.fillStyle = PALETTE.reach;
    ctx.fillRect(x, REACH_Y, 4, 1);
  }
  const pulse = Math.sin(frames / 12) > 0;
  ctx.fillStyle = pulse ? PALETTE.laserGlow : PALETTE.reach;
  ctx.fillRect(0, REACH_Y - 1, 3, 3);
  ctx.fillRect(VW - 3, REACH_Y - 1, 3, 3);
}

function drawAsteroid(ctx: CanvasRenderingContext2D, a: Asteroid): void {
  const x = Math.round(a.x - a.sprite.half);
  const y = Math.round(a.y - a.sprite.half);
  ctx.drawImage(a.sprite.canvas, x, y);

  // Locked rocks get a red wash so it is obvious why speaking did nothing.
  if (a.locked) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(x, y, a.sprite.canvas.width, a.sprite.canvas.height);
    ctx.globalAlpha = 1;
  }

  // Word plate on its own dark background so the label stays legible against
  // both the starfield and the rock itself. It normally hangs below the rock,
  // but flips above once that would put it over the station hull — the word is
  // the thing the player has to read, and it is needed most at the last moment.
  const w = measurePixelText(a.word, 1);
  const px = Math.round(a.x - w / 2) - 2;
  const below = Math.round(a.y + a.radius + 2);
  const py = below + 10 > GROUND_Y ? Math.round(a.y - a.radius - 12) : below;
  ctx.fillStyle = PALETTE.plate;
  ctx.fillRect(px - 1, py - 1, w + 6, 11);
  ctx.fillStyle = a.locked ? PALETTE.danger : PALETTE.laserGlow;
  ctx.fillRect(px - 1, py - 1, w + 6, 1);
  ctx.fillRect(px - 1, py + 9, w + 6, 1);
  drawPixelText(
    ctx,
    a.word,
    Math.round(a.x),
    py + 2,
    a.locked ? PALETTE.danger : PALETTE.gold,
    1,
    'center'
  );
}

function drawHud(ctx: CanvasRenderingContext2D, s: SceneState): void {
  drawPixelTextShadowed(ctx, `SCORE ${s.score}`, 4, 4, PALETTE.text, '#000000', 1);
  drawPixelTextShadowed(ctx, `WAVE ${s.wave}`, VW / 2, 4, PALETTE.laserGlow, '#000000', 1, 'center');

  if (s.heart) {
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < s.lives ? 1 : 0.18;
      ctx.drawImage(s.heart.canvas, VW - 8 - i * 9, 4);
    }
    ctx.globalAlpha = 1;
  }

  if (s.combo >= 2) {
    drawPixelTextShadowed(ctx, `${s.combo}X COMBO`, VW / 2, 14, PALETTE.gold, '#000000', 1, 'center');
  }
}

// ── the frame ───────────────────────────────────────────────────────────────

/** Paints one complete frame. Advances only visual ages, never game state. */
export function drawFrame(ctx: CanvasRenderingContext2D, s: SceneState): void {
  ctx.imageSmoothingEnabled = false;

  const shakeX = s.shake > 0 ? Math.round((Math.random() - 0.5) * s.shake) : 0;
  const shakeY = s.shake > 0 ? Math.round((Math.random() - 0.5) * s.shake) : 0;
  ctx.setTransform(1, 0, 0, 1, shakeX, shakeY);

  ctx.fillStyle = PALETTE.space;
  ctx.fillRect(-8, -8, VW + 16, VH + 16);

  // Far stars sit behind the nebula so it reads as gas in front of them.
  for (const star of s.stars) {
    if (star.color !== PALETTE.starFar) continue;
    ctx.fillStyle = star.color;
    ctx.fillRect(Math.round(star.x), Math.round(star.y), 1, 1);
  }

  if (s.backdrop) drawBackdrop(ctx, s.backdrop);

  for (const star of s.stars) {
    if (star.color === PALETTE.starFar) continue;
    ctx.fillStyle = star.color;
    ctx.fillRect(Math.round(star.x), Math.round(star.y), 1, 1);
  }

  drawReachLine(ctx, s.frames);
  drawStation(ctx, s.frames);

  for (const a of s.asteroids) {
    if (!a.dead) drawAsteroid(ctx, a);
  }

  drawTurret(ctx, s.aim, s.muzzleFlash);

  for (const beam of s.lasers) {
    const dx = beam.tx - TURRET_X;
    const dy = beam.ty - TURRET_Y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    const fade = 1 - beam.age / 8;
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(TURRET_X + (dx * i) / steps);
      const py = Math.round(TURRET_Y + (dy * i) / steps);
      ctx.globalAlpha = fade * 0.5;
      ctx.fillStyle = PALETTE.laserGlow;
      ctx.fillRect(px - 1, py - 1, 3, 3);
      ctx.globalAlpha = fade;
      ctx.fillStyle = beam.age < 3 ? PALETTE.laserCore : PALETTE.laser;
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  for (const wv of s.shockwaves) {
    const r = wv.age * 1.8;
    ctx.globalAlpha = Math.max(0, 1 - wv.age / 12);
    ctx.fillStyle = wv.color;
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      ctx.fillRect(Math.round(wv.x + Math.cos(ang) * r), Math.round(wv.y + Math.sin(ang) * r), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  for (const p of s.particles) {
    ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.7));
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    ctx.globalAlpha = 1;
  }

  for (const f of s.floaters) {
    ctx.globalAlpha = Math.max(0, 1 - f.age / 34);
    drawPixelTextShadowed(ctx, f.text, Math.round(f.x), Math.round(f.y), f.color, '#000000', 1, 'center');
    ctx.globalAlpha = 1;
  }

  drawHud(ctx, s);

  if (s.flash > 0) {
    ctx.globalAlpha = s.flash / 10;
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(-8, -8, VW + 16, VH + 16);
    ctx.globalAlpha = 1;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
