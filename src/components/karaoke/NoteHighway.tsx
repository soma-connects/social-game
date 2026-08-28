'use client';

// The scrolling pitch highway.
//
// Canvas rather than DOM. This redraws every frame with a live pitch trace
// behind the playhead, and pushing sixty layout passes a second through React
// turns a smooth game into a slideshow — the same reason PitchBird and Asteroid
// Defense are canvas.
//
// The drawing is deliberately dumb: it is handed a staged song, a playhead time
// and the current pitch, and owns none of that state. Scoring lives in
// karaokeScoring.ts so the picture and the score can never disagree.

import React, { useEffect, useRef } from 'react';
import { StagedSong } from '@/lib/karaoke/karaokeScoring';

interface NoteHighwayProps {
  staged: StagedSong;
  /** Seconds into the song. Read from a ref by the parent's own loop. */
  timeRef: React.MutableRefObject<number>;
  /** Live detected pitch in Hz, 0 for silence. */
  pitchRef: React.MutableRefObject<number>;
  /** Per-note accuracy 0..1, for lighting up notes as they are sung. */
  accuracyOf: (noteIndex: number) => number;
  /** Drawn as a ribbon of past pitch. Cleared by the parent between songs. */
  traceRef: React.MutableRefObject<{ t: number; hz: number }[]>;
  /** Paused while the countdown is running. */
  running: boolean;
}

/** Seconds of song visible to the right of the playhead. */
const LOOKAHEAD = 3.2;
/** Seconds of already-sung song kept visible to the left. */
const LOOKBEHIND = 1.1;

const COLORS = {
  bg: '#080b12',
  lane: 'rgba(255,255,255,0.035)',
  laneLine: 'rgba(255,255,255,0.07)',
  note: '#334155',
  noteEdge: '#475569',
  noteLive: '#22d3ee',
  noteGood: '#34d399',
  noteMiss: '#7f1d1d',
  playhead: 'rgba(253, 224, 71, 0.9)',
  trace: '#fde047',
  text: '#e2e8f0',
};

export default function NoteHighway({
  staged,
  timeRef,
  pitchRef,
  accuracyOf,
  traceRef,
  running,
}: NoteHighwayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  // Everything the loop reads that is not already a ref. Held this way so the
  // effect below can depend on the song alone and never restart mid-draw.
  const accuracyRef = useRef(accuracyOf);
  accuracyRef.current = accuracyOf;
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match the backing store to the CSS size so lines are crisp on a phone.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const semitoneSpan = Math.max(6, staged.high - staged.low);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const now = timeRef.current;

      // Playhead sits a third in, so there is room to see what is coming
      // without losing sight of the note being sung.
      const playX = w * 0.3;
      const pxPerSecond = (w - playX) / LOOKAHEAD;

      const yFor = (semitones: number) => {
        const fromTop = (staged.high - semitones) / semitoneSpan;
        return 16 + fromTop * (h - 32);
      };
      const xFor = (seconds: number) => playX + (seconds - now) * pxPerSecond;

      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, w, h);

      // Lanes, one per semitone actually used, so the picture says something
      // about the shape of the melody rather than being an even grid.
      const used = new Set(staged.timeline.map((n) => n.semitones));
      ctx.lineWidth = 1;
      used.forEach((semitones) => {
        const y = yFor(semitones);
        ctx.strokeStyle = COLORS.laneLine;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      });

      // Notes.
      const noteHeight = Math.max(10, Math.min(26, (h - 32) / semitoneSpan));
      for (const note of staged.timeline) {
        const x = xFor(note.startAt);
        const width = Math.max(6, note.beats * staged.secondsPerBeat * pxPerSecond - 3);
        if (x + width < -40 || x > w + 40) continue;

        const y = yFor(note.semitones) - noteHeight / 2;
        const isLive = now >= note.startAt && now < note.endAt;
        const accuracy = accuracyRef.current(note.index);
        const done = now >= note.endAt;

        let fill = COLORS.note;
        if (done) fill = accuracy >= 0.5 ? COLORS.noteGood : COLORS.noteMiss;
        else if (isLive) fill = COLORS.noteLive;

        ctx.fillStyle = fill;
        roundRect(ctx, x, y, width, noteHeight, Math.min(7, noteHeight / 2));
        ctx.fill();

        // A fill bar inside the live note, so holding it reads as progress.
        if ((isLive || done) && accuracy > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          roundRect(ctx, x, y, Math.max(3, width * accuracy), noteHeight, Math.min(7, noteHeight / 2));
          ctx.fill();
        }

        ctx.strokeStyle = isLive ? '#a5f3fc' : COLORS.noteEdge;
        ctx.lineWidth = isLive ? 2 : 1;
        roundRect(ctx, x, y, width, noteHeight, Math.min(7, noteHeight / 2));
        ctx.stroke();

        // The syllable, only while there is room for it to be legible.
        if (width > 22 && noteHeight >= 13) {
          ctx.fillStyle = COLORS.text;
          ctx.font = `600 ${Math.min(12, noteHeight - 3)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(note.syllable, x + 5, y + noteHeight / 2 + 0.5, width - 8);
        }
      }

      // Where the singer has actually been. Trimmed to the visible window so
      // the array does not grow for the length of the song.
      const trace = traceRef.current;
      const cutoff = now - LOOKBEHIND;
      while (trace.length > 0 && trace[0].t < cutoff) trace.shift();

      if (trace.length > 1) {
        ctx.strokeStyle = COLORS.trace;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        let drawing = false;
        for (const point of trace) {
          if (point.hz <= 0) {
            drawing = false;
            continue;
          }
          const semitones = 12 * Math.log2(point.hz / staged.tonicHz);
          const x = xFor(point.t);
          const y = yFor(semitones);
          if (!drawing) {
            ctx.moveTo(x, y);
            drawing = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // Playhead.
      ctx.strokeStyle = COLORS.playhead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 6);
      ctx.lineTo(playX, h - 6);
      ctx.stroke();

      // The singer's current pitch, as a dot on the playhead.
      const hz = pitchRef.current;
      if (hz > 0) {
        const semitones = 12 * Math.log2(hz / staged.tonicHz);
        const y = yFor(semitones);
        ctx.fillStyle = COLORS.trace;
        ctx.beginPath();
        ctx.arc(playX, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#080b12';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [staged, timeRef, pitchRef, traceRef]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-[190px] sm:h-[240px] rounded-xl border border-cyan-900/60 bg-[#080b12]"
    />
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
