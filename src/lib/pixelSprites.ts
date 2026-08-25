/**
 * Procedural pixel-art sprites for Asteroid Defense.
 *
 * Everything here bakes to an offscreen canvas once and is blitted afterwards.
 * Two rules keep that cheap enough to do at load without a visible hitch:
 *
 *   1. Pixels are written into an ImageData buffer and flushed with a single
 *      putImageData. The first version issued one fillRect per pixel — about
 *      1,300 draw calls per rock — which was the bulk of the stall.
 *   2. Anything trigonometric is precomputed into a lookup table rather than
 *      evaluated per pixel.
 */

/** Small deterministic PRNG, so a given seed always yields the same object. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Writes one pixel into an ImageData buffer. */
function put(data: Uint8ClampedArray, w: number, x: number, y: number, c: RGB, a = 255): void {
  const i = (y * w + x) * 4;
  data[i] = c[0];
  data[i + 1] = c[1];
  data[i + 2] = c[2];
  data[i + 3] = a;
}

function blankCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}

/** Four-step ramps, dark to light. */
export const ROCK_PALETTES: string[][] = [
  ['#20242e', '#39404f', '#59637a', '#8b95ad'], // cold grey
  ['#2a2320', '#48382c', '#6b5340', '#9c7b5c'], // iron brown
  ['#1d2a2a', '#2f4a47', '#48706a', '#6fa79c'], // frozen teal
  ['#2b2333', '#453757', '#65507e', '#9077ad'], // amethyst
];

export type BakedSprite = {
  canvas: HTMLCanvasElement;
  /** Half-size, so callers can centre it without re-measuring. */
  half: number;
};

/** Resolution of the silhouette lookup table. 64 steps is smooth at this size. */
const EDGE_STEPS = 64;

/**
 * Bakes one lumpy, cratered rock.
 *
 * The silhouette is a circle deformed by a few sine harmonics rather than pure
 * noise — that keeps the outline readable at 30-odd pixels across, where random
 * noise just reads as fuzz.
 */
export function makeAsteroidSprite(radius: number, seed: number, palette: string[]): BakedSprite {
  const rand = mulberry32(seed);
  const size = radius * 2 + 2;
  const [canvas, ctx] = blankCanvas(size, size);
  if (!ctx) return { canvas, half: size / 2 };

  const shades = palette.map(hexToRgb);
  const cx = size / 2;
  const cy = size / 2;

  // Three harmonics with random phase give a rock that is clearly not a circle
  // but still convex enough to read as a solid mass.
  const h = [
    { amp: 0.1 + rand() * 0.08, freq: 2, phase: rand() * Math.PI * 2 },
    { amp: 0.06 + rand() * 0.06, freq: 3, phase: rand() * Math.PI * 2 },
    { amp: 0.04 + rand() * 0.04, freq: 5, phase: rand() * Math.PI * 2 },
  ];
  // Baked once per rock instead of twice per pixel.
  const edges = new Float32Array(EDGE_STEPS);
  for (let i = 0; i < EDGE_STEPS; i++) {
    const angle = (i / EDGE_STEPS) * Math.PI * 2 - Math.PI;
    let f = 0.84;
    for (const t of h) f += t.amp * Math.sin(angle * t.freq + t.phase);
    edges[i] = radius * f;
  }

  // Craters, placed inside the body so they never break the silhouette.
  const craters = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => {
    const a = rand() * Math.PI * 2;
    const d = rand() * radius * 0.45;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: radius * (0.12 + rand() * 0.16) };
  });

  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let idx = (((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * EDGE_STEPS) | 0;
      if (idx >= EDGE_STEPS) idx = EDGE_STEPS - 1;
      const edge = edges[idx];
      if (dist > edge) continue;

      // Light from the top-left, so every rock agrees on where the sun is.
      const lit = (-dx - dy) / (radius * 2);
      let shade = lit > 0.22 ? 3 : lit > 0.02 ? 2 : lit > -0.24 ? 1 : 0;

      for (const c of craters) {
        const ddx = dx - c.x;
        const ddy = dy - c.y;
        const cd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (cd < c.r) {
          // Dark pit with a lit rim on the far side, which is what sells a
          // crater as a dent rather than a smudge.
          shade = cd > c.r - 1.2 && ddx + ddy > 0 ? (shade + 1 > 3 ? 3 : shade + 1) : 0;
        }
      }

      // A one-pixel dark rim keeps rocks separated against a busy starfield.
      if (dist > edge - 1.1) shade = 0;

      put(data, size, x, y, shades[shade]);
    }
  }

  ctx.putImageData(img, 0, 0);
  return { canvas, half: size / 2 };
}

// ── environment ─────────────────────────────────────────────────────────────

/** Ordered dither matrix. Banding by threshold is what makes clouds read as pixel art. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * A drifting nebula, baked once at load.
 *
 * Built from overlapping blobs quantised through an ordered dither, so it reads
 * as deliberate pixel shading rather than as a blurry gradient stretched over
 * the screen. Tiles horizontally so it can scroll forever.
 */
