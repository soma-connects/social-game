// Real-time pitch detection hook powered by the open-source Pitchy library (McLeod Pitch Method MPM).
//
// Industry-standard pitch detection engine for browser singing/pitch games.
// Maps vocal pitch + volume to 0.0 -> 1.0 lift in real-time.

import { useRef, useState, useCallback, useEffect } from 'react';
import { PitchDetector } from 'pitchy';
import { micStream } from '@/lib/micStream';
import { DEFAULT_RANGE, PitchSmoother, rangeFromSamples } from '@/lib/pitchTracking';

export interface PitchData {
  /** Detected fundamental frequency in Hz, or 0 if unvoiced / silent. */
  pitch: number;
  /** RMS volume in range 0–100. */
  volume: number;
  /** Normalised lift value 0.0 (silence/low) → 1.0 (highest pitch). */
  lift: number;
  /** Whether the calibration phase has completed. */
  isCalibrated: boolean;
  /** Whether detection is actively running. */
  isActive: boolean;
}

interface CalibrationRange {
  low: number;
  high: number;
}

export const CALIBRATION_MS = 3500;
const MEDIAN_WINDOW = 5;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function usePitchDetection() {
  const [data, setData] = useState<PitchData>({
    pitch: 0,
    volume: 0,
    lift: 0,
    isCalibrated: false,
    isActive: false,
  });

  const activeRef = useRef(false);
  const calibratingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const historyRef = useRef<number[]>([]);
  // Turns detected pitches into a steady height for the bird - see pitchTracking.ts.
  const smootherRef = useRef(new PitchSmoother(DEFAULT_RANGE));
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibrationRef = useRef<CalibrationRange>({ low: 90, high: 450 });

  const stopDetection = useCallback(() => {
    activeRef.current = false;
    calibratingRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setData((d) => ({ ...d, isActive: false }));
  }, []);

  const startCalibration = useCallback(async (): Promise<boolean> => {
    try {
      const { stream } = await micStream.acquire();
      if (!stream) return false;

      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      activeRef.current = true;
      calibratingRef.current = true;
      calibrationSamplesRef.current = [];
      smootherRef.current.reset();
      smootherRef.current.setRange(DEFAULT_RANGE);

      setData((d) => ({ ...d, isActive: true, isCalibrated: false }));

      // Initialize Pitchy open-source McLeod Pitch Detector
      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      detector.minVolumeDecibels = -45;

      const inputBuffer = new Float32Array(analyser.fftSize);
      const tick = () => {
        if (!activeRef.current || !analyserRef.current) return;

        analyserRef.current.getFloatTimeDomainData(inputBuffer);

        // 1. Calculate RMS volume (0-100) from the mic waveform. This tracks
        // singing more reliably than averaging frequency bins.
        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) sum += inputBuffer[i] * inputBuffer[i];
        const rms = Math.sqrt(sum / inputBuffer.length);
        const volume = Math.min(100, Math.round(rms * 350));

        // 2. Pitchy McLeod Pitch Detection
        const [detectedPitch, clarity] = detector.findPitch(inputBuffer, ctx.sampleRate);

        let pitch = 0;
        // Require clear periodic vocal sound (clarity > 0.70 and min volume)
        const voiced = clarity > 0.62 && volume > 6 && detectedPitch >= 60 && detectedPitch <= 1000;
        if (voiced) {
          historyRef.current.push(detectedPitch);
          if (historyRef.current.length > MEDIAN_WINDOW) historyRef.current.shift();
          pitch = median(historyRef.current);
        } else {
          historyRef.current = [];
        }

        // Calibration phase: collect clean samples
        if (calibratingRef.current && pitch > 0) {
          calibrationSamplesRef.current.push(pitch);
        }

        // 3. Height for the bird. Fed the raw detection rather than `pitch`, which
        // is already smoothed for the karaoke game: the bird does its own, longer,
        // smoothing and would only add lag on top of that one.
        const lift = smootherRef.current.update(voiced ? detectedPitch : 0, performance.now());

        setData({
          pitch: Math.round(pitch),
          volume,
          lift,
          isCalibrated: !calibratingRef.current,
          isActive: true,
        });

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);

      // Finalise calibration after CALIBRATION_MS
      setTimeout(() => {
        if (!activeRef.current) return;
        calibratingRef.current = false;
        // The bird's own range, in semitones and never narrower than an octave.
        smootherRef.current.setRange(rangeFromSamples(calibrationSamplesRef.current));
        const samples = calibrationSamplesRef.current.sort((a, b) => a - b);
        if (samples.length >= 5) {
          const p10 = samples[Math.floor(samples.length * 0.1)];
          const p90 = samples[Math.floor(samples.length * 0.9)];
          calibrationRef.current = {
            low: Math.max(60, p10 - 15),
            high: Math.min(900, p90 + 20),
          };
        }
        setData((d) => ({ ...d, isCalibrated: true }));
      }, CALIBRATION_MS);

      return true;
    } catch (err) {
      console.error('Error initializing Pitchy detector:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);

  const getRange = useCallback(() => calibrationRef.current, []);

  return {
    ...data,
    getRange,
    startCalibration,
    stopDetection,
  };
}
