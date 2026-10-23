import { afterEach, beforeAll, expect, it } from 'vitest';
import { neutralActions, type CollisionMap, type PlanarPose, type VehicleState } from '@fender/contracts';
import { createSimulation, type Simulation } from '../core/simulation.js';
import { initPhysics } from '../physics/rapier.js';
import { AIM_ASSIST_LIMITS, selectAssistedYaw } from './aim-assist.js';

const arena = (): CollisionMap => ({ id: 'aim-arena', revision: 'aim-arena-1', bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, colliders: [], surfaces: [], spawns: [{ id: 'south', pose: { x: 0, z: -80, yaw: 0 }, clearanceRadius: 5 }, { id: 'north', pose: { x: 0, z: 80, yaw: 0 }, clearanceRadius: 5 }], laneNodes: [], laneEdges: [] });
const simulations: Simulation[] = [];
function fixture(targetPose: PlanarPose = { x: 1.8, z: 30, yaw: 0 }, map = arena()) {
  const sim = createSimulation(map, { trafficCount: 0 }); simulations.push(sim);
  const shooter = sim.addPlayer({ playerId: 'shooter', nickname: 'Shooter', sessionEpoch: 'test' });
  const target = sim.addPlayer({ playerId: 'target', nickname: 'Target', sessionEpoch: 'test' });
  const initial = sim.checkpoint();
  initial.state.records[0]!.vehicle.pose = { x: 0, z: 0, yaw: 0 }; initial.state.records[1]!.vehicle.pose = targetPose;
  initial.state.records.forEach(record => { record.vehicle.protectedUntilTick = 0; }); sim.restore(initial);
  const fire = () => sim.step(new Map([[shooter.entityId, { actions: { ...neutralActions(), fire: true }, sessionEpoch: 'test', sourceCommandSequence: 0 }]]));
  return { sim, shooter, target, fire };
}
beforeAll(async () => { await initPhysics(); });
afterEach(() => { simulations.splice(0).forEach(sim => sim.dispose()); });

it('corrects the eligible offset barrel near-miss without steering or moving the firing car', () => {
  const { sim, fire } = fixture(); fire();
  for (let tick = 0; tick < 35; tick++) sim.step(new Map());
  expect(sim.authority('target')!.vehicle.health).toBe(95);
  expect(sim.authority('shooter')!.vehicle.pose).toEqual({ x: 0, z: 0, yaw: 0 });
  expect(sim.authority('shooter')!.driver.resolvedSteering).toBe(0);
  const shots = sim.drainEvents().filter(event => event.kind === 'shot');
  expect(shots).toHaveLength(1); expect(shots[0]!.payload.origins![0]!.yaw).toBe(0);expect(shots[0]!.payload.origins![1]!.yaw).toBeCloseTo(Math.atan2(1.8-.63,30-2.45),10);
});

it.each([
  ['outside the four-degree cone', { x: Math.tan(4.1 * Math.PI / 180) * 25, z: 25, yaw: 0 }],
  ['outside the lateral radius of the left muzzle', { x: 2.51-.63, z: 39+2.45, yaw: 0 }],
  ['outside the 40-metre range', { x: 1.8, z: 43, yaw: 0 }],
  ['behind the firing ray', { x: 1.8, z: -30, yaw: 0 }],
] as const)('keeps the original firing direction for a target %s', (_name, pose) => {
  const { sim, fire } = fixture(pose); fire();
  expect(sim.snapshot().projectiles[0]!.pose.yaw).toBe(0);
});

it.each(['protected', 'wrecked', 'civilian', 'fake-suspect'] as const)('does not assist toward a %s car', kind => {
  const { sim, fire } = fixture(); const initial = sim.checkpoint(), vehicle = initial.state.records[1]!.vehicle;
  if (kind === 'protected') vehicle.protectedUntilTick = 120;
  if (kind === 'wrecked') { vehicle.status = 'wrecked'; vehicle.health = 0; }
  if (kind === 'civilian' || kind === 'fake-suspect') { vehicle.playerId = null; vehicle.bodyAssetId = kind === 'civilian' ? 'traffic-sedan' : 'suspect'; }
  sim.restore(initial); fire(); expect(sim.snapshot().projectiles[0]!.pose.yaw).toBe(0);
});

it('allows only the explicitly identified practice pursuit suspect among traffic', () => {
  const { sim, target, fire } = fixture(), initial = sim.checkpoint();
  initial.state.records[1]!.vehicle.playerId = null; initial.state.records[1]!.vehicle.bodyAssetId = 'suspect';
  initial.state.pursuit = { suspectId: target.entityId, state: 'chasing', progress: 0, elapsedTicks: 0 };
  sim.restore(initial); fire(); expect(sim.snapshot().projectiles[1]!.pose.yaw).toBeCloseTo(Math.atan2(1.8-.63,30-2.45),10);
});

