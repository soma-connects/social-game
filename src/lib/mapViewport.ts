/**
 * Where to put the map so that one point on it sits in the middle of the screen.
 *
 * The roadmap has 99 tiles, each nearly fifty pixels wide, and on a phone the
 * whole of it was squeezed into a square about 340px across: tiles overlapped
 * tiles and avatars sat on top of both, so nobody could find their own token.
 * On a small screen the map is now drawn several times larger than the window
 * and slid so the player being followed stays in view.
 */

/** How many times larger than its window the map is drawn, by screen width. */
export function mapZoomForWidth(width: number): number {
  if (width < 420) return 2.6;
  if (width < 640) return 2;
  return 1;
}

export type MapPoint = { x: number; y: number };

/**
 * The left and top of the map, as a percentage of the window, that centres
 * `focus` (given in percent of the map, as tile positions are).
 *
 * Clamped so the map never slides far enough to show empty space past its edge:
 * near a corner the token sits off-centre instead.
 */
export function viewportOffset(focus: MapPoint, zoom: number): { left: number; top: number } {
  if (zoom <= 1) return { left: 0, top: 0 };
  const lowest = 100 - 100 * zoom;
  const clamp = (value: number) => Math.max(lowest, Math.min(0, value));
  return { left: clamp(50 - focus.x * zoom), top: clamp(50 - focus.y * zoom) };
}
