// Real-time pitch detection hook for the PitchBird mini-game.
//
// Uses an autocorrelation algorithm on time-domain audio data to extract the
// fundamental frequency (F0) of the player's voice. A 3-second calibration
// phase maps their vocal range to a normalised 0→1 "lift" value that the
// canvas game reads every frame.
//
// Shares the mic via the existing micStream singleton so the voice call and
// speech recogniser are not interrupted.

import { useRef, useState, useCallback, useEffect } from 'react';
import { micStream } from '@/lib/micStream';

export interface PitchData {
  /** Detected fundamental frequency in Hz, or 0 if unvoiced / silent. */
  pitch: number;
  /** RMS volume in range 0–100. */
  volume: number;
  /** Normalised lift value 0.0 (silence/low) → 1.0 (highest pitch). */
  lift: number;
  /** Whether the 3-second calibration phase has completed. */
  isCalibrated: boolean;
  /** Whether detection is actively running. */
  isActive: boolean;
}

interface CalibrationRange {
  low: number;
  high: number;
}

// ── Autocorrelation pitch detection ────────────────────────────────────────

const MIN_FREQ = 60;   // Hz – lowest reasonable voice pitch
const MAX_FREQ = 900;  // Hz – highest falsetto / scream
const RMS_THRESHOLD = 0.012; // Below this RMS the signal is silence.

/**
 * Median window over raw pitch readings.
 *
 * Autocorrelation regularly lands an octave out — reporting half or double the
 * true frequency for a frame or two. An average smears those outliers into the
 * signal; a median rejects them outright, which is the standard fix in pitch
 * trackers. Odd length so there is a true middle sample.
 */
const MEDIAN_WINDOW = 5;

/**
 * How long an unvoiced frame keeps the last pitch before the reading decays.
 * Balanced so brief consonants don't drop the bird, but stopping speech is responsive.
 */
const UNVOICED_HOLD_MS = 100;

/**
 * Narrowest vocal range the game will map the screen to.
 *
 * Roughly an octave. Anything tighter and small, involuntary pitch wobble
 * translates into large jumps on screen — the difference between a bird you
 * steer and one that flails.
 */
const MIN_RANGE_HZ = 140;

/** Where the player floats when no voice is detected at all. */
const NEUTRAL_LIFT = 0.5;

/**
 * Calibration window. Long enough to genuinely sweep low → high; three seconds
 * had people getting one note out before it closed, which is exactly the case
 * MIN_RANGE_HZ then has to rescue.
 */
export const CALIBRATION_MS = 4000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Pulls octave errors back in line with the recent trend.
 *
 * If a reading is within 6% of exactly half or double the running median, it is
 * almost certainly the detector picking the wrong harmonic rather than the
 * singer genuinely leaping an octave mid-note.
 */
function correctOctave(pitch: number, reference: number): number {
  if (pitch <= 0 || reference <= 0) return pitch;
  const ratio = pitch / reference;
  if (Math.abs(ratio - 2) < 0.12) return pitch / 2;
  if (Math.abs(ratio - 0.5) < 0.06) return pitch * 2;
  return pitch;
}

