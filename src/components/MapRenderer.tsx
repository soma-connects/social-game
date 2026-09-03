'use client';

import React, { useMemo } from 'react';
import { MapTheme, Player } from '@/lib/types';
import { THEMES } from '@/lib/themeConfig';
// Shared with the server so the board shown matches the tile effects applied.
import { BOARD_GRAPH, FINISH_NODE, TOTAL_TILES } from '@/lib/gameRules';
import TileNode from './TileNode';
import PlayerToken from './PlayerToken';
import BoardCamera from './board/BoardCamera';
import BoardRoad from './board/BoardRoad';
import SpaceBackdrop from './board/SpaceBackdrop';

/**
 * The board.
 *
 * Rendered two ways from the same graph:
 *
 *   'full' — the board you play on. A world several times the size of the
 *            viewport, panned and zoomed, with the camera walking to whoever is
 *            up. The old board was one square capped at 560px, so the entire
 *            journey was squeezed into a picture that always fit on screen —
 *            which is why it felt cramped however much detail went into it.
 *   'peek' — the small overview shown beside a mini-game. Whole board, no
 *            camera, no chrome: it answers "where is everyone" at a glance.
 *
 * Both keep the 0..100 coordinate space the graph has always used, so tiles,
 * tokens and the road all position themselves as percentages and none of them
 * had to learn about the camera.
 */

interface MapRendererProps {
  theme: MapTheme;
  players: Player[];
  activePlayerId: string;
  totalTiles?: number;
  variant?: 'full' | 'peek';
}

/** World edge in CSS pixels at zoom 1 — several screens wide, by design. */
const WORLD_SIZE = 1500;

/** Tile diameters as a fraction of the world, so zoom scales them with the road. */
const EVENT_TILE = 0.046;
const STEP_TILE = 0.0125;

export default function MapRenderer({
  theme,
  players,
  activePlayerId,
  totalTiles = TOTAL_TILES,
  variant = 'full',
}: MapRendererProps) {
  const themeConfig = THEMES[theme] || THEMES.space;
  const peek = variant === 'peek';
  const worldSize = peek ? 460 : WORLD_SIZE;

  const activePlayer = players.find((p) => p.id === activePlayerId);
  const focusNode = activePlayer ? BOARD_GRAPH[activePlayer.boardPosition] : undefined;
  // Only changes when the active player actually moves, so the camera is not
  // re-aimed on every poll the room does.
  const focus = useMemo(
    () => (focusNode ? { x: focusNode.x, y: focusNode.y } : null),
    [focusNode?.x, focusNode?.y]
  );

  const eventSize = worldSize * EVENT_TILE;
  const stepSize = worldSize * STEP_TILE;

  // Tokens bunch up all game; without a fan-out they land on identical
  // coordinates and read as one player.
  const tokens = players.map((player) => {
    const sharing = players.filter((p) => p.boardPosition === player.boardPosition);
    const slot = sharing.findIndex((p) => p.id === player.id);
    return {
      player,
      spreadX: sharing.length > 1 ? (slot - (sharing.length - 1) / 2) * 3.4 : 0,
      spreadY: sharing.length > 1 ? (slot % 2 === 0 ? -1.4 : 1.4) : 0,
    };
  });

  const world = (
    <>
      <BoardRoad width={peek ? 4.4 : 5.2} quiet={peek} />

      {Object.values(BOARD_GRAPH).map((node) => {
        const isStep = node.type === 'empty';
        // On the overview the road steps are noise — the shape and the players
        // are the whole point of it.
        if (isStep && peek) return null;

        return (
          <div
            key={node.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
          >
            {isStep ? (
              // A stepping pad, not a dot. These are real squares you can land
              // on, and drawing them as 2px specks made the road look like a
              // string of beads with the tiles floating off it.
              <div
                className="rounded-full bg-slate-300/55 border border-white/25 shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
                style={{ width: stepSize, height: stepSize }}
              />
            ) : (
              <TileNode
                index={node.id}
                nodeType={node.type}
                theme={theme}
                isFinish={node.id === FINISH_NODE}
                size={peek ? worldSize * 0.062 : eventSize}
                quiet={peek}
              />
            )}
          </div>
        );
      })}

      {tokens.map(({ player, spreadX, spreadY }) => (
        <PlayerToken
          key={player.id}
          player={player}
          isActive={player.id === activePlayerId}
          spreadX={spreadX}
          spreadY={spreadY}
          size={peek ? 'xs' : 'sm'}
        />
      ))}
    </>
  );

  if (peek) {
    return (
      <div className="relative w-full rounded-2xl border border-white/15 overflow-hidden bg-[#070a1a]">
        <div className="relative w-full aspect-square">
          <div className="absolute inset-0 opacity-70">
            <SpaceBackdrop x={50} y={50} zoom={1} worldSize={worldSize} />
          </div>
          <div className="absolute inset-0">{world}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-3xl border border-white/20 shadow-2xl overflow-hidden">
      <BoardCamera
        worldSize={worldSize}
        focus={focus}
        // Tall enough to feel like a place, capped so the roll button and the
        // event feed are still reachable on a phone.
        className="w-full h-[58vh] min-h-[340px] max-h-[720px]"
        renderBackdrop={(view) => (
          <SpaceBackdrop x={view.x} y={view.y} zoom={view.zoom} worldSize={worldSize} />
        )}
        overlay={
          <>
            <div className="absolute top-3 left-3 z-30 flex items-center gap-2 pointer-events-none">
              <span className="glass-pill px-3 py-1.5 rounded-full border border-white/20 text-[11px] font-black text-white flex items-center gap-1.5 shadow-lg">
                <span>{themeConfig.icon}</span>
                <span className="hidden sm:inline">{themeConfig.name.toUpperCase()}</span>
                <span className="sm:hidden">MAP</span>
              </span>
              <span className="hidden sm:inline-block glass-pill px-2.5 py-1.5 rounded-full border border-white/15 text-[10px] font-mono font-bold text-cyan-200/90 shadow-lg">
                {totalTiles} NODES
              </span>
            </div>

            <div className="absolute bottom-3 left-3 z-30 text-[10px] font-bold text-cyan-200/60 pointer-events-none">
              Drag to explore · pinch to zoom
            </div>
          </>
        }
      >
        {world}
      </BoardCamera>
    </div>
  );
}
