import { expect, it } from 'vitest';
import { getDispatchFeatures, neutralActions, type LocalAuthorityState } from '@fender/contracts';
import { districtMap } from '@fender/content';
import { newDriver, predictVehicle } from '@fender/sim';
import { compareSteeringTrace, type SteeringTrace } from '../support/steering-trace';

const initial = (): LocalAuthorityState => ({
  vehicle: { entityId: 'unit', playerId: 'you', bodyAssetId: 'patrol', pose: { x: 0, z: -160, yaw: 0 }, velocity: { x: 0, z: 4, yawRate: .2 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 1 },
  driver: newDriver(), lastConsumedSequence: 0,
});
function scenario(reason: 'resync' | undefined, corrections: number, restored: boolean): SteeringTrace {
  const start = initial(), authority = structuredClone(start);
  authority.vehicle.pose.yaw = 1.2; authority.vehicle.velocity.yawRate = -.7;
  return { initial: start, initialCorrections: 0, commands: [], snapshots: [{ order: 1, at: 10, local: authority, resetReason: reason, corrections }],
    frames: [{ order: 2, at: 11, sampleAt: 10, pose: { yaw: restored ? 1.2 : .002 }, velocity: { yawRate: restored ? -.7 : .2 }, corrections, life: 1, pending: 8 }] };
}
it('still rejects old steering restored by an ordinary acknowledgement', () => {
  const [error] = compareSteeringTrace(scenario(undefined, 0, true), 1);
  expect(error!.rate).toBeGreaterThan(.8); expect(error!.yaw).toBeGreaterThan(1);
});
it('compares a declared full resync against its authoritative baseline', () => {
  expect(compareSteeringTrace(scenario('resync', 1, true), 1)).toEqual([{ yaw: 0, rate: 0, unexpectedCorrections: 0, unexpectedLifeChanges: 0 }]);
});
it('keeps continuous recovery on local physics when no controller reset occurred', () => {
  const [error] = compareSteeringTrace(scenario('resync', 0, false), 1);
  expect(error!.yaw).toBeCloseTo(0, 12); expect(error!.rate).toBe(0); expect(error!.unexpectedCorrections).toBe(0);
});
it('rejects an undeclared controller reset even if the rendered pose happens to match', () => {
  const [error] = compareSteeringTrace(scenario(undefined, 1, false), 1);
  expect(error!.unexpectedCorrections).toBe(1);
});
it('advances real local physics from the full baseline for the next accepted command', () => {
  const trace = scenario('resync', 1, true), command = { sessionEpoch: 'trace', sequence: 1, clientTick: 1, actions: { ...neutralActions(), steer: -.5, throttle: 1 } };
  trace.commands = [{ order: 2, at: 20, logical: 20, command }];
  const authority = trace.snapshots[0]!.local;
  const next = predictVehicle(districtMap, authority.vehicle, authority.driver, command.actions, [], undefined, 1, getDispatchFeatures(0));
  trace.frames = [{ order: 3, at: 21, sampleAt: 20, pose: { yaw: next.vehicle.pose.yaw }, velocity: { yawRate: next.vehicle.velocity.yawRate }, corrections: 1, life: 1, pending: 8 }];
  expect(compareSteeringTrace(trace, 1)).toEqual([{ yaw: 0, rate: 0, unexpectedCorrections: 0, unexpectedLifeChanges: 0 }]);
});
it('uses the actual prediction clock when snapshot observers run later', () => {
  const trace = scenario('resync', 1, true);
  trace.snapshots[0]!.predictionAt = 10; trace.snapshots[0]!.at = 20;
  trace.frames[0]!.at = 31; trace.frames[0]!.sampleAt = 30;
  trace.frames[0]!.pose.yaw = 1.2 - .7 * .02;
  const [error] = compareSteeringTrace(trace, 1);
  expect(error!.yaw).toBeCloseTo(0, 12); expect(error!.rate).toBe(0);
});
it('rejects a life change without a declared controller baseline', () => {
  const trace = scenario(undefined, 0, false); trace.frames[0]!.life = 2;
  expect(compareSteeringTrace(trace, 1)[0]!.unexpectedLifeChanges).toBe(1);
});
it('requires a resynced life to match the explicitly delivered baseline', () => {
  const trace = scenario('resync', 1, true);
  trace.snapshots[0]!.local.vehicle.discontinuityId = 2; trace.frames[0]!.life = 2;
  expect(compareSteeringTrace(trace, 1)[0]!.unexpectedLifeChanges).toBe(0);
  trace.frames[0]!.life = 3;
  expect(compareSteeringTrace(trace, 1)[0]!.unexpectedLifeChanges).toBe(1);
});
