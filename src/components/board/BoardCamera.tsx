'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A window onto a board bigger than the screen.
 *
 * The map used to be a single square capped at 560px, so the whole journey was
 * squeezed into one small picture that always fit — which is exactly why it felt
 * cramped no matter how much detail went into it. The world is now several
 * times the size of the viewport and this moves the view around it: drag to pan,
 * pinch or wheel to zoom, and the camera walks to whoever is up so nobody has to
 * go looking for their own token.
 *
 * The world keeps the 0..100 coordinate space the board has always used. Only
 * its size in pixels changed, so tiles, tokens and the road are all untouched by
 * this — they still position themselves as percentages of the box.
 */

export type CameraFocus = { x: number; y: number } | null;

interface BoardCameraProps {
  /** World size in CSS pixels at zoom 1. Square, matching the coordinate space. */
  worldSize: number;
  /** Where to walk the view to, in 0..100 world coordinates. */
  focus: CameraFocus;
  minZoom?: number;
  maxZoom?: number;
  className?: string;
  /** Rendered inside the world, positioned in percentages. */
  children: React.ReactNode;
  /** Lets the parent draw scenery that reacts to the camera. */
  renderBackdrop?: (view: { x: number; y: number; zoom: number }) => React.ReactNode;
  /** Extra controls drawn over the viewport, outside the panning world. */
  overlay?: React.ReactNode;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function BoardCamera({
  worldSize,
  focus,
  minZoom = 0.3,
  maxZoom = 1.8,
  className = '',
  children,
  renderBackdrop,
  overlay,
}: BoardCameraProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(0);
  // Camera position is the world point sitting at the centre of the viewport.
  const [center, setCenter] = useState({ x: 50, y: 50 });

  /**
   * Set while the player is driving the view themselves.
   *
   * Without it the follow effect would yank the board back the instant somebody
   * dragged away to look at the finish, which feels like the map fighting you.
   */
  const manualUntil = useRef(0);
  const drag = useRef<{ id: number; x: number; y: number; cx: number; cy: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Opening zoom, chosen from the viewport rather than fixed.
   *
   * A single number cannot serve both: 0.85 filled a laptop nicely and left a
   * phone looking at two tiles through a letterbox. This aims to frame roughly
   * the same amount of *board* on any screen — enough road to see where you are
   * going, without the tiles shrinking to dots.
   */
  useEffect(() => {
    if (zoom !== 0 || size.w === 0 || size.h === 0) return;
    const fitX = size.w / ((worldSize * FIT_SPAN_X) / 100);
    const fitY = size.h / ((worldSize * FIT_SPAN_Y) / 100);
    setZoom(clamp(Math.min(fitX, fitY), minZoom, maxZoom));
  }, [size.w, size.h, worldSize, zoom, minZoom, maxZoom]);

  // Pixels per world unit at the current zoom.
  const scale = (worldSize * zoom) / 100;

  /**
   * Keeps the world covering the viewport.
   *
   * Panning to a corner should not reveal the page behind the board, so the
   * centre is bounded by however much world lies outside the window. When the
   * world is smaller than the viewport (fully zoomed out) the axis is simply
   * locked to the middle.
   */
  const bound = useCallback(
    (next: { x: number; y: number }) => {
      const halfW = size.w / 2 / scale;
      const halfH = size.h / 2 / scale;
      return {
        x: halfW >= 50 ? 50 : clamp(next.x, halfW, 100 - halfW),
        y: halfH >= 50 ? 50 : clamp(next.y, halfH, 100 - halfH),
      };
    },
    [size.w, size.h, scale]
  );

  useEffect(() => {
    setCenter((c) => bound(c));
  }, [bound]);

  // Walk to whoever is up, unless the player is currently driving.
  useEffect(() => {
    if (!focus) return;
    if (Date.now() < manualUntil.current) return;
    setCenter(bound({ x: focus.x, y: focus.y }));
  }, [focus, bound]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (pinch.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: center.x, cy: center.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // Dragging right moves the world right, so the camera centre goes left.
    const nx = d.cx - (e.clientX - d.x) / scale;
    const ny = d.cy - (e.clientY - d.y) / scale;
    manualUntil.current = Date.now() + MANUAL_HOLD_MS;
    setCenter(bound({ x: nx, y: ny }));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    manualUntil.current = Date.now() + MANUAL_HOLD_MS;
    setZoom((z) => clamp(z * (e.deltaY > 0 ? 0.9 : 1.1), minZoom, maxZoom));
  };

  // Pinch, tracked off the raw touch list because two pointers are easier to
  // reason about here than a gesture library.
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    drag.current = null;
    const [a, b] = [e.touches[0], e.touches[1]];
    pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinch.current) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    manualUntil.current = Date.now() + MANUAL_HOLD_MS;
    setZoom(clamp((pinch.current.zoom * dist) / (pinch.current.dist || 1), minZoom, maxZoom));
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinch.current = null;
  };

  const recenter = () => {
    manualUntil.current = 0;
    if (focus) setCenter(bound({ x: focus.x, y: focus.y }));
  };

  const worldPx = worldSize * zoom;
  // The world's top-left, in viewport pixels.
  const offsetX = size.w / 2 - center.x * scale;
  const offsetY = size.h / 2 - center.y * scale;

  return (
    <div
      ref={viewportRef}
      className={`relative overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {renderBackdrop?.({ x: center.x, y: center.y, zoom: zoom || 1 })}

      <div
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{
          width: worldPx,
          height: worldPx,
          // Hidden for the single frame before the viewport has been measured,
          // rather than shown at zoom 0 with the whole board in one pixel.
          opacity: zoom === 0 ? 0 : 1,
          transform: `translate3d(${offsetX}px, ${offsetY}px, 0)`,
          // Only the follow step is animated. Animating drags would make the
          // board feel like it is on a rubber band.
          transition: drag.current || pinch.current ? 'none' : 'transform 700ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {children}
      </div>

      <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-1.5">
        <CameraButton label="Zoom in" onClick={() => setZoom((z) => clamp(z * 1.25, minZoom, maxZoom))}>+</CameraButton>
        <CameraButton label="Zoom out" onClick={() => setZoom((z) => clamp(z / 1.25, minZoom, maxZoom))}>−</CameraButton>
        <CameraButton label="Centre on the active player" onClick={recenter}>◎</CameraButton>
      </div>

      {overlay}
    </div>
  );
}

/** How long a drag or pinch stops the camera from following. */
const MANUAL_HOLD_MS = 6000;

/** World units to frame on opening — about six tiles of road either way. */
const FIT_SPAN_X = 52;
const FIT_SPAN_Y = 44;

function CameraButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      // Sized for a thumb: the board is played on phones, and these sit over a
      // surface that also responds to dragging.
      onPointerDown={(e) => e.stopPropagation()}
      className="w-11 h-11 rounded-2xl bg-slate-950/80 hover:bg-slate-800/90 border border-white/25 text-white font-black text-lg backdrop-blur-md shadow-lg transition-colors flex items-center justify-center"
    >
      {children}
    </button>
  );
}
