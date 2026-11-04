import { getDispatchFeatures, type InputCommand, type LocalAuthorityState, type WorldSnapshot } from '@fender/contracts';
import { districtMap } from '@fender/content';
import { predictVehicle } from '@fender/sim';

export interface SteeringTrace {
  initial: LocalAuthorityState;
  initialCorrections: number;
  commands: { order: number; at: number; logical: number; command: InputCommand }[];
  snapshots: { order: number; at: number; predictionAt?: number; local: LocalAuthorityState; resetReason?: WorldSnapshot['resetReason']; corrections: number }[];
  frames: { order: number; at: number; sampleAt: number; pose: { yaw: number }; velocity: { yawRate: number }; life: number; pending: number; corrections: number }[];
}

// Ordinary snapshots never replace local steering. Only an explicitly declared
// resync that actually reset the controller establishes a new physics baseline.
export function compareSteeringTrace(trace: SteeringTrace, dispatch: number) {
  let expected = structuredClone(trace.initial), cursor = 0, lastLogical = 0;
  let observedCorrections = trace.initialCorrections, allowedCorrections = trace.initialCorrections;
  const events = [
    ...trace.commands.map(item => ({ kind: 'command' as const, ...item })),
    ...trace.snapshots.map(item => ({ kind: 'snapshot' as const, ...item })),
  ].sort((a, b) => a.order - b.order);
  return trace.frames.map(frame => {
    while (cursor < events.length && events[cursor]!.order < frame.order) {
      const item = events[cursor++]!;
      if (item.kind === 'snapshot') {
        if (item.resetReason === 'resync' && item.corrections === observedCorrections + 1) {
          expected = structuredClone(item.local); lastLogical = item.predictionAt ?? item.at; allowedCorrections++;
        }
        observedCorrections = item.corrections;
      } else {
        expected = { ...expected, ...predictVehicle(districtMap, expected.vehicle, expected.driver, item.command.actions, [], undefined, (expected.driver.simulatedTick ?? 0) + 1, getDispatchFeatures(dispatch - 1)) };
        lastLogical = item.logical;
      }
    }
    const dt = Math.max(0, Math.min(.05, (frame.sampleAt - lastLogical) / 1000));
    return { yaw: Math.abs(Math.atan2(Math.sin(frame.pose.yaw - expected.vehicle.pose.yaw - expected.vehicle.velocity.yawRate * dt), Math.cos(frame.pose.yaw - expected.vehicle.pose.yaw - expected.vehicle.velocity.yawRate * dt))), rate: Math.abs(frame.velocity.yawRate - expected.vehicle.velocity.yawRate), unexpectedCorrections: Math.abs(frame.corrections - allowedCorrections), unexpectedLifeChanges: Number(frame.life !== expected.vehicle.discontinuityId) };
  });
}
