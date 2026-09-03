// Regenerates the BOARD_GRAPH block in src/lib/gameRules.ts.
//
//   node scripts/generate-board.mjs           # print the block
//   node scripts/generate-board.mjs --write   # splice it into gameRules.ts
//
// The board is 24 event tiles joined by plain road steps. Only the event tiles
// are authored here; the steps between them are interpolated, because they are
// what makes the road curve and hand-placing 75 of them is how the old layout
// ended up a knot nobody could read.
//
// TWO RULES THIS FILE MUST NOT BREAK:
//
//   1. STEPS_PER_SEGMENT stays 3. Dice movement walks `next` edges one at a
//      time, so the number of steps between two event tiles *is* the distance
//      between them. Change it and every roll in the game moves further.
//   2. Event tile ids stay 0..23 with their types and edges untouched. The
//      finish, the branch points and the whole game loop are derived from that
//      topology — this file only decides where the tiles sit on screen.

import { readFileSync, writeFileSync } from 'node:fs';

const STEPS_PER_SEGMENT = 3;

/**
 * The 24 event tiles.
 *
 * Laid out as a journey with two visible choices rather than the old inward
 * spiral, where the "shortcut" ran through the middle of the loop and read as a
 * tangle. Here each fork splits into a short high road and a longer low road
 * that plainly rejoin, so the choice is legible from the board itself.
 *
 * Coordinates are percentages of the world box, y downward.
 */
const TILES = [
  // ── the climb out of the launchpad ───────────────────────────────────────
  { id: 0,  type: 'normal',  x: 10, y: 88, next: [1] },
  { id: 1,  type: 'buff',    x: 6,  y: 72, next: [2] },
  { id: 2,  type: 'normal',  x: 8,  y: 55, next: [3] },

  // ── fork one: 3 tiles over the top, or 5 through the belt ────────────────
  { id: 3,  type: 'dare',    x: 15, y: 39, next: [4, 7] },
  { id: 4,  type: 'normal',  x: 27, y: 25, next: [5] },
  { id: 5,  type: 'buff',    x: 45, y: 17, next: [6] },
  { id: 6,  type: 'mystery', x: 63, y: 15, next: [12] },
  { id: 7,  type: 'debuff',  x: 27, y: 47, next: [8] },
  { id: 8,  type: 'trap',    x: 41, y: 43, next: [9] },
  { id: 9,  type: 'duel',    x: 55, y: 38, next: [10] },
  { id: 10, type: 'bonus',   x: 67, y: 32, next: [11] },
  { id: 11, type: 'dare',    x: 77, y: 25, next: [12] },

  // ── the far turn ─────────────────────────────────────────────────────────
  { id: 12, type: 'normal',  x: 89, y: 19, next: [13] },
  { id: 13, type: 'mystery', x: 95, y: 37, next: [14] },

  // ── fork two: 3 tiles round the rim, or 4 across the inside ──────────────
  { id: 14, type: 'debuff',  x: 91, y: 55, next: [15, 18] },
  { id: 15, type: 'bonus',   x: 89, y: 73, next: [16] },
  { id: 16, type: 'trap',    x: 77, y: 87, next: [17] },
  { id: 17, type: 'duel',    x: 58, y: 92, next: [22] },
  { id: 18, type: 'dare',    x: 77, y: 60, next: [19] },
  { id: 19, type: 'buff',    x: 65, y: 66, next: [20] },
  { id: 20, type: 'normal',  x: 53, y: 71, next: [21] },
  { id: 21, type: 'mystery', x: 41, y: 78, next: [22] },

  // ── home ─────────────────────────────────────────────────────────────────
  { id: 22, type: 'buff',    x: 30, y: 81, next: [23] },
  { id: 23, type: 'normal',  x: 37, y: 60, next: [] },
];

/**
 * How far each road bows out from the straight line between its two tiles.
 *
 * A straight run of steps looks like a ruler; real board roads curve. The bow
 * is derived from the segment rather than random so the layout is identical on
 * every run and the committed file never churns.
 */
function bowFor(a, b) {
  const seed = (a.id * 73 + b.id * 31) % 10;
  const dir = seed % 2 === 0 ? 1 : -1;
  return dir * (2.5 + (seed % 4));
}

/** Quadratic bezier through a bowed control point. */
function sample(a, b, t) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = bowFor(a, b);
  // Perpendicular to the segment, so the bow is always sideways to travel.
  const cx = mx + (-dy / len) * bow;
  const cy = my + (dx / len) * bow;
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
    y: u * u * a.y + 2 * u * t * cy + t * t * b.y,
  };
}

const round = (n) => Math.round(n * 10) / 10;

function build() {
  const byId = new Map(TILES.map((t) => [t.id, t]));
  const nodes = [];
  let nextFreeId = TILES.length;

  // Event tiles keep their ids; their `next` is rewritten to point at the first
  // road step of each segment.
  const rewritten = new Map(TILES.map((t) => [t.id, []]));

  for (const tile of TILES) {
    for (const targetId of tile.next) {
      const target = byId.get(targetId);
      const stepIds = [];
      for (let s = 1; s <= STEPS_PER_SEGMENT; s++) {
        const t = s / (STEPS_PER_SEGMENT + 1);
        const p = sample(tile, target, t);
        const id = nextFreeId++;
        stepIds.push(id);
        nodes.push({ id, type: 'empty', next: [], x: round(p.x), y: round(p.y) });
      }
      // Chain the steps, last one lands on the destination tile.
      stepIds.forEach((id, i) => {
        const node = nodes.find((n) => n.id === id);
        node.next = [i === stepIds.length - 1 ? targetId : stepIds[i + 1]];
      });
      rewritten.get(tile.id).push(stepIds[0]);
    }
  }

  const all = [
    ...TILES.map((t) => ({ id: t.id, type: t.type, next: rewritten.get(t.id), x: t.x, y: t.y })),
    ...nodes,
  ].sort((a, b) => a.id - b.id);

  return all;
}

/** Warns about tiles close enough to overlap once drawn. */
function checkSpacing(all) {
  const events = all.filter((n) => n.type !== 'empty');
  const warnings = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const d = Math.hypot(events[i].x - events[j].x, events[i].y - events[j].y);
      if (d < 11) warnings.push(`  tiles ${events[i].id} and ${events[j].id} are ${d.toFixed(1)} apart`);
    }
  }
  return warnings;
}

const all = build();
const warnings = checkSpacing(all);

const body = all
  .map((n) => `  ${n.id}: { id: ${n.id}, type: '${n.type}', next: [${n.next.join(', ')}], x: ${n.x}, y: ${n.y} },`)
  .join('\n');

const block = `export const BOARD_GRAPH: Record<number, BoardNode> = {\n${body}\n};`;

if (process.argv.includes('--write')) {
  const path = new URL('../src/lib/gameRules.ts', import.meta.url);
  const src = readFileSync(path, 'utf8');
  const start = src.indexOf('export const BOARD_GRAPH');
  if (start === -1) throw new Error('BOARD_GRAPH not found in gameRules.ts');
  const end = src.indexOf('\n};', start) + 3;
  writeFileSync(path, src.slice(0, start) + block + src.slice(end));
  console.error(`wrote ${all.length} nodes (${all.filter((n) => n.type !== 'empty').length} event tiles)`);
} else {
  console.log(block);
  console.error(`\n${all.length} nodes, ${all.filter((n) => n.type !== 'empty').length} event tiles`);
}

if (warnings.length) {
  console.error('\nTiles closer than 11 units — they may collide once drawn:');
  warnings.forEach((w) => console.error(w));
}