it.each([2.3, 15])('does not select through a real Rapier world wall at z=%s', z => {
  const map = arena(); map.colliders.push({ id: 'thin-wall', shape: 'box', pose: { x: 0, z, yaw: 0 }, halfExtents: { x: 4, y: 2, z: 0.05 }, layer: 'world-solid', surface: 'asphalt' });
  const { sim, fire } = fixture(undefined, map); fire();
  expect(sim.drainEvents().find(event => event.kind === 'shot')!.payload).toHaveProperty('origin.yaw', 0);
  for (let tick = 0; tick < 35; tick++) sim.step(new Map());
  expect(sim.authority('target')!.vehicle.health).toBe(100); expect(sim.snapshot().projectiles).toHaveLength(0);
});

it('does not select a far player through a nearer protected civilian car', () => {
  const { sim, fire } = fixture(), blocker = sim.addPlayer({ playerId: 'blocker', nickname: 'Blocker' }), initial = sim.checkpoint();
  const record = initial.state.records.find(record => record.vehicle.entityId === blocker.entityId)!;
  record.vehicle.playerId = null; record.vehicle.bodyAssetId = 'traffic-sedan'; record.vehicle.pose = { x: 0.9, z: 15, yaw: 0 };
  sim.restore(initial); fire(); expect(sim.snapshot().projectiles[0]!.pose.yaw).toBe(0);
});

it('prefers the smallest correction before distance and fixes the projectile direction at firing', () => {
  const { sim, fire } = fixture({ x: .5, z: 30, yaw: 0 }), closer = sim.addPlayer({ playerId: 'closer', nickname: 'Closer' });
  const initial = sim.checkpoint(); const other = initial.state.records.find(record => record.vehicle.entityId === closer.entityId)!;
  other.vehicle.pose = { x: -1.5, z: 20, yaw: 0 }; other.vehicle.protectedUntilTick = 0; sim.restore(initial); fire();
  const projectile = sim.snapshot().projectiles[0]!;
  expect(projectile.pose.yaw).toBeCloseTo(Math.atan2(.5+.63,30-2.45),10);
  const moved = sim.checkpoint(); moved.state.records[1]!.vehicle.pose.x = -10; sim.restore(moved);
  for (let tick = 0; tick < 5; tick++) sim.step(new Map());
  expect(sim.snapshot().projectiles[0]!.velocity).toEqual(projectile.velocity);
  expect(sim.snapshot().projectiles[0]!.pose.yaw).toBe(projectile.pose.yaw);
});

function vehicle(entityId: string, x = 0, z = 0, yaw = 0): VehicleState {
  return { entityId, playerId: entityId, bodyAssetId: 'patrol', pose: { x, z, yaw }, velocity: { x: 0, z: 0, yawRate: 0 }, health: 100, maxHealth: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 };
}

it('breaks equal-angle ties by distance, then stable entity ID independently of input order', () => {
  const shooter = vehicle('shooter'), near = vehicle('near', -1, 15), far = vehicle('far', 2, 30);
  expect(selectAssistedYaw(shooter, [far, near, shooter], 1, () => false)).toBe(Math.atan2(-1, 15));
  const left = vehicle('a', -1.6, 30), right = vehicle('z', 1.6, 30);
  expect(selectAssistedYaw(shooter, [right, left], 1, () => false)).toBe(Math.atan2(-1.6, 30));
  expect(selectAssistedYaw(shooter, [left, right], 1, () => false)).toBe(Math.atan2(-1.6, 30));
});

it('wraps the cone around pi and does not lead moving targets or mutate inputs', () => {
  const shooter = vehicle('shooter', 10, 20, Math.PI - 0.02), yaw = -Math.PI + 0.02;
  const target = vehicle('target', 10 + Math.sin(yaw) * 30, 20 + Math.cos(yaw) * 30);
  target.velocity = { x: 20, z: -10, yawRate: 1 };
  const before = structuredClone([shooter, target]);
  expect(selectAssistedYaw(shooter, [shooter, target], 1, () => false)).toBeCloseTo(yaw, 10);
  expect([shooter, target]).toEqual(before);
});

it('accepts the declared cone, lateral-radius and range boundaries and exact protection expiry', () => {
  const shooter = vehicle('shooter');
  const cone = vehicle('cone', Math.tan(AIM_ASSIST_LIMITS.maxAngleRadians) * 25, 25);
  const radius = vehicle('radius', AIM_ASSIST_LIMITS.lateralRadius, 39);
  const range = vehicle('range', 0, AIM_ASSIST_LIMITS.range); range.protectedUntilTick = 10;
  expect(selectAssistedYaw(shooter, [cone], 1, () => false)).toBeCloseTo(AIM_ASSIST_LIMITS.maxAngleRadians, 10);
  expect(selectAssistedYaw(shooter, [radius], 1, () => false)).toBe(Math.atan2(2.5, 39));
  let inspected = false;
  expect(selectAssistedYaw(shooter, [range], 10, () => { inspected = true; return false; })).toBe(0);
  expect(inspected).toBe(true);
});

it('falls back to a visible alternative when the smaller-angle target is blocked', () => {
  const shooter = vehicle('shooter'), blocked = vehicle('blocked', -1, 30), visible = vehicle('visible', 1.8, 30);
  expect(selectAssistedYaw(shooter, [blocked, visible], 1, (_from, to) => to.x < 0)).toBe(Math.atan2(1.8, 30));
});
