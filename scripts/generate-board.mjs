// Regenerates the BOARD_GRAPH block in src/lib/gameRules.ts.
//
//   node scripts/generate-board.mjs           # print the block + spacing report
//   node scripts/generate-board.mjs --write   # splice it into gameRules.ts
//
// TWO RULES THIS FILE MUST NOT BREAK:
//
//   1. STEPS_PER_SEGMENT stays 3. Dice movement walks `next` edges one at a
//      time, so the number of steps between two event tiles *is* the distance
//      between them. Change it and every roll in the game moves further.
//   2. Event tile ids stay 0..23 with their types and their topology. The
//      finish, the branch points and the whole game loop are derived from that
//      — this file only decides where things sit on screen.
//
// WHY CURVES INSTEAD OF COORDINATES
//
// The first version authored all 24 tile positions by hand and dropped 3 steps
// between each pair. Segment lengths came out anywhere between 2.9 and 7.8
// units, so the same three steps were crammed into a short hop and stretched
// across a long one, and the road visibly bunched and thinned along its length.
//
// So only the six junctions are placed by hand now. Everything between them is
// sampled at equal arc length along a solved curve, which makes the spacing
// even by construction rather than by careful typing.

import { readFileSync, writeFileSync } from 'node:fs';

const STEPS_PER_SEGMENT = 3;

/** Gap between neighbouring spaces, in world units. Tiles are drawn at 3.3. */
const TARGET_SPACING = 4.6;

/** Tile types, in id order. The topology these belong to is fixed. */
const TYPES = [
  'normal', 'buff', 'normal', 'dare', 'normal', 'buff', 'mystery', 'debuff',
  'trap', 'duel', 'bonus', 'dare', 'normal', 'mystery', 'debuff', 'bonus',
  'trap', 'duel', 'dare', 'buff', 'normal', 'mystery', 'buff', 'normal',
];

/**
 * The only positions chosen by hand: where roads start, split, meet and end.
 *
 * Everything else falls out of the curves between them, so moving a junction
 * moves its whole stretch of road and the spacing stays even on its own.
 */
const JUNCTIONS = {
  0:  { x: 20, y: 86 }, // launchpad, bottom left
  3:  { x: 10, y: 44 }, // first fork, up the left side
  12: { x: 80, y: 36 }, // first join, across the top
  14: { x: 88, y: 60 }, // second fork, down the right
  22: { x: 26, y: 70 }, // second join, back along the bottom
  23: { x: 30, y: 52 }, // finish, inside the ring
};

/**
 * The roads, each as the tiles along it and which way it bows.
 *
 * Both halves of a fork bow the same way, the longer one further, so they nest
 * as two arcs rather than opening into a lens. Bowing them apart looked better
 * in the abstract and was unworkable in practice: the long branch has to bow
 * about 35 units to fit its extra spaces at the same spacing, and a sweep that
 * size aimed into the middle of the board lands on top of another road. Nested
 * arcs put every bulge on the outside, and the ring stays clear.
 *
 * Which route is which stays readable because the outer one is visibly longer —
 * that is the choice, drawn.
 */
const RUNS = [
  { tiles: [0, 1, 2, 3], bow: -1 },
  { tiles: [3, 4, 5, 6, 12], bow: -1 },              // short way over the top
  { tiles: [3, 7, 8, 9, 10, 11, 12], bow: -1 },      // long way, further out
  { tiles: [12, 13, 14], bow: -1 },
  { tiles: [14, 15, 16, 17, 22], bow: -1 },          // short way along the bottom
  { tiles: [14, 18, 19, 20, 21, 22], bow: -1 },      // long way, further out
  { tiles: [22, 23], bow: 0 },
];

/** Quadratic bezier bowed sideways off the straight line between two points. */
function curve(a, b, bow) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = (a.x + b.x) / 2 + (-dy / len) * bow;
  const cy = (a.y + b.y) / 2 + (dx / len) * bow;
  return (t) => {
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      y: u * u * a.y + 2 * u * t * cy + t * t * b.y,
    };
  };
}

