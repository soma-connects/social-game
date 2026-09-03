'use client';

import React, { useMemo } from 'react';
import { BOARD_GRAPH } from '@/lib/gameRules';

/**
 * The road itself.
 *
 * What was here before was a 3px dashed line with a glow — technically a link
 * between two tiles, but nothing you would call a road, and the reason the board
 * read as scattered nodes rather than a journey. This draws a proper causeway:
 * a dark bed, a lit surface, a flowing centre line, and chevrons pointing the
 * way you travel.
 *
 * Every edge of the graph is drawn, so both halves of a fork are visible as real
 * roads and the choice is legible from the board rather than from a rules panel.
 */

/**
 * The graph, cut into the longest runs that can be drawn as one smooth curve.
 *
 * A run has to break wherever the road forks or two roads join, because a
 * single stroke cannot be in two places at once. Everywhere else it should keep
 * going: the whole point of a spline is that one long run bends continuously,
 * and chopping it at every node would put a visible kink in each corner.
 *
 * So a run starts at the board start, at any join (more than one road arrives),
 * and at each branch of a fork — then runs forward until it reaches the next
 * fork or join. Every edge lands in exactly one run, which is what stops
 * branches from being skipped: the first version walked forward from the start
 * and stopped dead at the first fork, so only the opening stretch was ever
 * drawn and the rest of the board was bare pads.
 */
function buildRuns(): string[] {
  const ids = Object.keys(BOARD_GRAPH).map(Number);

  const inDegree = new Map<number, number>();
  for (const id of ids) inDegree.set(id, 0);
  for (const id of ids) {
    for (const next of BOARD_GRAPH[id].next) {
      inDegree.set(next, (inDegree.get(next) ?? 0) + 1);
    }
  }

  const outDegree = (id: number) => BOARD_GRAPH[id]?.next.length ?? 0;
  const isJoin = (id: number) => (inDegree.get(id) ?? 0) > 1;

  const starts = new Set<number>();
  for (const id of ids) {
    if ((inDegree.get(id) ?? 0) === 0) starts.add(id); // the board start
    if (isJoin(id) && outDegree(id) > 0) starts.add(id); // roads meeting again
    if (outDegree(id) > 1) for (const branch of BOARD_GRAPH[id].next) starts.add(branch);
  }

  const runs: string[] = [];
  for (const start of starts) {
    const points: { x: number; y: number }[] = [];

    // A fork's branches begin at the fork itself, so the two roads visibly
    // leave from the same tile instead of appearing out of thin air beside it.
    const parent = ids.find((id) => outDegree(id) > 1 && BOARD_GRAPH[id].next.includes(start));
    if (parent !== undefined) points.push({ x: BOARD_GRAPH[parent].x, y: BOARD_GRAPH[parent].y });

    let id: number | undefined = start;
    while (id !== undefined) {
      const node = BOARD_GRAPH[id];
      if (!node) break;
      points.push({ x: node.x, y: node.y });

      if (node.next.length !== 1) break; // fork or finish ends the run
      const next: number = node.next[0];
      // Stop *on* a join so the incoming road reaches it, and let the join
      // start its own run onward.
      if (isJoin(next)) {
        points.push({ x: BOARD_GRAPH[next].x, y: BOARD_GRAPH[next].y });
        break;
      }
      id = next;
    }

    if (points.length > 1) runs.push(spline(points));
  }

  return runs.filter(Boolean);
}

/** Catmull-Rom through the points, emitted as cubic beziers. */
function spline(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

interface BoardRoadProps {
  /** Width of the road bed in world units. */
  width?: number;
  /** Muted, for the small overview where a lit road is just noise. */
  quiet?: boolean;
}

export default function BoardRoad({ width = 5.2, quiet = false }: BoardRoadProps) {
  const runs = useMemo(buildRuns, []);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
    >
      <defs>
        {/* Lit rim. Cool at the start of the run, warmer by the finish, so the
            road reads as going somewhere. */}
        <linearGradient id="roadRail" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
        {/* The walking surface is deliberately dark. A bright road competes with
            the tiles standing on it — the colour belongs to the tiles, and the
            road only has to say "you may walk here". */}
        <linearGradient id="roadSurface" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#243056" />
          <stop offset="100%" stopColor="#141c3a" />
        </linearGradient>
        <filter id="roadGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
      </defs>

      {runs.map((d, i) => (
        <g key={i}>
          {/* Soft bloom off the rim, kept faint — the previous road blurred at
              1.4 units in a 100-unit space, which hazed over the starfield. */}
          {!quiet && (
            <path
              d={d}
              stroke="url(#roadRail)"
              strokeWidth={width + 2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.35}
              filter="url(#roadGlow)"
            />
          )}
          {/* Lit rim. */}
          <path
            d={d}
            stroke="url(#roadRail)"
            strokeWidth={width + 0.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={quiet ? 0.5 : 0.95}
          />
          {/* Surface. */}
          <path
            d={d}
            stroke="url(#roadSurface)"
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* A lighter band down the middle, so the surface curves rather than
              reading as a flat ribbon. */}
          <path
            d={d}
            stroke="rgba(148,178,255,0.16)"
            strokeWidth={width * 0.55}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {!quiet && (
            <>
              {/* Centre line. The flow is the only direction cue on the road:
                  a second dashed stroke for chevrons sat on top of this one and
                  the two together just read as litter. */}
              <path
                d={d}
                stroke="rgba(226,240,255,0.8)"
                strokeWidth={width * 0.1}
                strokeLinecap="round"
                strokeDasharray="1.4 3.6"
                fill="none"
                className="board-road-flow"
              />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
