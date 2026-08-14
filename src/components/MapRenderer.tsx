'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapTheme, Player } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';
// Shared with the server so the board shown matches the tile effects applied.
import { BOARD_GRAPH, TOTAL_TILES } from '@/lib/gameRules';
import TileNode from './TileNode';
import PlayerToken from './PlayerToken';
import AvatarIllustration from './AvatarIllustration';

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
        // Use straight lines since the interpolated nodes already form the curve
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

  return (
    <div
      // Padding and minimum height were tuned for a desktop card. On a phone
      // they ate roughly a third of the width and forced dead space below a
      // board that is now only as tall as it is wide.
      className="relative w-full rounded-3xl p-3 sm:p-6 md:p-8 border border-white/20 shadow-2xl overflow-hidden transition-all duration-700 flex flex-col justify-between"
      style={{
        backgroundImage: `url('/images/galactic_background.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {/* Dark overlay to tone down the shine of the background and match the app theme */}
      <div className="absolute inset-0 bg-black/50 z-0 pointer-events-none" />

      {/* Scattered Space Assets (Background Layer) */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Scenery scales with the board. At fixed desktop sizes a 320px planet
            sat on top of a 327px phone board and buried the tiles under it. */}
        {/* Ringed Planet - Top Right */}
        <img src="/images/planet_ringed.jpg" alt="" aria-hidden className="absolute -top-6 -right-10 w-40 sm:w-64 md:w-80 aspect-square object-contain mix-blend-screen opacity-70 rotate-12" style={{ WebkitMaskImage: 'radial-gradient(circle, black 50%, transparent 75%)', maskImage: 'radial-gradient(circle, black 50%, transparent 75%)' }} />
        {/* Glowing Sun - Bottom Left */}
        <img src="/images/glowing_sun.jpg" alt="" aria-hidden className="absolute -bottom-12 -left-12 w-48 sm:w-72 md:w-96 aspect-square object-contain mix-blend-screen opacity-60" style={{ WebkitMaskImage: 'radial-gradient(circle, black 50%, transparent 75%)', maskImage: 'radial-gradient(circle, black 50%, transparent 75%)' }} />
        {/* Asteroid Field - Top Left */}
        <img src="/images/asteroids.jpg" alt="" aria-hidden className="absolute top-6 -left-6 w-24 sm:w-36 md:w-48 aspect-square object-contain mix-blend-screen opacity-80" style={{ WebkitMaskImage: 'radial-gradient(circle, black 55%, transparent 75%)', maskImage: 'radial-gradient(circle, black 55%, transparent 75%)' }} />
        {/* Satellite - Bottom Right */}
        <img src="/images/satellite.jpg" alt="" aria-hidden className="absolute bottom-6 right-2 w-20 sm:w-32 md:w-40 aspect-square object-contain mix-blend-screen opacity-80 -rotate-12" style={{ WebkitMaskImage: 'radial-gradient(circle, black 50%, transparent 75%)', maskImage: 'radial-gradient(circle, black 50%, transparent 75%)' }} />
      </div>

      {/* Central Space Station Hub */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 sm:w-64 md:w-80 aspect-square pointer-events-none z-0 opacity-80 drop-shadow-[0_0_40px_rgba(34,211,238,0.4)]">
        <img src="/images/space_station.jpg" alt="" aria-hidden className="w-full h-full object-contain mix-blend-screen" style={{ WebkitMaskImage: 'radial-gradient(circle, black 55%, transparent 75%)', maskImage: 'radial-gradient(circle, black 55%, transparent 75%)' }} />
      </div>

      {/* Map Header */}
      <div className="flex items-center justify-between z-10">
        <div className="glass-pill px-4 py-1.5 rounded-full border border-white/20 text-xs font-black text-white flex items-center gap-2 shadow-lg">
          <span>{themeConfig.icon}</span>
          <span>{themeConfig.name.toUpperCase()} ROADMAP</span>
        </div>
        <span className="text-[10px] font-mono font-bold text-gray-300">{totalTiles} ADVENTURE NODES</span>
      </div>

      {/*
        The board is drawn in a 100x100 coordinate space — every node sits at a
        percentage of this box, and the road SVG stretches to fill it.

        So the box has to stay square. It used to be `w-full h-[460px]`, which on
        a 375px phone is 327 wide by 460 tall: the whole map stretched vertically
        by about 1.4x, which is why it looked squashed on a handset and subtly
        wrong (stretched the other way) on a wide desktop.

        Capped and centred so a big screen gets a sensible board rather than an
        enormous one.
      */}
      {/* A wrapper handles centring so the square box only has to worry about
          filling the width it is given, up to the cap. */}
      <div className="w-full flex justify-center my-2">
      <div className="relative w-full max-w-[560px] aspect-square">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
        >
          {/* Energy Bridge Glow */}
          <path
            d={ROAD_SVG_PATH}
            stroke={themeConfig.roadStroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            style={{ filter: 'drop-shadow(0px 0px 8px rgba(129, 140, 248, 0.8))' }}
            opacity="0.6"
          />
          {/* Energy Bridge Core */}
          <path
            d={ROAD_SVG_PATH}
            stroke="#ffffff"
            strokeWidth="3"
            strokeDasharray="1 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.9"
          />
        </svg>

        {/* Circular Nodes Placed Exactly at (x%, y%) Coordinates */}
        {Object.values(BOARD_GRAPH).map((node) => {
          const idx = node.id;
          const isFinish = node.next.length === 0;

          return (
            <div
              key={idx}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              {node.type === 'empty' ? (
                <div className="w-2 h-2 rounded-full bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              ) : (
                <>
                  {/* Teleport Portals at Shortcut Entrances */}
                  {(idx === 7 || idx === 18) && (
                    <img 
                      src="/images/teleport_portal.jpg" 
                      alt="Portal" 
                      className="absolute w-32 h-32 object-contain mix-blend-screen opacity-90 animate-[spin_10s_linear_infinite] z-0 pointer-events-none" 
                      style={{ WebkitMaskImage: 'radial-gradient(circle, black 40%, transparent 70%)', maskImage: 'radial-gradient(circle, black 40%, transparent 70%)' }}
                    />
                  )}
                  <div className="z-10">
                    <TileNode index={idx} nodeType={node.type} theme={theme} isFinish={isFinish} />
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Animated Sliding Avatar Tokens */}
        {players.map((player) => {
          const isTurn = player.id === activePlayerId;

          // Everyone starts on tile 1 and players bunch up all game. Without a
          // fan-out they land on identical coordinates and read as one token.
          const sharing = players.filter((p) => p.boardPosition === player.boardPosition);
          const slot = sharing.findIndex((p) => p.id === player.id);
          const spreadX = sharing.length > 1 ? (slot - (sharing.length - 1) / 2) * 4.5 : 0;
          const spreadY = sharing.length > 1 ? (slot % 2 === 0 ? -1.5 : 1.5) : 0;

          return (
            <PlayerToken 
              key={player.id} 
              player={player} 
              isActive={isTurn} 
              spreadX={spreadX} 
              spreadY={spreadY} 
            />
          );
        })}
      </div>
      </div>

      {/* Bottom Landmark Track Decoration */}
      <div className="flex justify-between items-center z-10 pt-2 border-t border-white/10 text-xs font-bold text-cyan-200/70 tracking-widest">
        <span className="flex items-center gap-1">LAUNCHPAD (TILE #1)</span>
        <span className="flex items-center gap-1">AURORA STATION (TILE #24) 🏆</span>
      </div>
    </div>
  );
}