/**
 * Classic autocorrelation pitch detector. Returns frequency in Hz or 0.
 *
 * For each possible period τ (in samples), we compute
 *   r(τ) = Σ x[i] × x[i+τ]
 * and look for the first peak after the initial dip. The period at that peak
 * is the fundamental period → f = sampleRate / period.
 */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  // 1. RMS gate — skip near-silent frames.
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < RMS_THRESHOLD) return 0;

  // 2. Bounds for the lag search, derived from the frequency band.
  const minPeriod = Math.floor(sampleRate / MAX_FREQ);
  const maxPeriod = Math.min(Math.ceil(sampleRate / MIN_FREQ), buf.length >> 1);

  // 3. Autocorrelation per lag, normalised against the zero-lag energy.
  //    Normalising matters: the raw sum scales with loudness, so a fixed
  //    threshold like "corr < 0.1" would trigger at completely different points
  //    for a quiet voice than a loud one.
  const energy = rms * rms * buf.length;
  if (energy <= 0) return 0;

  let bestCorr = -1;
  let bestPeriod = 0;
  let foundDip = false;

  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    let corr = 0;
    for (let i = 0; i < buf.length - tau; i++) {
      corr += buf[i] * buf[i + tau];
    }
    corr /= energy; // now roughly 1.0 at perfect periodicity

    // Skip past the zero-lag shoulder before hunting for the true peak.
    if (!foundDip && corr < 0.35) foundDip = true;

    if (foundDip && corr > bestCorr) {
      bestCorr = corr;
      bestPeriod = tau;
    }

    // Early exit once we are clearly past a peak.
    if (foundDip && bestCorr > 0 && corr < bestCorr * 0.85) break;
  }

  // Require a genuinely periodic frame. Noise and consonants correlate weakly,
  // and letting them through is what produced the jumpy readings.
  if (bestPeriod === 0 || bestCorr < 0.3) return 0;

  // 4. Parabolic interpolation around the peak for sub-sample accuracy.
  const prev = autocorrelationAt(buf, bestPeriod - 1);
  const curr = autocorrelationAt(buf, bestPeriod);
  const next = autocorrelationAt(buf, bestPeriod + 1);
  const shift = (prev - next) / (2 * (prev - 2 * curr + next));
  const refinedPeriod = bestPeriod + (Number.isFinite(shift) ? shift : 0);

  return sampleRate / refinedPeriod;
}

function autocorrelationAt(buf: Float32Array, tau: number): number {
  if (tau < 0 || tau >= buf.length) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length - tau; i++) sum += buf[i] * buf[i + tau];
  return sum;
}

// ── React Hook ─────────────────────────────────────────────────────────────

