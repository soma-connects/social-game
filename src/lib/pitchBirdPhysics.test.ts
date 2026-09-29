import { describe, expect, it } from 'vitest';
import { BirdBody, BirdBounds, stepBird } from './pitchBirdPhysics';

const bounds: BirdBounds = { lowY: 418, highY: 82, minY: 22, maxY: 478 };

function fly(start: BirdBody, frames: number, liftAt: (frame: number) => number) {
  const ys: number[] = [];
  let body = start;
  let floorFrames = 0;
  for (let i = 0; i < frames; i++) {
    const step = stepBird(body, liftAt(i), bounds);
    body = step.body;
    if (step.onFloor) floorFrames++;
    ys.push(body.y);
  }
  return { ys, body, floorFrames };
}

const targetFor = (lift: number) => bounds.lowY - lift * (bounds.lowY - bounds.highY);

describe('going to a note', () => {
  it('arrives quickly without bouncing past it', () => {
    const start = { y: targetFor(0.1), vy: 0 };
    const goal = targetFor(0.8);
    const travel = start.y - goal;
    const { ys } = fly(start, 120, () => 0.8);

    // Overshoot: how far above the goal the bird ever got, as a share of the trip.
    const overshoot = (goal - Math.min(...ys)) / travel;
    expect(overshoot).toBeLessThan(0.1);
    // And it has settled on the note well within a second.
    expect(Math.abs(ys[45] - goal)).toBeLessThan(travel * 0.05);
  });

  it('sits still on a held note', () => {
    const goal = targetFor(0.5);
    const { ys } = fly({ y: goal, vy: 0 }, 120, () => 0.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });

  it('moves only a little when the note wobbles a little', () => {
    const wobble = (i: number) => 0.5 + (i % 2 === 0 ? 0.05 : -0.05);
    const { ys } = fly({ y: targetFor(0.5), vy: 0 }, 240, wobble);
    // The input swings about 34 px; the bird swings a fraction of that.
    expect(Math.max(...ys.slice(60)) - Math.min(...ys.slice(60))).toBeLessThan(10);
  });

  it('does not amplify the slow wander of a real voice', () => {
    // A held note drifts a few times a second. The old spring resonated near
    // three cycles a second, so a 34 px wander in the pitch became a swing of
    // over 50 px in the bird - louder than the voice that caused it.
    const wander = (i: number) => 0.5 + 0.05 * Math.sin((i * 2 * Math.PI) / 20);
    const { ys } = fly({ y: targetFor(0.5), vy: 0 }, 300, wander);
    const swing = Math.max(...ys.slice(100)) - Math.min(...ys.slice(100));
    const inputSwing = 2 * 0.05 * (bounds.lowY - bounds.highY);
    expect(swing).toBeLessThan(inputSwing * 0.5);
  });

  it('never moves faster than the speed limit', () => {
    let body: BirdBody = { y: bounds.maxY, vy: 0 };
    let fastest = 0;
    for (let i = 0; i < 60; i++) {
      const before = body.y;
      body = stepBird(body, 1, bounds).body;
      fastest = Math.max(fastest, Math.abs(body.y - before));
    }
    expect(fastest).toBeLessThanOrEqual(6);
  });
});

describe('the voice stopping', () => {
  it('lets the bird fall, but not like a stone', () => {
    const { ys } = fly({ y: bounds.highY, vy: 0 }, 300, () => 0);
    const framesToFloor = ys.findIndex((y) => y >= bounds.maxY);
    // A full drop takes between about one and three seconds: long enough to
    // start singing again, short enough that silence has a cost.
    expect(framesToFloor).toBeGreaterThan(60);
    expect(framesToFloor).toBeLessThan(180);
  });

  it('rests on the floor and reports it', () => {
    const { body, floorFrames } = fly({ y: bounds.highY, vy: 0 }, 300, () => 0);
    expect(body.y).toBe(bounds.maxY);
    expect(floorFrames).toBeGreaterThan(50);
  });

  it('cannot leave the top of the screen either', () => {
    const { ys } = fly({ y: bounds.minY + 2, vy: -6 }, 30, () => 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(bounds.minY);
  });
});
