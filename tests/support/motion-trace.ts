export interface MotionSample { at: number; sampleAt: number; z: number; ack: number; pending: number }
export interface ContactSample { at: number; z: number; velocity: number; contactZ: number }

export function maxUnexplainedBackstep(frames: readonly ContactSample[]) {
  return Math.max(0, ...frames.slice(1).map((frame, i) => {
    const before = frames[i]!, dt = Math.max(0, (frame.at - before.at) / 1000);
    const physicalReverse = Math.max(0, -(before.velocity + frame.velocity) / 2) * dt;
    const authorizedSeparation = Math.max(0, before.contactZ - frame.contactZ);
    return before.z - frame.z - physicalReverse - authorizedSeparation;
  }));
}

/** The same continuity measurements used by the native browser trace. */
export function summarizeMotion(samples: readonly MotionSample[]) {
  const steps = samples.slice(1).map((sample, index) => ({ dz: sample.z - samples[index]!.z, dt: (sample.sampleAt - samples[index]!.sampleAt) / 1000 })).filter(step => step.dt > 0 && step.dt < .05);
  const stalledFraction = steps.filter(step => step.dz <= .001).length / steps.length;
  const maxBackwards = Math.max(...steps.map(step => -step.dz));
  const speeds = steps.map(step => step.dz / step.dt), meanSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
  const speedVariation = Math.sqrt(speeds.reduce((sum, speed) => sum + (speed - meanSpeed) ** 2, 0) / speeds.length) / meanSpeed;
  const speedJumps = speeds.slice(1).map((speed, index) => Math.abs(speed - speeds[index]!)).sort((a, b) => a - b);
  const p95SpeedJump = speedJumps[Math.floor(speedJumps.length * .95)]!;
  return { steps, stalledFraction, maxBackwards, meanSpeed, speedVariation, p95SpeedJump };
}