/** Dense samples plus their running length, for arc-length lookups. */
function measure(fn, steps = 4000) {
  const pts = [];
  const cum = [0];
  for (let i = 0; i <= steps; i++) pts.push(fn(i / steps));
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, cum, length: cum[cum.length - 1] };
}

/**
 * Finds the bow that makes a road exactly as long as its spaces need.
 *
 * Arc length grows monotonically with the bow, so bisection is enough. A road
 * whose endpoints are already further apart than its spaces need stays straight
 * and is reported — the fix for that is moving a junction, not bending harder.
 */
function solveBow(a, b, targetLength, direction) {
  if (direction === 0) return 0;
  const straight = measure(curve(a, b, 0)).length;
  if (straight >= targetLength) return 0;

  let lo = 0;
  let hi = 80;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (measure(curve(a, b, mid * direction)).length < targetLength) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * direction;
}

/** Points at equal arc length along a measured curve. */
function distribute({ pts, cum, length }, count) {
  const out = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const want = (length * i) / (count - 1);
    while (j < cum.length - 1 && cum[j + 1] < want) j++;
    const span = cum[j + 1] - cum[j] || 1;
    const f = (want - cum[j]) / span;
    out.push({
      x: pts[j].x + (pts[j + 1].x - pts[j].x) * f,
      y: pts[j].y + (pts[j + 1].y - pts[j].y) * f,
    });
  }
  return out;
}

const round = (n) => Math.round(n * 10) / 10;

function build() {
  const positions = new Map();   // event tile id -> {x, y}
  const steps = [];              // generated in-between spaces
  const edges = new Map();       // event tile id -> [first node of each road]
  const report = [];
  let nextId = TYPES.length;

  for (const run of RUNS) {
    const first = JUNCTIONS[run.tiles[0]];
    const last = JUNCTIONS[run.tiles[run.tiles.length - 1]];
    if (!first || !last) throw new Error(`run ${run.tiles.join('-')} must start and end on a junction`);

    const gaps = (run.tiles.length - 1) * (STEPS_PER_SEGMENT + 1);
    const bow = solveBow(first, last, gaps * TARGET_SPACING, run.bow);
    const measured = measure(curve(first, last, bow));
    const points = distribute(measured, gaps + 1);

    report.push({
      run: `${run.tiles[0]}→${run.tiles[run.tiles.length - 1]}`,
      spaces: gaps,
      spacing: measured.length / gaps,
      bow,
    });

    // Every 4th point is an event tile; the three between it and the next are
    // ordinary spaces.
    run.tiles.forEach((id, i) => {
      const p = points[i * (STEPS_PER_SEGMENT + 1)];
      positions.set(id, { x: round(p.x), y: round(p.y) });
    });

    for (let seg = 0; seg < run.tiles.length - 1; seg++) {
      const from = run.tiles[seg];
      const to = run.tiles[seg + 1];
      const ids = [];
      for (let s = 1; s <= STEPS_PER_SEGMENT; s++) {
        const p = points[seg * (STEPS_PER_SEGMENT + 1) + s];
        ids.push(nextId);
        steps.push({ id: nextId++, type: 'empty', next: [], x: round(p.x), y: round(p.y) });
      }
      ids.forEach((id, i) => {
        steps.find((n) => n.id === id).next = [i === ids.length - 1 ? to : ids[i + 1]];
      });
      if (!edges.has(from)) edges.set(from, []);
      edges.get(from).push(ids[0]);
    }
  }

  const tiles = TYPES.map((type, id) => {
    const p = positions.get(id);
    if (!p) throw new Error(`tile ${id} never landed on a road`);
    return { id, type, next: edges.get(id) ?? [], x: p.x, y: p.y };
  });

  return { nodes: [...tiles, ...steps].sort((a, b) => a.id - b.id), report };
}

const { nodes, report } = build();

const body = nodes
  .map((n) => `  ${n.id}: { id: ${n.id}, type: '${n.type}', next: [${n.next.join(', ')}], x: ${n.x}, y: ${n.y} },`)
  .join('\n');
