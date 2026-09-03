// Everything on the board that is not road, tile or player.
//
// The map used to carry four floating images and a station, which on a board
// you can now pan around left a great deal of empty black. Scenery is generated
// here instead of hand-placed so there can be a lot of it, and so it can be
// spread across the whole world rather than tucked into the four corners of a
// fixed square.
//
// Deterministic on purpose. A seeded generator means every player in the room
// sees the same sky, the layout survives a re-render, and nothing shifts under
// the tokens between turns.

export type Parallax = 'far' | 'mid' | 'near';

export type Star = { x: number; y: number; r: number; o: number; layer: Parallax; twinkle: number };
export type Nebula = { x: number; y: number; r: number; hue: string; o: number };
export type Debris = { x: number; y: number; size: number; rot: number; spin: number; layer: Parallax };
export type Landmark = {
  src: string;
  x: number;
  y: number;
  size: number;
  rotate: number;
  opacity: number;
  layer: Parallax;
  /** Circular fade, so a square JPG does not show its corners against the sky. */
  feather: number;
};

export type Scenery = {
  stars: Star[];
  nebulae: Nebula[];
  debris: Debris[];
  landmarks: Landmark[];
};

/**
 * Mulberry32 — small, fast, and stable across engines.
 *
 * Math.random would reshuffle the sky on every render, which on a board that
 * re-renders on each poll would be a permanent shimmer.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scenery is generated over a larger box than the road.
 *
 * The road lives in 0..100. Sky that stopped at the same edge would end in a
 * hard line as soon as the camera panned to a corner, so it runs from -BLEED to
 * 100 + BLEED and the world simply never appears to end.
 */
export const SCENERY_BLEED = 18;

const SPAN = 100 + SCENERY_BLEED * 2;
const spread = (r: () => number) => -SCENERY_BLEED + r() * SPAN;

export function buildSpaceScenery(seed = 20260903): Scenery {
  const r = rng(seed);

  // Three depths. Far stars are dense and dim, near ones sparse and bright —
  // that difference is what sells the parallax once the camera moves.
  const stars: Star[] = [];
  const layers: { layer: Parallax; count: number; rMin: number; rMax: number; oMin: number }[] = [
    { layer: 'far', count: 520, rMin: 0.06, rMax: 0.2, oMin: 0.25 },
    { layer: 'mid', count: 220, rMin: 0.14, rMax: 0.34, oMin: 0.4 },
    { layer: 'near', count: 85, rMin: 0.24, rMax: 0.5, oMin: 0.6 },
  ];
  for (const spec of layers) {
    for (let i = 0; i < spec.count; i++) {
      stars.push({
        x: spread(r),
        y: spread(r),
        r: spec.rMin + r() * (spec.rMax - spec.rMin),
        o: spec.oMin + r() * (1 - spec.oMin),
        layer: spec.layer,
        twinkle: 2.5 + r() * 5,
      });
    }
  }

  // Broad colour washes. Kept few and large — many small ones read as smudges.
  const hues = [
    'rgba(99,102,241,0.55)',
    'rgba(168,85,247,0.45)',
    'rgba(14,165,233,0.4)',
    'rgba(236,72,153,0.32)',
    'rgba(20,184,166,0.34)',
  ];
  const nebulae: Nebula[] = Array.from({ length: 7 }, (_, i) => ({
    x: spread(r),
    y: spread(r),
    r: 26 + r() * 30,
    hue: hues[i % hues.length],
    o: 0.5 + r() * 0.4,
  }));

  // Small tumbling rocks, for a sense of motion when nothing is happening.
  const debris: Debris[] = Array.from({ length: 34 }, () => ({
    x: spread(r),
    y: spread(r),
    size: 0.7 + r() * 2.1,
    rot: r() * 360,
    spin: (r() > 0.5 ? 1 : -1) * (26 + r() * 60),
    layer: r() > 0.6 ? 'near' : 'mid',
  }));

  // The painted assets. Positioned by hand around the road rather than
  // scattered, because these are the things the eye actually lands on — and the
  // old layout buried the finish tile under the space station.
  const landmarks: Landmark[] = [
    { src: '/images/planet_ringed.jpg',  x: 112, y: -6,  size: 46, rotate: 12,  opacity: 0.8,  layer: 'far',  feather: 50 },
    { src: '/images/glowing_sun.jpg',    x: -16, y: 112, size: 54, rotate: 0,   opacity: 0.62, layer: 'far',  feather: 48 },
    { src: '/images/asteroids.jpg',      x: -12, y: 8,   size: 30, rotate: -8,  opacity: 0.75, layer: 'mid',  feather: 54 },
    { src: '/images/asteroids.jpg',      x: 108, y: 78,  size: 24, rotate: 140, opacity: 0.6,  layer: 'mid',  feather: 54 },
    { src: '/images/satellite.jpg',      x: 4,   y: 24,  size: 15, rotate: -14, opacity: 0.85, layer: 'near', feather: 50 },
    { src: '/images/satellite.jpg',      x: 96,  y: 96,  size: 12, rotate: 165, opacity: 0.6,  layer: 'near', feather: 50 },
    // Sits in open sky above the far turn. It used to be a 34-unit disc parked
    // in the middle of the board, which washed straight over the tiles the
    // inner fork runs through.
    { src: '/images/space_station.jpg',  x: 70,  y: 6,   size: 21, rotate: 0,   opacity: 0.42, layer: 'mid',  feather: 55 },
  ];

  return { stars, nebulae, debris, landmarks };
}

/** How much each depth lags the camera. 1 = pinned to the road. */
export const PARALLAX_FACTOR: Record<Parallax, number> = {
  far: 0.25,
  mid: 0.55,
  near: 0.82,
};
