'use client';

import React from 'react';
import { MapTheme, Player } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';
import { BOARD_GRAPH, TOTAL_TILES, boardProgress, BOARD_LENGTH } from '@/lib/gameRules';
import TileNode from './TileNode';
import PlayerToken from './PlayerToken';

interface MapRendererProps {
  theme: MapTheme;
  players: Player[];
  activePlayerId: string;
  totalTiles?: number;
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

export default function MapRenderer({ theme, players, activePlayerId, totalTiles = TOTAL_TILES }: MapRendererProps) {
  const themeConfig = THEMES[theme] || THEMES.forest;
  const activePlayer = players.find((player) => player.id === activePlayerId);
  const activeProgress = activePlayer ? boardProgress(activePlayer.boardPosition) : 0;

  return (
    <section className="relative w-full overflow-hidden rounded-[28px] border border-white/15 bg-slate-950 shadow-2xl" aria-label="Roadmap board">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(0,240,255,0.10),transparent_32%),radial-gradient(circle_at_18%_80%,rgba(255,209,102,0.08),transparent_30%)] pointer-events-none" />

      <header className="relative z-10 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
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

      <div className="relative z-10 px-2 py-3 sm:px-5 sm:py-5">
        <div className="relative mx-auto aspect-square w-full max-w-[560px] rounded-2xl border border-white/10 bg-[url('/images/galactic_background.jpg')] bg-cover bg-center p-1.5 sm:p-3">
          <div className="absolute inset-0 rounded-2xl bg-slate-950/55" />
          <div className="absolute inset-0 z-0 overflow-hidden rounded-2xl pointer-events-none">
            <img src="/images/planet_ringed.jpg" alt="" aria-hidden className="absolute -right-8 -top-8 w-36 opacity-35 mix-blend-screen sm:w-56" />
            <img src="/images/asteroids.jpg" alt="" aria-hidden className="absolute -left-5 top-4 w-24 opacity-35 mix-blend-screen sm:w-36" />
            <img src="/images/satellite.jpg" alt="" aria-hidden className="absolute -bottom-2 right-2 w-24 opacity-30 mix-blend-screen sm:w-32" />
          </div>

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
            return <PlayerToken key={player.id} player={player} isActive={isTurn} spreadX={spreadX} spreadY={spreadY} />;
          })}
        </div>
      </div>

      <footer className="relative z-10 flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-gray-400 sm:px-6">
        <span>Launchpad</span>
        <span className="text-partyYellow">Finish line</span>
      </footer>
    </section>
  );
}