const block = `export const BOARD_GRAPH: Record<number, BoardNode> = {\n${body}\n};`;

if (process.argv.includes('--write')) {
  const path = new URL('../src/lib/gameRules.ts', import.meta.url);
  const src = readFileSync(path, 'utf8');
  const start = src.indexOf('export const BOARD_GRAPH');
  if (start === -1) throw new Error('BOARD_GRAPH not found in gameRules.ts');
  writeFileSync(path, src.slice(0, start) + block + src.slice(src.indexOf('\n};', start) + 3));
  console.error(`wrote ${nodes.length} nodes`);
} else {
  console.log(block);
}

// Spacing is the whole point of this file, so it is always reported.
const gaps = [];
for (const n of nodes) {
  for (const nx of n.next) {
    const t = nodes.find((m) => m.id === nx);
    gaps.push(Math.hypot(t.x - n.x, t.y - n.y));
  }
}
console.error('\nper road:');
for (const r of report) {
  console.error(
    `  ${r.run.padEnd(7)} ${String(r.spaces).padStart(2)} spaces   spacing ${r.spacing.toFixed(2)}   bow ${r.bow.toFixed(1)}` +
      (r.bow === 0 && r.spacing > TARGET_SPACING * 1.02 ? '   <- ends too far apart to hit target; move a junction' : '')
  );
}
console.error(
  `\noverall gap: min ${Math.min(...gaps).toFixed(2)}  max ${Math.max(...gaps).toFixed(2)}  ` +
    `spread ${(Math.max(...gaps) / Math.min(...gaps)).toFixed(2)}x  (target ${TARGET_SPACING})`
);

// Even spacing is only half the job. Solving the bow to hit a target length
// makes the long branch of a fork sweep a long way, and a sweep aimed at the
// middle of the board lands on top of another road — two chains touching, with
// no way to tell which one your token is walking.
const neighbours = new Set();
for (const n of nodes) for (const nx of n.next) neighbours.add(`${Math.min(n.id, nx)}-${Math.max(n.id, nx)}`);

const road = new Map(); // node id -> which run drew it
RUNS.forEach((run, i) => {
  for (const t of run.tiles) if (!road.has(t)) road.set(t, i);
});
for (const n of nodes) {
  if (road.has(n.id)) continue;
  // Steps inherit the road of the tile they lead towards.
  let cur = n;
  while (cur && !road.has(cur.id)) cur = nodes.find((m) => m.id === cur.next[0]);
  if (cur) road.set(n.id, road.get(cur.id));
}

const CLASH = 3.6; // tiles are drawn at 3.3 across

// Two roads leaving the same fork are supposed to run close together for a
// space or two — that is what a fork looks like. Only their separation further
// out is worth complaining about.
const FORK_SKIRT = 9;
const forks = nodes.filter((n) => n.next.length > 1);
const nearSameFork = (a, b) =>
  forks.some(
    (f) =>
      Math.hypot(a.x - f.x, a.y - f.y) < FORK_SKIRT && Math.hypot(b.x - f.x, b.y - f.y) < FORK_SKIRT
  );

const clashes = [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i];
    const b = nodes[j];
    if (neighbours.has(`${a.id}-${b.id}`)) continue;
    if (road.get(a.id) === road.get(b.id)) continue; // same road, fine
    if (nearSameFork(a, b)) continue;                // still separating
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < CLASH) clashes.push({ a: a.id, b: b.id, d });
  }
}
if (clashes.length === 0) {
  console.error('road clashes: none');
} else {
  clashes.sort((x, y) => x.d - y.d);
  console.error(`\nroad clashes: ${clashes.length} pairs of spaces from different roads within ${CLASH} units`);
  for (const c of clashes.slice(0, 8)) {
    console.error(`  ${c.a} and ${c.b} are ${c.d.toFixed(2)} apart`);
  }
  console.error('  -> move a junction, or bow that road the other way');
}
