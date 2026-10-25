import { afterEach, beforeAll, expect, it } from 'vitest';
import { neutralActions, VEHICLE_BODIES, type CollisionMap, type DriverActions } from '@fender/contracts';
import { createSimulation, predictVehicle, type Simulation } from '../core/simulation';
import { initPhysics } from '../physics/rapier';

const map: CollisionMap = { id: 'recoil-arena', revision: 'recoil-arena-1', bounds: { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 }, colliders: [], surfaces: [], spawns: [{ id: 'a', pose: { x: 0, z: 0, yaw: 0 }, clearanceRadius: 5 }], laneNodes: [], laneEdges: [] };
const sims: Simulation[] = [];
function setup(speed = 20, body = 'patrol') {
  const sim = createSimulation(map, { trafficCount: 0 }); sims.push(sim);
  const car = sim.addPlayer({ playerId: 'officer', nickname: 'Recoil officer', sessionEpoch: 'recoil', bodyAssetId: body });
  const c = sim.checkpoint(); c.state.records[0]!.vehicle.velocity.z = speed; c.state.records[0]!.vehicle.protectedUntilTick = 0; sim.restore(c);
  let sequence = 0;
  const step = (actions: Partial<DriverActions> = {}) => sim.step(new Map([[car.entityId, { actions: { ...neutralActions(), ...actions }, sessionEpoch: 'recoil', sourceCommandSequence: sequence++ }]]));
  return { sim, step, state: () => sim.authority('officer')! };
}
beforeAll(initPhysics); afterEach(() => sims.splice(0).forEach(s => s.dispose()));

it('delivers one noticeable speed loss per accepted paired volley, with no second kick during cooldown', () => {
  const shot = setup(), coast = setup(); shot.step({ fire: true }); coast.step();
  const loss = coast.state().vehicle.velocity.z - shot.state().vehicle.velocity.z;
  expect(loss).toBeGreaterThanOrEqual(2.5); expect(loss).toBeLessThanOrEqual(4);
  expect(shot.sim.drainEvents().filter(e => e.kind === 'shot')).toHaveLength(1);
  const saved = shot.sim.checkpoint(); shot.step({ fire: true }); const held = shot.state();
  shot.sim.restore(saved); shot.step(); expect(shot.state().vehicle).toEqual(held.vehicle); expect(shot.state().driver).toEqual(held.driver);
});
it.each(VEHICLE_BODIES)('makes sustained %s fire a meaningful straight-line speed tradeoff', body => {
  const firing = setup(0, body), clean = setup(0, body); const samples: number[] = [], cleanSamples: number[] = [];
  for (let i = 0; i < 600; i++) {
    firing.step({ throttle: 1, fire: i >= 180 }); clean.step({ throttle: 1 });
    if (i >= 480) { samples.push(firing.state().vehicle.velocity.z); cleanSamples.push(clean.state().vehicle.velocity.z); }
  }
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  expect(mean(samples)).toBeLessThan(mean(cleanSamples) * .85);
  expect(mean(samples)).toBeGreaterThan(4);
});
it('reduces common-speed steering after repeated shots and restores it after releasing fire', () => {
  const hot = setup(), cold = setup(); for (let i = 0; i < 120; i++) hot.step({ fire: true });
  const turn = (f: ReturnType<typeof setup>) => {
    const c = f.sim.checkpoint(), r = c.state.records[0]!; r.vehicle.pose = { x: 0, z: 0, yaw: 0 }; r.vehicle.velocity = { x: 0, z: 12, yawRate: 0 }; r.driver.resolvedSteering = 0; f.sim.restore(c);
    for (let i = 0; i < 18; i++) f.step({ steer: .5 }); return f.state().vehicle.pose.yaw;
  };
  const baseline = turn(cold); expect(turn(hot)).toBeLessThan(baseline * .85);
  for (let i = 0; i < 120; i++) hot.step(); expect(turn(hot)).toBeCloseTo(baseline, 8);
});
it('does not propel a parked or reversing car with its gun', () => {
  for (const speed of [0, -5]) { const shot = setup(speed), coast = setup(speed); shot.step({ fire: true }); coast.step(); expect(shot.state().vehicle.velocity).toEqual(coast.state().vehicle.velocity); }
});
it('clears accumulated handling recoil on a real respawn', () => {
  const f = setup(); for (let i = 0; i < 120; i++) f.step({ fire: true });
  expect(f.state().driver.recoilStrength).toBeGreaterThan(.8);
  const c = f.sim.checkpoint(), r = c.state.records[0]!; r.vehicle.status = 'wrecked'; r.vehicle.health = 0; r.vehicle.respawnAtTick = c.tick + 1;
  f.sim.restore(c); f.step(); expect(f.state().vehicle.status).toBe('active'); expect(f.state().driver.recoilStrength).toBe(0);
});
it('does not penalize a rejected volley at the projectile cap or a non-playing phase', () => {
  for (const blocked of ['capacity', 'countdown'] as const) {
    const f = setup(), c = f.sim.checkpoint();
    if (blocked === 'capacity') c.state.projectiles = Array.from({ length: 255 }, (_, i) => ({ entityId: `full-${i}`, ownerEntityId: 'other', pose: { x: 5000, z: 5000, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 }, bornTick: 0, expiresTick: 1000, sourceCommandSequence: i, sourceShotOrdinal: i }));
    else { c.state.phase = 'countdown'; c.state.phaseEnd = 100; }
    f.sim.restore(c); f.step({ fire: true }); const requested = f.state(); expect(f.sim.drainEvents().filter(e => e.kind === 'shot')).toHaveLength(0);
    f.sim.restore(c); f.step(); expect(f.state().vehicle).toEqual(requested.vehicle); expect(f.state().driver).toEqual(requested.driver);
  }
});
it.each(VEHICLE_BODIES)('predicts %s recoil/cadence exactly and replays its recovery from a checkpoint', body => {
  const f = setup(20, body); let predicted = f.state();
  for (let i = 0; i < 90; i++) {
    const actions = { ...neutralActions(), throttle: 1, steer: .25, fire: i % 40 < 25 };
    const next = predictVehicle(map, predicted.vehicle, predicted.driver, actions);
    predicted = { ...predicted, ...next }; f.step(actions);
    expect(predicted.vehicle).toEqual(f.state().vehicle); expect(predicted.driver).toEqual(f.state().driver);
  }
  const saved = f.sim.checkpoint(), run = () => { for (let i = 0; i < 120; i++) f.step({ throttle: 1, steer: .3, fire: i < 24 }); return { vehicle: f.state().vehicle, driver: f.state().driver, events: f.sim.drainEvents().map(e => ({ kind: e.kind, payload: e.kind === 'shot' ? e.payload.origins : e.payload })) }; };
  f.sim.drainEvents(); const first = run(); f.sim.restore(saved); expect(run()).toEqual(first);
});
