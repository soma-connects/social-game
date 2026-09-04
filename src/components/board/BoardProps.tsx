'use client';

import React, { useMemo } from 'react';
import { BOARD_GRAPH, FINISH_NODE } from '@/lib/gameRules';
import { buildWorldProps, type WorldProp } from '@/lib/boardScenery';

/**
 * Scenery that belongs to the board rather than the sky.
 *
 * Drawn inside the panning world, so it keeps its place beside the road. That
 * is the whole point of it: the backdrop drifts against the board to sell
 * distance, which makes it the wrong place for anything that has to stay put —
 * the station you are travelling to, the pad you launched from, the rocks you
 * pass on the way.
 *
 * Shapes are drawn rather than loaded. Six of the seven themes have no art at
 * all, and geometry costs nothing, recolours per theme for free and stays crisp
 * at every zoom the camera allows.
 */

interface BoardPropsProps {
  /** Muted and thinned out for the small overview. */
  quiet?: boolean;
}

/** An irregular lump. Same seed, same rock, every render. */
function rockPath(seed: number, points = 7): string {
  const pts: string[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    // Cheap deterministic jitter — enough variation that no two rocks match.
    const wobble = 0.68 + (Math.sin(seed * 100 + i * 2.7) * 0.5 + 0.5) * 0.32;
    pts.push(`${(Math.cos(a) * wobble).toFixed(3)},${(Math.sin(a) * wobble).toFixed(3)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function Prop({ prop }: { prop: WorldProp }) {
  const { kind, size, rot, seed } = prop;

  if (kind === 'beacon') {
    return (
      <g transform={`rotate(${rot})`}>
        <ellipse cx="0" cy={size * 0.42} rx={size * 0.46} ry={size * 0.16} fill="rgba(0,0,0,0.45)" />
        <path
          d={`M ${-size * 0.22} ${size * 0.42} L ${-size * 0.1} ${-size * 0.34} L ${size * 0.1} ${-size * 0.34} L ${size * 0.22} ${size * 0.42} Z`}
          fill="#1e2a4d"
          stroke="rgba(148,178,255,0.5)"
          strokeWidth={size * 0.045}
        />
        <circle cx="0" cy={-size * 0.42} r={size * 0.17} fill="#67e8f9" opacity="0.8">
          <animate attributeName="opacity" values="1;0.25;1" dur="2.6s" repeatCount="indefinite" />
        </circle>
      </g>
    );
  }

  if (kind === 'crystal' || kind === 'shard') {
    const tall = kind === 'crystal';
    const h = size * (tall ? 0.62 : 0.44);
    const w = size * (tall ? 0.24 : 0.32);
    // Dim and desaturated: these are texture on the floor of the map, not
    // things a player needs to look at.
    const fill = tall ? '#3f6f96' : '#5b5289';
    return (
      <g transform={`rotate(${rot})`}>
        <ellipse cx="0" cy={h * 0.86} rx={w * 1.5} ry={w * 0.5} fill="rgba(0,0,0,0.4)" />
        <path d={`M 0 ${-h} L ${w} 0 L ${w * 0.5} ${h * 0.8} L ${-w * 0.5} ${h * 0.8} L ${-w} 0 Z`}
          fill={fill} opacity="0.62" />
        {/* Lit facet, so the shard has a direction the light comes from. */}
        <path d={`M 0 ${-h} L ${w} 0 L ${w * 0.5} ${h * 0.8} L 0 ${h * 0.5} Z`}
          fill="#ffffff" opacity="0.14" />
      </g>
    );
  }

  return (
    <g transform={`rotate(${rot})`}>
      <ellipse cx="0" cy={size * 0.36} rx={size * 0.52} ry={size * 0.18} fill="rgba(0,0,0,0.45)" />
      <path d={rockPath(seed)} transform={`scale(${size * 0.5})`} fill="#2b3450" opacity="0.9" />
      <path d={rockPath(seed)} transform={`scale(${size * 0.5}) translate(0, -0.12)`}
        fill="#3d4869" opacity="0.7" />
      <path d={rockPath(seed + 0.3, 5)} transform={`scale(${size * 0.22}) translate(-0.5, -0.9)`}
        fill="#4f5c82" opacity="0.5" />
    </g>
  );
}

export default function BoardProps({ quiet = false }: BoardPropsProps) {
  const nodes = useMemo(() => Object.values(BOARD_GRAPH).map((n) => ({ x: n.x, y: n.y })), []);
  const props = useMemo(() => buildWorldProps(nodes, 991, quiet ? 0 : 46), [nodes, quiet]);

  const finish = BOARD_GRAPH[FINISH_NODE];
  const start = BOARD_GRAPH[0];

  return (
    <>
      {/* Anchored art, under the road so tiles always win. */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {/* Aurora Station — the place the road actually goes. Sat in the
            backdrop before, so the destination drifted away from the finish
            line whenever the camera moved. */}
        <img
          src="/images/space_station.jpg"
          alt=""
          aria-hidden
          className="absolute object-contain mix-blend-screen"
          style={{
            left: `${finish.x}%`,
            top: `${finish.y}%`,
            width: '34%',
            transform: 'translate(-50%, -50%)',
            opacity: quiet ? 0.3 : 0.55,
            WebkitMaskImage: 'radial-gradient(circle, black 42%, transparent 68%)',
            maskImage: 'radial-gradient(circle, black 42%, transparent 68%)',
          }}
        />
        {!quiet && (
          <div
            className="absolute rounded-full"
            style={{
              left: `${start.x}%`,
              top: `${start.y}%`,
              width: '16%',
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(52,211,153,0.32) 0%, transparent 68%)',
            }}
          />
        )}
      </div>

      {!quiet && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
          opacity={0.75}
        >
          {props.map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <Prop prop={p} />
            </g>
          ))}
        </svg>
      )}
    </>
  );
}
