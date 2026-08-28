'use client';

import React from 'react';
import { LudoColor, LudoToken } from '@/lib/ludo/ludoTypes';
import {
  TRACK_GRID_COORDS,
  HOME_COL_GRID_COORDS,
  YARD_GRID_COORDS,
  SAFE_POSITIONS,
  COLOR_START_POSITIONS,
  canMoveLudoToken,
} from '@/lib/ludo/ludoRules';

interface LudoBoardProps {
  tokens: Record<LudoColor, LudoToken[]>;
  /** The colours actually in play. Empty corners are painted down, not hidden. */
  seatOrder: LudoColor[];
  activeColor: LudoColor;
  diceValue: number | null;
  hasRolled: boolean;
  isMyTurn: boolean;
  onTokenClick: (tokenId: number) => void;
}

/**
 * A Ludo board is recognisable from across a room because of two things: four
 * distinct quadrants and a pale road running between them. Both are kept — but
 * dusted down rather than played at full saturation, because this board sits in
 * a space station rather than on a kitchen table.
 *
 * The hues stay far enough apart to name at a glance (that is the whole game),
 * they are just darker and greyer: think anodised panels lit by starlight, not
 * primary plastic.
 */
const PAINT: Record<LudoColor, { solid: string; deep: string; light: string; name: string }> = {
  red: { solid: '#A8443F', deep: '#6E2B28', light: '#C9908C', name: 'Red' },
  green: { solid: '#3B7F5E', deep: '#24503B', light: '#8FB8A3', name: 'Green' },
  yellow: { solid: '#B08B3E', deep: '#735A26', light: '#D3BC8C', name: 'Yellow' },
  blue: { solid: '#3F6E96', deep: '#284760', light: '#96AEC4', name: 'Blue' },
};

/**
 * The road. Milky rather than white — a sheet of pure #FFF glowing out of a dark
 * cosmic page is the one thing that would make this board look pasted on.
 */
const ROAD = '#D5D9E0';
const GRID_LINE = '#9AA3B0';
/** Slightly deeper than the road, for the yard backing. */
const YARD_FILL = '#C3C8D1';

/** Which quadrant each colour owns, in 0-indexed grid cells. */
const QUADRANTS: Record<LudoColor, { col: number; row: number }> = {
  red: { col: 0, row: 0 },
  green: { col: 9, row: 0 },
  blue: { col: 0, row: 9 },
  yellow: { col: 9, row: 9 },
};

/**
 * Where finished tokens rest inside the 3x3 centre.
 *
 * `HOME_TRIANGLE_COORDS` stores half-cell offsets (6.5, 7.5) to mean "just left
 * of centre" and "just right of centre", but flooring those collapses 7.5 to 7 —
 * so yellow and blue both landed on the same cell and stacked on top of each
 * other. Each colour gets the arm of the centre its own home column feeds into.
 */
const FINISH_CELL: Record<LudoColor, { col: number; row: number }> = {
  red: { col: 6, row: 7 },
  green: { col: 7, row: 6 },
  yellow: { col: 8, row: 7 },
  blue: { col: 7, row: 8 },
};

/** Arrow pointing the way each colour travels off its start square. */
const START_ARROW: Record<LudoColor, string> = {
  red: '▶',
  green: '▼',
  yellow: '◀',
  blue: '▲',
};

