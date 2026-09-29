'use client';

import React, { useMemo } from 'react';
import { PARALLAX_FACTOR, SCENERY_BLEED, buildSpaceScenery, type Parallax } from '@/lib/boardScenery';

/**
 * The sky the board sits in.
 *
 * Drawn outside the panning world and shifted by hand so each depth lags the
 * camera by a different amount. Pinning it to the world instead would make the
 * whole sky slide at road speed, which reads as a flat picture being dragged
 * about rather than distance behind the board.
 */

interface SpaceBackdropProps {
  /** Camera centre in 0..100 world coordinates. */
  x: number;
  y: number;
  zoom: number;
  worldSize: number;
}

/** World units -> pixels, including the bleed the scenery is drawn over. */
function layerStyle(layer: Parallax, x: number, y: number, scale: number): React.CSSProperties {
  const factor = PARALLAX_FACTOR[layer];
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: (100 + SCENERY_BLEED * 2) * scale,
    height: (100 + SCENERY_BLEED * 2) * scale,
    transform: `translate(-50%, -50%) translate3d(${(50 - x) * scale * factor}px, ${(50 - y) * scale * factor}px, 0)`,
    transition: 'transform 700ms cubic-bezier(0.22,1,0.36,1)',
    willChange: 'transform',
  };
}

export default function SpaceBackdrop({ x, y, zoom, worldSize }: SpaceBackdropProps) {
  // Built once. Regenerating per render would reshuffle the entire sky on every
  // poll the room does.
  const scenery = useMemo(() => buildSpaceScenery(), []);
  const scale = (worldSize * zoom) / 100;
  const span = 100 + SCENERY_BLEED * 2;
  const pos = (v: number) => ((v + SCENERY_BLEED) / span) * 100;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-[#05060f]">
      {/* Deep colour, so the far edges are never flat black. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 30% 10%, #131a3d 0%, #0a0d22 45%, #05060f 100%)',
        }}
      />

      {(['far', 'mid', 'near'] as Parallax[]).map((layer) => (
        <div key={layer} style={layerStyle(layer, x, y, scale)}>
          {/* Colour washes sit behind the stars of their own layer. */}
          {layer === 'far' &&
            scenery.nebulae.map((n, i) => (
              <div
                key={`neb-${i}`}
                className="absolute rounded-full"
                style={{
                  left: `${pos(n.x)}%`,
                  top: `${pos(n.y)}%`,
                  width: `${(n.r / span) * 200}%`,
                  height: `${(n.r / span) * 200}%`,
                  transform: 'translate(-50%, -50%)',
                  background: `radial-gradient(circle, ${n.hue} 0%, transparent 68%)`,
                  opacity: n.o,
                  filter: 'blur(28px)',
                }}
              />
            ))}

          {scenery.stars
            .filter((s) => s.layer === layer)
            .map((s, i) => (
              <div
                key={`star-${layer}-${i}`}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${pos(s.x)}%`,
                  top: `${pos(s.y)}%`,
                  width: `${s.r * 4}px`,
                  height: `${s.r * 4}px`,
                  opacity: s.o,
                  boxShadow: s.layer === 'near' ? '0 0 6px rgba(255,255,255,0.9)' : undefined,
                  animation: `boardTwinkle ${s.twinkle}s ease-in-out ${i % 7}s infinite`,
                }}
              />
            ))}

          {scenery.landmarks
            .filter((l) => l.layer === layer)
            .map((l, i) => (
              <img
                key={`mark-${layer}-${i}`}
                src={l.src}
                alt=""
                aria-hidden
                className="absolute object-contain mix-blend-screen"
                style={{
                  left: `${pos(l.x)}%`,
                  top: `${pos(l.y)}%`,
                  width: `${(l.size / span) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${l.rotate}deg)`,
                  opacity: l.opacity,
                  WebkitMaskImage: `radial-gradient(circle, black ${l.feather}%, transparent 74%)`,
                  maskImage: `radial-gradient(circle, black ${l.feather}%, transparent 74%)`,
                }}
              />
            ))}

          {scenery.comets
            .filter((c) => c.layer === layer)
            .map((c, i) => (
              <div
                key={`comet-${layer}-${i}`}
                className="absolute board-comet"
                style={{
                  left: `${pos(c.x)}%`,
                  top: `${pos(c.y)}%`,
                  width: `${(c.length / span) * 100}%`,
                  height: 2,
                  transformOrigin: 'left center',
                  background:
                    'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(186,230,253,0.7) 70%, rgba(255,255,255,0.95) 100%)',
                  borderRadius: 999,
                  // Rotation lives here and the keyframes only translate, so the
                  // animation never has to know which way this one is pointing.
                  ['--comet-angle' as string]: `${c.angle}deg`,
                  animationDuration: `${c.duration}s`,
                  animationDelay: `${c.delay}s`,
                }}
              />
            ))}

          {scenery.debris
            .filter((d) => d.layer === layer)
            .map((d, i) => (
              <div
                key={`deb-${layer}-${i}`}
                className="absolute rounded-[35%] bg-slate-500/40 border border-white/10"
                style={{
                  left: `${pos(d.x)}%`,
                  top: `${pos(d.y)}%`,
                  width: `${d.size * 5}px`,
                  height: `${d.size * 4}px`,
                  transform: `translate(-50%, -50%) rotate(${d.rot}deg)`,
                  animation: `boardDrift ${Math.abs(d.spin)}s linear infinite`,
                }}
              />
            ))}
        </div>
      ))}

      {/* Vignette, so the edges of the window fall away instead of stopping. */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 100% at 50% 50%, transparent 55%, rgba(2,3,10,0.85) 100%)' }}
      />
    </div>
  );
}
