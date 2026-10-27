export const FIXED_STEP = 1 / 60;
export type PacingMode = 'local' | 'online' | 'paused';
export interface FramePlan { steps: number; accumulator: number }
/**
 * Practice runs the authoritative simulation in the browser, so a slow frame must catch up (up to a quarter second)
 * or the whole game, countdown included, runs in slow motion on weak or software-rendered machines.
 * Online only samples input per tick while the server owns the clock; a stall there sends a short bounded burst so
 * the command queue is never flooded, and the rest of the backlog is dropped.
 */
const BUDGET: Record<Exclude<PacingMode, 'paused'>, { frameCap: number; maxSteps: number }> = { local: { frameCap: .25, maxSteps: 15 }, online: { frameCap: .1, maxSteps: 4 } };
/** Fixed-step pacing for one rendered frame: how many simulation ticks to run and the time left over. */
export function planFrame(accumulator: number, frameSeconds: number, mode: PacingMode): FramePlan {
  if (mode === 'paused') return { steps: 0, accumulator: 0 };
  const budget = BUDGET[mode], dt = Math.min(budget.frameCap, Math.max(0, Number.isFinite(frameSeconds) ? frameSeconds : 0));
  let backlog = accumulator + dt, steps = 0;
  while (backlog >= FIXED_STEP && steps < budget.maxSteps) { backlog -= FIXED_STEP; steps++; }
  if (backlog > .25) backlog = 0;
  if (mode === 'online' && backlog >= FIXED_STEP) backlog %= FIXED_STEP;
  return { steps, accumulator: backlog };
}