export default function LudoBoard({
  tokens,
  seatOrder,
  activeColor,
  diceValue,
  hasRolled,
  isMyTurn,
  onTokenClick,
}: LudoBoardProps) {
  // A two- or three-player game leaves real corners of the board empty. They
  // stay drawn — a Ludo board with a hole in it stops looking like a Ludo
  // board — but they are washed out, so nobody waits for a turn that is never
  // coming to the blue house.
  const seated = new Set(seatOrder);
  const unusedStyle = (color: LudoColor): React.CSSProperties =>
    seated.has(color) ? {} : { filter: 'grayscale(0.85) brightness(0.55)' };

  const getTokenCoords = (t: LudoToken): { col: number; row: number } => {
    if (t.position === -1) return YARD_GRID_COORDS[t.color][t.id];
    if (t.position === 999) return FINISH_CELL[t.color];
    if (t.position >= 100) {
      return HOME_COL_GRID_COORDS[t.color][t.position - 100] || { col: 7, row: 7 };
    }
    return TRACK_GRID_COORDS[t.position] || { col: 7, row: 7 };
  };

  /** Start square index -> the colour that owns it. */
  const startOwner = new Map<number, LudoColor>(
    (Object.entries(COLOR_START_POSITIONS) as [LudoColor, number][]).map(([c, i]) => [i, c])
  );

  // How many tokens share each square, so a stack can be fanned out rather than
  // hidden behind whichever happens to render last.
  const occupancy = new Map<string, number>();
  const seatOf = new Map<string, number>();
  for (const colour of seatOrder) {
    for (const token of tokens[colour] ?? []) {
      if (token.position === -1) continue;
      const { col, row } = getTokenCoords(token);
      const key = `${Math.floor(col)}:${Math.floor(row)}`;
      const seat = occupancy.get(key) ?? 0;
      seatOf.set(`${colour}${token.id}`, seat);
      occupancy.set(key, seat + 1);
    }
  }

  const cellStyle = (col: number, row: number): React.CSSProperties => ({
    gridColumnStart: Math.floor(col) + 1,
    gridRowStart: Math.floor(row) + 1,
  });

  return (
    <div className="relative w-full max-w-[520px] aspect-square mx-auto select-none">
      {/* Dark outer frame keeps the board sitting in the app's world without
          bleeding into the board itself. */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-950 p-2.5 sm:p-3 shadow-[0_0_60px_rgba(0,0,0,0.8)] border border-white/10">
        <div
          className="relative w-full h-full rounded-xl overflow-hidden"
          style={{
            display: 'grid',
            // Set explicitly: `grid-cols-15` is not a Tailwind class (it stops at
            // 12), so the board previously had no column template at all and
            // every cell fell into a content-sized implicit column.
            gridTemplateColumns: 'repeat(15, 1fr)',
            gridTemplateRows: 'repeat(15, 1fr)',
            backgroundColor: ROAD,
            gap: 0,
          }}
        >
          {/* ── the four quadrants ──────────────────────────────────────── */}
          {(Object.keys(QUADRANTS) as LudoColor[]).map((colour) => {
            const q = QUADRANTS[colour];
            const paint = PAINT[colour];
            return (
              <React.Fragment key={`base_${colour}`}>
                {/* Solid colour block */}
                <div
                  style={{
                    gridColumnStart: q.col + 1,
                    gridColumnEnd: q.col + 7,
                    gridRowStart: q.row + 1,
                    gridRowEnd: q.row + 7,
                    backgroundColor: paint.solid,
                    ...unusedStyle(colour),
                  }}
                />
                {/* White inner yard, sized so the four slots below land dead
                    centre in it. */}
                <div
                  style={{
                    gridColumnStart: q.col + 2,
                    gridColumnEnd: q.col + 6,
                    gridRowStart: q.row + 2,
                    gridRowEnd: q.row + 6,
                    backgroundColor: YARD_FILL,
                    ...unusedStyle(colour),
                  }}
                  className="rounded-lg"
                />
                {/* Slots drawn on the same grid cells the tokens spawn into.
                    They used to be a nested 2x2 flex box, which did not line up
                    with YARD_GRID_COORDS — so waiting pieces sat wedged between
                    their own slots instead of inside them. */}
                {YARD_GRID_COORDS[colour].map((slot, i) => (
                  <div
                    key={`slot_${colour}_${i}`}
                    style={cellStyle(slot.col, slot.row)}
                    className="flex items-center justify-center"
                  >
                    <div
                      className="w-[86%] h-[86%] rounded-full"
                      style={{
                        backgroundColor: paint.light,
                        border: `2px solid ${paint.deep}`,
                        ...unusedStyle(colour),
                      }}
                    />
                  </div>
                ))}
              </React.Fragment>
            );
          })}

          {/* ── the road ────────────────────────────────────────────────── */}
          {TRACK_GRID_COORDS.map((coord, idx) => {
            const owner = startOwner.get(idx);
            const isSafe = SAFE_POSITIONS.has(idx);
            return (
              <div
                key={`track_${idx}`}
                style={{
                  ...cellStyle(coord.col, coord.row),
                  backgroundColor: owner ? PAINT[owner].solid : ROAD,
                  border: `1px solid ${GRID_LINE}`,
                  ...(owner ? unusedStyle(owner) : {}),
                }}
                className="flex items-center justify-center"
              >
                {owner ? (
                  <span className="text-white text-[8px] sm:text-[10px] leading-none drop-shadow">
                    {START_ARROW[owner]}
                  </span>
                ) : (
                  // Safe squares need to be legible against white, and the old
                  // slate-400 star was almost invisible on the road.
                  isSafe && <span className="text-[10px] sm:text-[13px] leading-none text-slate-500">★</span>
                )}
              </div>
            );
          })}

          {/* ── coloured home columns running to the centre ─────────────── */}
          {(['red', 'green', 'yellow', 'blue'] as LudoColor[]).map((colour) =>
            HOME_COL_GRID_COORDS[colour].map((coord, step) => (
              <div
                key={`home_${colour}_${step}`}
                style={{
                  ...cellStyle(coord.col, coord.row),
                  backgroundColor: PAINT[colour].solid,
                  border: `1px solid ${GRID_LINE}`,
                  ...unusedStyle(colour),
                }}
              />
            ))
          )}

          {/* ── centre: four triangles, each pointing back down its own
                 home column, which is what makes the middle read as the
                 finish rather than as a hole in the board ─────────────── */}
          <div
            style={{ gridColumnStart: 7, gridColumnEnd: 10, gridRowStart: 7, gridRowEnd: 10 }}
            className="relative"
          >
            <div className="absolute inset-0" style={{ backgroundColor: ROAD }} />
            {/* green enters from the top, yellow from the right, blue from the
                bottom, red from the left — matching HOME_COL_GRID_COORDS. */}
            <div
              className="absolute inset-0"
              style={{ ...unusedStyle('green'), backgroundColor: PAINT.green.solid, clipPath: 'polygon(0 0, 100% 0, 50% 50%)' }}
            />
            <div
              className="absolute inset-0"
              style={{ ...unusedStyle('yellow'), backgroundColor: PAINT.yellow.solid, clipPath: 'polygon(100% 0, 100% 100%, 50% 50%)' }}
            />
            <div
              className="absolute inset-0"
              style={{ ...unusedStyle('blue'), backgroundColor: PAINT.blue.solid, clipPath: 'polygon(0 100%, 100% 100%, 50% 50%)' }}
            />
            <div
              className="absolute inset-0"
              style={{ ...unusedStyle('red'), backgroundColor: PAINT.red.solid, clipPath: 'polygon(0 0, 0 100%, 50% 50%)' }}
            />
            <div className="absolute inset-0 border" style={{ borderColor: GRID_LINE }} />
          </div>

          {/* ── tokens ──────────────────────────────────────────────────── */}
          {seatOrder.flatMap((colour) =>
            (tokens[colour] ?? []).map((token) => {
              const coords = getTokenCoords(token);
              const canMove =
                isMyTurn && colour === activeColor && hasRolled && diceValue
                  ? canMoveLudoToken(token, diceValue)
                  : false;

              // Fan stacked tokens so four on one square stay countable.
              const key = `${Math.floor(coords.col)}:${Math.floor(coords.row)}`;
              const seat = seatOf.get(`${colour}${token.id}`) ?? 0;
              const shared = occupancy.get(key) ?? 1;
              const spread = shared > 1 ? (seat - (shared - 1) / 2) * 26 : 0;

              const paint = PAINT[colour];

              return (
                <div
                  key={`${colour}_token_${token.id}`}
                  onClick={() => canMove && onTokenClick(token.id)}
                  style={{ ...cellStyle(coords.col, coords.row), zIndex: canMove ? 30 : 20 }}
                  className="flex items-center justify-center pointer-events-none"
                >
                  <div
                    style={{
                      transform: `translateX(${spread}%)`,
                      backgroundColor: paint.solid,
                      borderColor: canMove ? '#FFFFFF' : paint.deep,
                      boxShadow: canMove
                        ? '0 0 0 2px #FDE047, 0 2px 6px rgba(0,0,0,0.5)'
                        : '0 2px 4px rgba(0,0,0,0.45)',
                    }}
                    className={`relative w-[74%] h-[74%] rounded-full border-2 transition-transform ${
                      canMove ? 'cursor-pointer animate-bounce pointer-events-auto' : ''
                    }`}
                  >
                    {/* Off-centre highlight so a piece reads as a domed counter
                        rather than a flat dot. A token is ~24px across here, so
                        a number on it would be unreadable — the glow marks the
                        ones you can actually move. */}
                    <span
                      className="absolute rounded-full"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.75)',
                        width: '30%',
                        height: '30%',
                        left: '18%',
                        top: '16%',
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
