'use client';

import React from 'react';
import { useLiveFrame, type LiveFrame } from '@/lib/liveFrames';

/**
 * A live mirror of what the performer is actually doing.
 *
 * Driven by peer-to-peer frames rather than room state, so it moves at about
 * 20fps instead of the ~1.5s the server copy updates at. That difference is the
 * whole point: at one frame a second you are reading a number, and at twenty
 * you are watching somebody nearly hit a wall.
 *
 * Renders nothing when no recent frame has arrived — no peer connection, a game
 * that does not publish frames yet, or the performer having dropped — and the
 * surrounding SpectatorView carries on showing the slower summary underneath.
 * Every game degrades to what it showed before rather than to a blank panel.
 */

interface LiveMirrorProps {
  playerId: string | undefined;
}

export default function LiveMirror({ playerId }: LiveMirrorProps) {
  const frame = useLiveFrame(playerId);
  if (!frame) return null;

  if (frame.game === 'pitch_bird') return <PitchBirdMirror frame={frame} />;
  return null;
}

/** Reads a number off a frame without trusting a peer to have sent one. */
function num(frame: LiveFrame, key: string, fallback = 0): number {
  const value = frame.data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * The bird and the gate it is about to meet.
 *
 * Positions arrive as fractions of the performer's canvas, so this draws in its
 * own 100x62 space and stretches to whatever width the panel has.
 *
 * Exported without its subscription so it can be rendered from a fixed frame,
 * which is the only way to look at it without two browsers and a live match.
 */
export function PitchBirdMirror({ frame }: { frame: LiveFrame }) {
  const H = 62;
  const y = Math.max(0, Math.min(1, num(frame, 'y', 0.5))) * H;
  const gateX = num(frame, 'gx', -1);
  const gapTop = num(frame, 'gt') * H;
  const gapBottom = num(frame, 'gb') * H;
  const straining = frame.data.hot === true;
  const showGate = gateX >= 0 && gapBottom > gapTop;

  return (
    <div className="relative rounded-2xl overflow-hidden border-2 border-partyCyan/40 bg-[#050814]">
      <svg viewBox={`0 0 100 ${H}`} className="w-full block" preserveAspectRatio="none">
        <defs>
          <linearGradient id="mirror-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0B132B" />
            <stop offset="100%" stopColor="#050814" />
          </linearGradient>
        </defs>
        <rect width="100" height={H} fill="url(#mirror-sky)" />

        {/* The band the bird flies in, so height reads as height. */}
        {[0.25, 0.5, 0.75].map((line) => (
          <line
            key={line}
            x1="0"
            x2="100"
            y1={line * H}
            y2={line * H}
            stroke="#ffffff"
            strokeOpacity="0.06"
            strokeWidth="0.3"
          />
        ))}

        {showGate && (
          <g fill={straining ? '#FF4757' : '#00F0FF'} fillOpacity="0.75">
            <rect x={gateX * 100} y="0" width="7" height={gapTop} rx="1" />
            <rect x={gateX * 100} y={gapBottom} width="7" height={H - gapBottom} rx="1" />
          </g>
        )}

        {/* The bird sits at a fixed x — the world scrolls past it, same as the
            performer's own view, so the two read as the same game. */}
        <circle
          cx="18"
          cy={y}
          r="3.4"
          fill={straining ? '#FF4757' : '#FFD166'}
          stroke="#050814"
          strokeWidth="0.8"
        />
        <circle cx="18" cy={y} r="5.6" fill={straining ? '#FF4757' : '#FFD166'} fillOpacity="0.22" />
      </svg>

      <div className="absolute top-2 left-3 flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-partyCyan">Live</span>
        <span className="w-1.5 h-1.5 rounded-full bg-partyPink animate-pulse" />
      </div>
      <div className="absolute top-2 right-3 text-right">
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
          {num(frame, 'dist')}m
        </span>
      </div>
      {straining && (
        <p className="absolute bottom-2 w-full text-center text-[10px] font-black text-partyPink uppercase tracking-widest">
          straining!
        </p>
      )}
    </div>
  );
}
