'use client';

import React, { useRef, useEffect } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

export default function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let stars: Star[] = [];

    // The nebulae and the grid never change, but redrawing them meant rebuilding
    // three full-screen radial gradients and stroking the whole grid on every
    // frame — on every page, forever, competing with the mic and pitch loops for
    // the phone's CPU. They are painted once here and blitted instead.
    const backdrop = document.createElement('canvas');
    const backdropCtx = backdrop.getContext('2d');

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      // Match the backing store to the device's pixels so stars are not blurry
      // on a phone, but keep drawing in CSS pixels.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      generateStars();
      paintBackdrop();
      // Painted straight away rather than waiting on the next frame: rAF does
      // not fire while the tab is backgrounded, so the sky would otherwise come
      // back blank until the browser decides to animate again.
      renderOnce();
    };

    const generateStars = () => {
      const count = Math.floor((width() * height()) / 4500);
      stars = Array.from({ length: Math.min(count, 350) }, () => ({
        x: Math.random() * width(),
        y: Math.random() * height(),
        size: Math.random() * 2.2 + 0.3,
        baseOpacity: Math.random() * 0.7 + 0.15,
        twinkleSpeed: Math.random() * 0.008 + 0.002,
        twinklePhase: Math.random() * Math.PI * 2,
      }));
    };

    const width = () => canvas.clientWidth || window.innerWidth;
    const height = () => canvas.clientHeight || window.innerHeight;

    const paintBackdrop = () => {
      if (!backdropCtx) return;
      backdrop.width = canvas.width;
      backdrop.height = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      backdropCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdropCtx.clearRect(0, 0, width(), height());
      drawNebulae(backdropCtx);
      drawGrid(backdropCtx);
    };

    const drawNebulae = (ctx: CanvasRenderingContext2D) => {
      const w = width();
      const h = height();

      // Blue nebula top-center
      const g1 = ctx.createRadialGradient(w * 0.5, h * 0.15, 0, w * 0.5, h * 0.15, w * 0.45);
      g1.addColorStop(0, 'rgba(88, 166, 255, 0.07)');
      g1.addColorStop(1, 'transparent');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      // Purple nebula bottom-right
      const g2 = ctx.createRadialGradient(w * 0.85, h * 0.85, 0, w * 0.85, h * 0.85, w * 0.4);
      g2.addColorStop(0, 'rgba(137, 87, 229, 0.06)');
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      // Faint emerald nebula left
      const g3 = ctx.createRadialGradient(w * 0.1, h * 0.55, 0, w * 0.1, h * 0.55, w * 0.3);
      g3.addColorStop(0, 'rgba(16, 185, 129, 0.04)');
      g3.addColorStop(1, 'transparent');
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, w, h);
    };

    const drawGrid = (ctx: CanvasRenderingContext2D) => {
      const w = width();
      const h = height();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 0.5;
      const step = 48;

      ctx.beginPath();
      for (let x = 0; x <= w; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    };

    const drawStars = (t: number) => {
      for (const star of stars) {
        const twinkle = Math.sin(t * star.twinkleSpeed + star.twinklePhase);
        const opacity = star.baseOpacity * (0.6 + 0.4 * twinkle);
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240, 246, 252, ${Math.max(0.05, opacity)})`;
        ctx.fill();

        // Bright stars get a subtle glow
        if (star.size > 1.5) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 220, 255, ${Math.max(0.01, opacity * 0.12)})`;
          ctx.fill();
        }
      }
    };

    const renderOnce = (t = 0) => {
      ctx.clearRect(0, 0, width(), height());
      if (backdropCtx) {
        ctx.drawImage(backdrop, 0, 0, width(), height());
      } else {
        drawNebulae(ctx);
        drawGrid(ctx);
      }
      drawStars(t);
    };

    const animate = (t: number) => {
      animationId = requestAnimationFrame(animate);
      if ((window as any).pauseStarfield) return; // Optimize CPU by pausing during heavy mini-games
      renderOnce(t);
    };

    resize();
    window.addEventListener('resize', resize);

    // Someone who has asked for less motion gets the same sky, just without the
    // twinkle — resize() has already drawn it.
    if (!reduceMotion) animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
