import { expect, it } from 'vitest';
import { neutralActions, type ContactAdjustment, type LocalAuthorityState } from '@fender/contracts';
import { districtMap } from '@fender/content';
import { newDriver, predictVehicle } from '@fender/sim';
import { replayContactTrace, type ContactTrace } from '../support/contact-trace';
import { maxUnexplainedBackstep } from '../support/motion-trace';

const adjustment = (revision = 0, z = 0): ContactAdjustment => ({ revision, pose: { x: 0, z, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 } });
const initial = (): LocalAuthorityState => ({ vehicle: { entityId: 'unit', playerId: 'you', bodyAssetId: 'patrol', pose: { x: 0, z: -30, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 1 }, driver: newDriver(), lastConsumedSequence: 0 });
function base(): ContactTrace {
  return { initial: initial(), initialContact: adjustment(), events: [], frames: [{ order: 0, at: 0, predictionAt: 0, proxies: [] }, { order: 2, at: 10, predictionAt: 10, proxies: [] }] };
}
function collision() {
  const trace = base(), proxy = structuredClone(trace.initial.vehicle); proxy.entityId = 'suspect'; proxy.playerId = null; proxy.pose.z = -26.5;
  trace.events = [{ kind: 'prediction', order: 1, actions: neutralActions(), proxies: [proxy], tick: 1 }];
  trace.frames[1]!.proxies = [proxy];
  const result = predictVehicle(districtMap, trace.initial.vehicle, trace.initial.driver, neutralActions(), [proxy], undefined, 1);
  expect(trace.initial.vehicle.pose.z - result.vehicle.pose.z).toBeGreaterThan(.2);
  return { trace, z: result.vehicle.pose.z };
}
it('independently replays local collision separation even when velocity stays zero', () => {
  const { trace, z } = collision();
  expect(replayContactTrace(trace)[1]).toBeCloseTo(z, 10);
});
it('applies each new cumulative authority adjustment once', () => {
  const trace = base(); trace.frames[1]!.order = 3;
  trace.events = [{ kind: 'contact', order: 1, contact: adjustment(1, -.35) }, { kind: 'contact', order: 2, contact: adjustment(1, -.35) }];
  expect(replayContactTrace(trace)[1]).toBeCloseTo(-30.35, 10);
});
it('does not authorize a displacement with an unchanged revision', () => {
  const trace = base(); trace.events = [{ kind: 'contact', order: 1, contact: adjustment(0, -.4) }];
  expect(replayContactTrace(trace)[1]).toBe(-30);
});
it('projects motion on the actual prediction clock between fixed inputs', () => {
  const trace = base(); trace.initial.vehicle.velocity.z = -4;
  trace.frames[1]!.at = 46.8; trace.frames[1]!.predictionAt = 0;
  expect(replayContactTrace(trace)[1]).toBeCloseTo(-30 - 4 * .0468, 10);
});
it('does not call independently replayed collision separation an unexplained jump', () => {
  const { trace, z } = collision(), expected = replayContactTrace(trace);
  expect(maxUnexplainedBackstep([
    { at: 0, z: -30, velocity: 0, contactZ: 0, expectedZ: expected[0] },
    { at: 10, z, velocity: 0, contactZ: 0, expectedZ: expected[1] },
  ])).toBeCloseTo(0, 10);
});
it('still exposes an extra teleport beyond canonical physical separation', () => {
  const { trace, z } = collision(), expected = replayContactTrace(trace);
  expect(maxUnexplainedBackstep([
    { at: 0, z: -30, velocity: 0, contactZ: 0, expectedZ: expected[0] },
    { at: 10, z: z - .4, velocity: 0, contactZ: 0, expectedZ: expected[1] },
  ])).toBeGreaterThan(.2);
});
it('does not excuse an unauthorized shift using unversioned authority metadata', () => {
  const trace = base(); trace.events = [{ kind: 'contact', order: 1, contact: adjustment(0, -.4) }];
  const expected = replayContactTrace(trace);
  expect(maxUnexplainedBackstep([
    { at: 0, z: -30, velocity: 0, contactZ: 0, expectedZ: expected[0] },
    { at: 10, z: -30.4, velocity: 0, contactZ: -.4, expectedZ: expected[1] },
  ])).toBeGreaterThan(.2);
});