export function makeNebulaLayer(w: number, h: number, seed: number, tints: string[]): BakedSprite {
  const rand = mulberry32(seed);
  const [canvas, ctx] = blankCanvas(w, h);
  if (!ctx) return { canvas, half: w / 2 };

  const colors = tints.map(hexToRgb);
  const blobs = Array.from({ length: 7 }, () => ({
    x: rand() * w,
    y: rand() * h,
    r: h * (0.28 + rand() * 0.42),
    strength: 0.5 + rand() * 0.6,
  }));

  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let density = 0;
      for (const b of blobs) {
        // Wrapped horizontally so the seam is invisible when it scrolls.
        let dx = Math.abs(x - b.x);
        if (dx > w / 2) dx = w - dx;
        const dy = y - b.y;
        const d2 = dx * dx + dy * dy;
        const r2 = b.r * b.r;
        if (d2 < r2) {
          const falloff = 1 - d2 / r2;
          density += falloff * falloff * b.strength;
        }
      }
      if (density <= 0) continue;

      const threshold = (BAYER4[y & 3][x & 3] + 0.5) / 16;
      // Three bands, each needing progressively more density to appear.
      const band = density > 0.85 + threshold * 0.5 ? 2 : density > 0.4 + threshold * 0.5 ? 1 : density > 0.12 + threshold * 0.35 ? 0 : -1;
      if (band < 0) continue;

      put(data, w, x, y, colors[band], 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  return { canvas, half: w / 2 };
}

export type PlanetOptions = {
  radius: number;
  seed: number;
  /** Dark to light, four steps. */
  palette: string[];
  ring?: boolean;
  /** Bright limb on the sunward side. */
  limb?: string;
};

/**
 * A banded planet with a terminator.
 *
 * The bands are horizontal and slightly wobbled, which is enough to read as gas
 * giant weather at this scale, and much cheaper than any kind of noise field.
 */
export function makePlanetSprite({ radius, seed, palette, ring, limb }: PlanetOptions): BakedSprite {
  const rand = mulberry32(seed);
  const pad = ring ? Math.round(radius * 0.9) : 2;
  const w = radius * 2 + pad * 2;
  const h = radius * 2 + pad * 2;
  const [canvas, ctx] = blankCanvas(w, h);
  if (!ctx) return { canvas, half: w / 2 };

  const shades = palette.map(hexToRgb);
  const limbRgb = limb ? hexToRgb(limb) : shades[3];
  const cx = w / 2;
  const cy = h / 2;

  // Band boundaries, so the surface has structure without per-pixel noise.
  const bandOffsets = Array.from({ length: 9 }, () => rand());

  const img = ctx.createImageData(w, h);
  const data = img.data;

  const ringInner = radius * 1.25;
  const ringOuter = radius * 1.75;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Latitude bands, wobbled a little so they are not dead straight.
        const lat = (dy / radius + 1) / 2;
        const bandIdx = Math.min(8, Math.max(0, Math.floor(lat * 9)));
        let shade = bandOffsets[bandIdx] > 0.55 ? 2 : 1;

        // Terminator: light from the top-left, hard-edged for a pixel look.
        const lit = (-dx - dy) / (radius * 1.7);
        if (lit < -0.35) shade = 0;
        else if (lit > 0.45) shade = Math.min(3, shade + 1);

        // Bright limb along the sunward edge.
        if (dist > radius - 1.5 && lit > -0.1) {
          put(data, w, x, y, limbRgb);
          continue;
        }
        put(data, w, x, y, shades[shade]);
        continue;
      }

      if (ring) {
        // Flattened to an ellipse; the near half is drawn over the planet later.
        const ry = dy * 3.2;
        const rd = Math.sqrt(dx * dx + ry * ry);
        if (rd > ringInner && rd < ringOuter) {
          const t = (rd - ringInner) / (ringOuter - ringInner);
          const dither = (BAYER4[y & 3][x & 3] + 0.5) / 16;
          if (t > 0.42 && t < 0.52) continue; // Cassini-style gap
          if (dither > 0.72) continue; // thin the ring out so it reads as dust
          put(data, w, x, y, shades[t > 0.55 ? 1 : 2]);
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return { canvas, half: w / 2 };
}

/** A small patrol ship that crosses the background. */
export function makeShipSprite(body: string, glass: string, glow: string): BakedSprite {
  const rows = [
    '.....####.....',
    '...########...',
    '..####GG####..',
    'F.############',
    'FF############',
    'F.############',
    '..####GG####..',
    '...########...',
    '.....####.....',
  ];
  const [canvas, ctx] = blankCanvas(rows[0].length, rows.length);
  if (!ctx) return { canvas, half: rows[0].length / 2 };

  const map: Record<string, RGB> = {
    '#': hexToRgb(body),
    G: hexToRgb(glass),
    F: hexToRgb(glow),
  };
  const img = ctx.createImageData(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = map[row[x]];
      if (c) put(img.data, rows[0].length, x, y, c);
    }
  });
  ctx.putImageData(img, 0, 0);
  return { canvas, half: rows[0].length / 2 };
}

/** A tumbling satellite with solar wings. */
export function makeSatelliteSprite(body: string, panel: string, light: string): BakedSprite {
  const rows = [
    '..P.....P..',
    '..P.....P..',
    '.PPP.#.PPP.',
    '.PPP###PPP.',
    '.PPP#L#PPP.',
    '.PPP###PPP.',
    '..P..#..P..',
    '..P.....P..',
  ];
  const [canvas, ctx] = blankCanvas(rows[0].length, rows.length);
  if (!ctx) return { canvas, half: rows[0].length / 2 };

  const map: Record<string, RGB> = {
    '#': hexToRgb(body),
    P: hexToRgb(panel),
    L: hexToRgb(light),
  };
  const img = ctx.createImageData(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = map[row[x]];
      if (c) put(img.data, rows[0].length, x, y, c);
    }
  });
  ctx.putImageData(img, 0, 0);
  return { canvas, half: rows[0].length / 2 };
}

/** A chunky pixel heart for the lives readout. */
export function makeHeartSprite(color: string): BakedSprite {
  const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  const [canvas, ctx] = blankCanvas(7, rows.length);
  if (!ctx) return { canvas, half: 3.5 };
  const c = hexToRgb(color);
  const img = ctx.createImageData(7, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') put(img.data, 7, x, y, c);
  });
  ctx.putImageData(img, 0, 0);
  return { canvas, half: 3.5 };
}
