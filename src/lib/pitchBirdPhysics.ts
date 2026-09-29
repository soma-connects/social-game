/**
 * How the bird moves.
 *
 * Pitch commands a target height and the bird is pulled toward it by a damped
 * spring. The numbers matter more than they look. The loop used to hard-code a
 * pull of 0.12 with 0.82 damping, which is a spring that overshoots by around
 * forty percent and rings before it settles: sing a steady note and the bird
 * bobbed around it, and any small change in pitch threw it well past the target.
 * These are set for a damping ratio near 0.7, which arrives promptly with only a
 * few percent overshoot.
 */

/** Pull toward the target height, per frame. */
export const SPRING = 0.05;
/** Velocity kept each frame while singing. */
export const DAMPING = 0.68;
/** Fastest the bird may move, in pixels per frame. */
export const MAX_SPEED = 6;
/** Downward acceleration once the voice has stopped. Gentle, so there is time to sing again. */
export const GRAVITY = 0.35;
/** Velocity kept each frame while falling. */
export const FALL_DRAG = 0.9;
/** Below this height the voice counts as silent and gravity takes over. */
export const SILENCE_LIFT = 0.01;

export type BirdBody = { y: number; vy: number };

export type BirdBounds = {
  /** Height of the lowest point the pitch can command. */
  lowY: number;
  /** Height of the highest point the pitch can command. */
  highY: number;
  /** Top and bottom of the canvas the bird cannot leave. */
  minY: number;
  maxY: number;
};

/** Advances the bird one frame. Returns whether it is resting on the floor. */
export function stepBird(body: BirdBody, lift: number, bounds: BirdBounds): { body: BirdBody; onFloor: boolean } {
  let { y, vy } = body;

  if (lift > SILENCE_LIFT) {
    const targetY = bounds.lowY - lift * (bounds.lowY - bounds.highY);
    vy += (targetY - y) * SPRING;
    vy *= DAMPING;
  } else {
    vy += GRAVITY;
    vy *= FALL_DRAG;
  }

  vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vy));
  y += vy;

  let onFloor = false;
  if (y < bounds.minY) {
    y = bounds.minY;
    vy = 0;
  }
  if (y > bounds.maxY) {
    y = bounds.maxY;
    vy = 0;
    onFloor = true;
  }
  return { body: { y, vy }, onFloor };
}
