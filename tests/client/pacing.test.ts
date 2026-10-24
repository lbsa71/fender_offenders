import { describe, expect, it } from 'vitest';
import { FIXED_STEP, planFrame } from '../../apps/client/src/pacing';

describe('frame pacing', () => {
  it('runs one fixed step for a 60Hz frame and keeps the sub-step remainder', () => {
    const plan = planFrame(0, FIXED_STEP + .002, 'local');
    expect(plan.steps).toBe(1);
    expect(plan.accumulator).toBeCloseTo(.002, 6);
  });
  it('lets a slow practice frame catch up a full quarter second so the local game keeps real time', () => {
    // A software-rendered runner at ~4 fps must still finish a 3 s countdown in about 3 s, not 11 s.
    const plan = planFrame(0, .25, 'local');
    expect(plan.steps).toBe(15);
    expect(plan.accumulator).toBeCloseTo(0, 6);
  });
  it('discards time while a practice game is paused', () => {
    expect(planFrame(.3, .05, 'paused')).toEqual({ steps: 0, accumulator: 0 });
  });
  it('bounds an online stall to four input ticks per frame so the command queue is never flooded', () => {
    expect(planFrame(0, .25, 'online').steps).toBe(4);
  });
  it('drops backlog beyond a quarter second instead of carrying debt into later frames', () => {
    expect(planFrame(.3, .25, 'online').accumulator).toBe(0);
  });
});
