'use client';

/**
 * A board sandbox, so the map can be worked on without a live game.
 *
 * The room API needs Firestore, which means the only way to look at the board
 * used to be to start a real match with real players. That makes every visual
 * change a guess. This renders the same MapRenderer against fixture players so
 * the map can be opened, panned and judged on its own.
 *
 * Not linked from anywhere in the game — you reach it by typing the path.
 */

import React, { useState } from 'react';
import { AVATARS } from '@/lib/gameContent';
import { BOARD_GRAPH, TOTAL_TILES } from '@/lib/gameRules';
import { DEFAULT_THEME, PLAYABLE_THEMES } from '@/lib/themeConfig';
import type { MapTheme, Player } from '@/lib/types';
import MapRenderer from '@/components/MapRenderer';

/** Real node ids, so the tokens sit on the road rather than in space. */
const NODE_IDS = Object.keys(BOARD_GRAPH)
  .map(Number)
  .filter((id) => BOARD_GRAPH[id].type !== 'empty');

function fixturePlayer(index: number, position: number): Player {
  const avatar = AVATARS[index % AVATARS.length];
  return {
    id: `preview_${index}`,
    name: avatar.name,
    avatar,
    score: 40 * (index + 1),
    boardPosition: position,
    inventory: [],
    isHost: index === 0,
    isReady: true,
    hasShield: index === 1,
    lives: 3,
    connected: true,
  };
}

export default function BoardPreviewPage() {
  const [count, setCount] = useState(4);
  const [theme, setTheme] = useState<MapTheme>(DEFAULT_THEME);
  const [spread, setSpread] = useState(true);

  const players = Array.from({ length: count }, (_, i) =>
    fixturePlayer(i, spread ? NODE_IDS[Math.floor((i * NODE_IDS.length) / count)] : NODE_IDS[0])
  );

  return (
    <main className="min-h-screen bg-partyDark text-white p-3 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-black">Board preview</h1>
        <span className="text-[11px] font-mono text-gray-400">
          {TOTAL_TILES} nodes · {NODE_IDS.length} playable
        </span>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <label className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
            Players
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="bg-slate-900 border border-white/20 rounded-lg px-2 py-1 text-xs"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
            Theme
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as MapTheme)}
              className="bg-slate-900 border border-white/20 rounded-lg px-2 py-1 text-xs"
            >
              {PLAYABLE_THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <button
            onClick={() => setSpread((s) => !s)}
            className="text-[11px] font-bold bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-3 py-1.5"
          >
            {spread ? 'Spread out' : 'All on start'}
          </button>
        </div>
      </header>

      <MapRenderer
        theme={theme}
        players={players}
        activePlayerId={players[0]?.id ?? ''}
        totalTiles={TOTAL_TILES}
      />

      <section className="max-w-xs space-y-2">
        <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">
          Peek variant (shown beside mini-games)
        </h2>
        <MapRenderer
          theme={theme}
          players={players}
          activePlayerId={players[0]?.id ?? ''}
          variant="peek"
        />
      </section>
    </main>
  );
}
