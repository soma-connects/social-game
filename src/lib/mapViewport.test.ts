import { describe, expect, it } from 'vitest';
import { BOARD_GRAPH } from './gameRules';
import { mapZoomForWidth, viewportOffset } from './mapViewport';

describe('how large the map is drawn', () => {
  it('is the same size as the window on a desktop or tablet', () => {
    expect(mapZoomForWidth(1280)).toBe(1);
    expect(mapZoomForWidth(768)).toBe(1);
    expect(mapZoomForWidth(640)).toBe(1);
  });

  it('is drawn larger the smaller the screen', () => {
    expect(mapZoomForWidth(600)).toBe(2);
    expect(mapZoomForWidth(419)).toBe(2.6);
    expect(mapZoomForWidth(375)).toBe(2.6);
    expect(mapZoomForWidth(320)).toBe(2.6);
  });
});

describe('centring a point', () => {
  it('does not move a map that fits its window', () => {
    expect(viewportOffset({ x: 30, y: 80 }, 1)).toEqual({ left: 0, top: 0 });
  });

  it('puts the point in the middle of the window', () => {
    const zoom = 2.6;
    const focus = { x: 50, y: 50 };
    const { left, top } = viewportOffset(focus, zoom);
    // Where that point lands in the window, as a percentage of it.
    expect(left + focus.x * zoom).toBeCloseTo(50, 5);
    expect(top + focus.y * zoom).toBeCloseTo(50, 5);
  });

  it('never slides far enough to show empty space past an edge', () => {
    const zoom = 2.6;
    for (const focus of [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }]) {
      const { left, top } = viewportOffset(focus, zoom);
      expect(left).toBeLessThanOrEqual(0);
      expect(left).toBeGreaterThanOrEqual(100 - 100 * zoom);
      expect(top).toBeLessThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(100 - 100 * zoom);
    }
  });

  it('keeps a token near a corner inside the window, off centre', () => {
    const zoom = 2.6;
    const start = BOARD_GRAPH[0];
    const { left, top } = viewportOffset(start, zoom);
    const inWindowX = left + start.x * zoom;
    const inWindowY = top + start.y * zoom;
    expect(inWindowX).toBeGreaterThan(0);
    expect(inWindowX).toBeLessThan(100);
    expect(inWindowY).toBeGreaterThan(0);
    expect(inWindowY).toBeLessThan(100);
  });

  it('keeps every tile on the board reachable from some view', () => {
    for (const node of Object.values(BOARD_GRAPH)) {
      const { left, top } = viewportOffset(node, 2.6);
      const x = left + node.x * 2.6;
      const y = top + node.y * 2.6;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(100);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(100);
    }
  });
});