export function usePitchDetection() {
  const [data, setData] = useState<PitchData>({
    pitch: 0,
    volume: 0,
    lift: 0,
    isCalibrated: false,
    isActive: false,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const calibrationRef = useRef<CalibrationRange>({ low: 150, high: 400 });
  const calibratingRef = useRef(false);
  const calibrationSamplesRef = useRef<number[]>([]);
  const calibrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdsMicRef = useRef(false);
  const activeRef = useRef(false);

  // Rolling window of recent voiced pitches, for the median filter.
  const historyRef = useRef<number[]>([]);
  // Last confidently voiced reading, held briefly across breaths.
  const lastVoicedRef = useRef<{ pitch: number; at: number }>({ pitch: 0, at: 0 });

  // Smoothing: exponential moving average on lift to avoid jitter.
  const smoothLiftRef = useRef(0);
  const SMOOTH_FACTOR = 0.25; // Lower = smoother, higher = more responsive.

  const cleanup = useCallback(() => {
    activeRef.current = false;
    calibratingRef.current = false;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (calibrationTimerRef.current) {
      clearTimeout(calibrationTimerRef.current);
      calibrationTimerRef.current = null;
    }

    analyserRef.current = null;

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    if (holdsMicRef.current) {
      micStream.release();
      holdsMicRef.current = false;
    }

    smoothLiftRef.current = 0;
    historyRef.current = [];
    lastVoicedRef.current = { pitch: 0, at: 0 };
    setData({ pitch: 0, volume: 0, lift: 0, isCalibrated: false, isActive: false });
  }, []);

  /**
   * Starts the pitch detection pipeline. Call once when the mini-game mounts.
   * The first 3 seconds are calibration — the player vocalises low and high
   * pitches so we can map their range.
   */
  const startCalibration = useCallback(async (): Promise<boolean> => {
    cleanup();

    const { stream, error } = await micStream.acquire();
    if (error || !stream) return false;
    holdsMicRef.current = true;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      activeRef.current = true;
      calibratingRef.current = true;
      calibrationSamplesRef.current = [];

      setData((d) => ({ ...d, isActive: true, isCalibrated: false }));

      const buf = new Float32Array(analyser.fftSize);
      const byteData = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!activeRef.current || !analyserRef.current) return;

        // Pitch
        analyserRef.current.getFloatTimeDomainData(buf);
        const rawPitch = detectPitch(buf, ctx.sampleRate);

        // Volume (0–100)
        analyserRef.current.getByteFrequencyData(byteData);
        let sum = 0;
        for (let i = 0; i < byteData.length; i++) sum += byteData[i];
        const volume = Math.min(100, Math.round((sum / byteData.length / 90) * 100));

        // ── Stabilise the pitch signal ───────────────────────────────
        // Order matters: octave-correct against the recent trend, push through
        // a median window to drop outliers, and only then smooth. Smoothing
        // first would blend a bad reading into the result permanently.
        const now = performance.now();
        let pitch = 0;

        if (rawPitch > 0) {
          const reference = historyRef.current.length > 0 ? median(historyRef.current) : rawPitch;
          const corrected = correctOctave(rawPitch, reference);

          historyRef.current.push(corrected);
          if (historyRef.current.length > MEDIAN_WINDOW) historyRef.current.shift();

          pitch = median(historyRef.current);
          lastVoicedRef.current = { pitch, at: now };
        } else if (now - lastVoicedRef.current.at < UNVOICED_HOLD_MS) {
          // Brief gap — a breath or a consonant. Hold the last note rather than
          // dropping the player out of the sky.
          pitch = lastVoicedRef.current.pitch;
        } else {
          historyRef.current = [];
        }

        // Calibration: collect voiced samples.
        if (calibratingRef.current && pitch > 0) {
          calibrationSamplesRef.current.push(pitch);
        }

        // Lift: map pitch into the calibrated range.
        const range = calibrationRef.current;
        const span = Math.max(range.high - range.low, 30);

        // Silence drifts to the middle, not to zero.
        //
        // Zero is a real input — it means "singing your lowest note" — so
        // treating silence as zero parked a quiet player on the floor and made
        // any gate above them unwinnable before they had made a sound. Not
        // singing should mean "no instruction", which is the middle.
        const rawLift =
          pitch > 0 ? Math.max(0, Math.min(1, (pitch - range.low) / span)) : NEUTRAL_LIFT;

        // Symmetric smooth transition for both rising and falling pitch
        smoothLiftRef.current =
          smoothLiftRef.current * (1 - SMOOTH_FACTOR) + rawLift * SMOOTH_FACTOR;

        setData({
          pitch: Math.round(pitch),
          volume,
          lift: smoothLiftRef.current,
          isCalibrated: !calibratingRef.current,
          isActive: true,
        });

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);

      // End calibration after 3 seconds.
      calibrationTimerRef.current = setTimeout(() => {
        calibratingRef.current = false;
        const samples = calibrationSamplesRef.current;

        if (samples.length > 4) {
          const sorted = [...samples].sort((a, b) => a - b);
          // Use 10th / 90th percentile to exclude outliers.
          const p10 = sorted[Math.floor(sorted.length * 0.1)];
          const p90 = sorted[Math.floor(sorted.length * 0.9)];

          let low = Math.max(MIN_FREQ, p10 - 20);
          let high = Math.min(MAX_FREQ, p90 + 40);

          // Most people hum one steady note through calibration rather than
          // sweeping their range, which collapses this to a ~90Hz span. The
          // whole screen then maps to less pitch variation than ordinary
          // speech, and the bird slams between the ceiling and the floor.
          // Widen a narrow reading around its own centre so the controls stay
          // usable no matter what the player did during those three seconds.
          if (high - low < MIN_RANGE_HZ) {
            const centre = (low + high) / 2;
            low = Math.max(MIN_FREQ, centre - MIN_RANGE_HZ / 2);
            high = Math.min(MAX_FREQ, centre + MIN_RANGE_HZ / 2);
          }

          calibrationRef.current = { low, high };
        } else {
          // Not enough samples — use sensible defaults.
          calibrationRef.current = { low: 120, high: 340 };
        }

        setData((d) => ({ ...d, isCalibrated: true }));
      }, CALIBRATION_MS);

      return true;
    } catch {
      cleanup();
      return false;
    }
  }, [cleanup]);

  const stopDetection = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Auto-cleanup on unmount.
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    ...data,
    /**
     * The player's measured vocal range.
     *
     * Read live from the ref rather than mirrored into state — the solfège
     * game needs it to choose a tonic each player can actually reach, and a
     * fixed tonic would set a bass and a soprano completely different tasks.
     */
    getRange: () => calibrationRef.current,
    startCalibration,
    stopDetection,
  };
}
