'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { MapTheme, Player } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';
import { BOARD_GRAPH, TOTAL_TILES, boardProgress, BOARD_LENGTH } from '@/lib/gameRules';
import TileNode from './TileNode';
import PlayerToken, { graphPath } from './PlayerToken';
import { mapZoomForWidth, viewportOffset } from '@/lib/mapViewport';
import { roomStore } from '@/lib/roomStore';

interface MapRendererProps {
  theme: MapTheme;
  players: Player[];
  activePlayerId: string;
  totalTiles?: number;
  /** Who the camera follows on a phone until the player chooses otherwise. */
  defaultFollow?: 'active' | 'me' | 'map';
  /** Uses the available mobile viewport as the camera window during board play. */
  immersive?: boolean;
}

type Follow = 'active' | 'me' | 'map';

/** Screen width, watched, so the map is redrawn at the right size when a phone turns. */
function useMapZoom(): number {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const update = () => setZoom(mapZoomForWidth(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return zoom;
}

const generateRoadPath = () => {
  const paths: string[] = [];
  const visited = new Set<string>();
  const traverse = (nodeId: number) => {
    const node = BOARD_GRAPH[nodeId];
    if (!node) return;
    for (const nextId of node.next) {
      const edge = `${nodeId}-${nextId}`;
      if (visited.has(edge)) continue;
      visited.add(edge);
      const nextNode = BOARD_GRAPH[nextId];
      if (nextNode) {
        paths.push(`M ${node.x} ${node.y} L ${nextNode.x} ${nextNode.y}`);
        traverse(nextId);
      }
    }
  };
  traverse(0);
  return paths.join(' ');
};

const ROAD_SVG_PATH = generateRoadPath();

export default function MapRenderer({
  theme,
  players,
  activePlayerId,
  totalTiles = TOTAL_TILES,
  defaultFollow = 'active',
  immersive = false,
}: MapRendererProps) {
  const themeConfig = THEMES[theme] || THEMES.forest;
  const activePlayer = players.find((player) => player.id === activePlayerId);
  const activeProgress = activePlayer ? boardProgress(activePlayer.boardPosition) : 0;

  // On a phone the whole road does not fit at a size anyone can read, so the map
  // is drawn larger than its window and the camera follows one player. "Map"
  // shows all of it, small, for finding your bearings.
  const screenZoom = useMapZoom();
  const [follow, setFollow] = useState<Follow>(defaultFollow);
  const myPlayerId = roomStore.getMyPlayerId();
  const me = players.find((player) => player.id === myPlayerId);
  const focusPlayer = follow === 'me' && me ? me : activePlayer ?? players[0];
  const zoom = follow === 'map' ? 1 : screenZoom;
  const focusNode = focusPlayer?.boardPosition ?? 0;
  const focusPoint = BOARD_GRAPH[focusNode] ?? { x: 50, y: 50 };
  const offset = viewportOffset(focusPoint, zoom);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!immersive) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(viewport);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [immersive]);

  // The map world stays square. In immersive mode it is sized from the visible
  // phone viewport, then moved in pixels so the active token stays in view even
  // when the portrait window is much taller than it is wide.
  const immersiveWorldSize = follow === 'map'
    ? Math.min(viewportSize.width, viewportSize.height) * 0.95
    : Math.max(viewportSize.width, viewportSize.height) * 1.5;
  const centerY = viewportSize.height * 0.42;
  const clampOffset = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const immersiveOffset = viewportSize.width > 0 && viewportSize.height > 0 && immersiveWorldSize > 0
    ? {
        left: follow === 'map'
          ? (viewportSize.width - immersiveWorldSize) / 2
          : clampOffset(viewportSize.width / 2 - (focusPoint.x / 100) * immersiveWorldSize, viewportSize.width - immersiveWorldSize, 0),
        top: follow === 'map'
          ? (viewportSize.height - immersiveWorldSize) / 2
          : clampOffset(centerY - (focusPoint.y / 100) * immersiveWorldSize, viewportSize.height - immersiveWorldSize, 0),
      }
    : { left: 0, top: 0 };

  // The camera takes as long over a move as the token does (half a second a
  // tile), so the token is still in view while it walks.
  const previousNode = useRef(focusNode);
  const moved = previousNode.current !== focusNode;
  const hops = moved ? Math.max(1, graphPath(previousNode.current, focusNode).length - 1) : 0;
  const cameraSeconds = moved ? Math.max(0.7, hops * 0.5) : 0.7;
  useEffect(() => {
    previousNode.current = focusNode;
  }, [focusNode]);

  return (
    <section className={immersive
      ? 'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-slate-950 lg:h-auto lg:flex-none lg:min-h-0 lg:rounded-[28px] lg:border lg:border-white/15 lg:shadow-2xl'
      : 'relative w-full overflow-hidden rounded-[28px] border border-white/15 bg-slate-950 shadow-2xl'} aria-label="Roadmap board">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(0,240,255,0.10),transparent_32%),radial-gradient(circle_at_18%_80%,rgba(255,209,102,0.08),transparent_30%)] pointer-events-none" />

      <header className={immersive
        ? 'relative z-10 hidden flex-wrap items-end justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6 lg:flex'
        : 'relative z-10 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6'}>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-200/75">Main game</p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-white sm:text-xl">{themeConfig.name} roadmap</h2>
        </div>
        <div className="flex items-center gap-2 text-right">
          <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">Board progress</p>
            <p className="font-mono text-sm font-black tabular-nums text-partyYellow">{activeProgress} <span className="text-gray-500">/ {BOARD_LENGTH}</span></p>
          </div>
          <div className="hidden rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 sm:block">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">Nodes</p>
            <p className="font-mono text-sm font-black tabular-nums text-cyan-200">{totalTiles}</p>
          </div>
        </div>
      </header>

      <div className={immersive
        ? 'relative z-10 min-h-0 flex-1 p-0 lg:flex-none lg:px-2 lg:py-3'
        : 'relative z-10 px-2 py-3 sm:px-5 sm:py-5'}>
        <div
          ref={viewportRef}
          className={immersive
            ? "relative h-full min-h-0 w-full overflow-hidden bg-[url('/images/galactic_background.jpg')] bg-cover bg-center lg:mx-auto lg:aspect-square lg:h-auto lg:max-w-[560px] lg:rounded-2xl lg:border lg:border-white/10 lg:p-3"
            : "relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-[url('/images/galactic_background.jpg')] bg-cover bg-center p-1.5 sm:p-3"}
        >
          <div className="absolute inset-0 rounded-2xl bg-slate-950/55" />
          <div className="absolute inset-0 z-0 overflow-hidden rounded-2xl pointer-events-none">
            <img src="/images/planet_ringed.jpg" alt="" aria-hidden className="absolute -right-8 -top-8 w-36 opacity-35 mix-blend-screen sm:w-56" />
            <img src="/images/asteroids.jpg" alt="" aria-hidden className="absolute -left-5 top-4 w-24 opacity-35 mix-blend-screen sm:w-36" />
            <img src="/images/satellite.jpg" alt="" aria-hidden className="absolute -bottom-2 right-2 w-24 opacity-30 mix-blend-screen sm:w-32" />
          </div>

          {/* The world: everything positioned in percent of the map lives in here,
              so it can be drawn larger than the window and slid under it. */}
          <div
            data-map-world
            className="absolute z-[1]"
            style={{
              width: immersive ? `${immersiveWorldSize}px` : `${zoom * 100}%`,
              height: immersive ? `${immersiveWorldSize}px` : `${zoom * 100}%`,
              left: immersive ? `${immersiveOffset.left}px` : `${offset.left}%`,
              top: immersive ? `${immersiveOffset.top}px` : `${offset.top}%`,
              // Size animates too: switching to the whole map shrinks it, and a map
              // that shrank at once while it slid back would be off screen for a second.
              transition: `left ${cameraSeconds}s ${hops > 1 ? 'linear' : 'ease-out'}, top ${cameraSeconds}s ${hops > 1 ? 'linear' : 'ease-out'}, width 0.7s ease-out, height 0.7s ease-out`,
            }}
          >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 z-0 h-full w-full pointer-events-none" aria-hidden="true">
            <path d={ROAD_SVG_PATH} stroke={themeConfig.roadStroke} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.42" />
            <path d={ROAD_SVG_PATH} stroke="rgba(226,232,240,0.72)" strokeWidth="2.2" strokeDasharray="1 3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>

          {Object.values(BOARD_GRAPH).map((node) => {
            const isFinish = node.next.length === 0;
            return (
              <div key={node.id} className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ left: `${node.x}%`, top: `${node.y}%` }}>
                {node.type === 'empty' ? (
                  <div className="h-1.5 w-1.5 rounded-full bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.65)] sm:h-2 sm:w-2" />
                ) : (
                  <div className="z-10">
                    <TileNode index={node.id} nodeType={node.type} theme={theme} isFinish={isFinish} />
                  </div>
                )}
              </div>
            );
          })}

          {players.map((player) => {
            const isTurn = player.id === activePlayerId;
            const sharing = players.filter((p) => p.boardPosition === player.boardPosition);
            const slot = sharing.findIndex((p) => p.id === player.id);
            const spreadX = sharing.length > 1 ? (slot - (sharing.length - 1) / 2) * 4.5 : 0;
            const spreadY = sharing.length > 1 ? (slot % 2 === 0 ? -1.5 : 1.5) : 0;
            return <PlayerToken key={player.id} player={player} isActive={isTurn} isMe={player.id === myPlayerId} spreadX={spreadX} spreadY={spreadY} />;
          })}
          </div>

          {/* Who to follow. Only on a screen small enough to need it. */}
          {screenZoom > 1 && (
            <div className={`absolute left-2 z-30 flex gap-1 rounded-full border border-white/15 bg-slate-950/80 p-1 backdrop-blur ${
              immersive
                ? 'top-[calc(env(safe-area-inset-top)+3.25rem)] left-3'
                : 'bottom-2 left-2'
            }`}>
              {([
                ['me', '📍 Me'],
                ['active', '▶ Turn'],
                ['map', '🗺 All'],
              ] as [Follow, string][]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFollow(id)}
                  aria-pressed={follow === id}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-colors ${
                    follow === id ? 'bg-partyYellow text-partyDark' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className={immersive
        ? 'relative z-10 hidden items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-gray-400 sm:px-6 lg:flex'
        : 'relative z-10 flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-gray-400 sm:px-6'}>
        <span>Launchpad</span>
        <span className="flex items-center gap-1.5 text-partyYellow">
          Finish line <Trophy className="h-3 w-3" aria-hidden />
        </span>
      </footer>
    </section>
  );
}
