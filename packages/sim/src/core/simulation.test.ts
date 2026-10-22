import { beforeAll, describe, expect, it } from 'vitest';
import { neutralActions, type AppliedDriverInput, type CollisionMap, type DriverActions } from '@fender/contracts';
import { createSimulation, predictVehicle, type Simulation } from './simulation.js';
import { DEFAULT_GAMEPLAY_CONFIG } from './config.js';
import { initPhysics, runPhysicsSpike } from '../physics/rapier.js';
import { newDriver, surfaceAt } from '../vehicles/controller.js';

const map = (): CollisionMap => ({ id: 'test', revision: 'test-1', bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, colliders: [], surfaces: [], spawns: [{ id: 'south', pose: { x: 0, z: -30, yaw: 0 }, clearanceRadius: 5 }, { id: 'north', pose: { x: 0, z: 30, yaw: Math.PI }, clearanceRadius: 5 }], laneNodes: [], laneEdges: [] });
const input = (actions: Partial<DriverActions> = {}, sequence = 0): AppliedDriverInput => ({ actions: { ...neutralActions(), ...actions }, sessionEpoch: 'test', sourceCommandSequence: sequence });
function player(sim: Simulation, id = 'a') { return sim.addPlayer({ playerId: id, nickname: id, sessionEpoch: 'test' }); }
function place(sim: Simulation, poses: Record<string, { x: number; z: number; yaw: number }>) {
  const c = sim.checkpoint();
  for (const r of c.state.records) if (r.vehicle.playerId && poses[r.vehicle.playerId]) { r.vehicle.pose = poses[r.vehicle.playerId]!; r.vehicle.protectedUntilTick = 0; }
  sim.restore(c);
}
beforeAll(async () => { await initPhysics(); });

describe('real Rapier feasibility', () => {
  it('constrains a body to X/Z and yaw, contacts a wall, queries and restores WASM state', async () => {
    expect(await runPhysicsSpike()).toEqual({ planar: true, contact: true, staticQuery: true, restored: true });
  });
});

describe('fixed-step shared simulation', () => {
  it('accelerates along +Z, steers right toward +X and respects top speed', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim);
    for (let i = 0; i < 90; i++) sim.step(new Map([[a.entityId, input({ throttle: 1 }, i)]]));
    const straight = sim.snapshot('a').local!.vehicle;
    expect(straight.pose.z).toBeGreaterThan(-20); expect(Math.abs(straight.pose.x)).toBeLessThan(0.001);
    for (let i = 90; i < 120; i++) sim.step(new Map([[a.entityId, input({ throttle: 1, steer: 1 }, i)]]));
    const turning = sim.snapshot('a').local!.vehicle;
    expect(turning.pose.x).toBeGreaterThan(straight.pose.x); expect(turning.pose.yaw).toBeGreaterThan(0);
    expect(Math.hypot(turning.velocity.x, turning.velocity.z)).toBeLessThanOrEqual(24.001); sim.dispose();
  });
  it('brakes before reversing and requires a deliberate reverse hold', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim);
    for (let i = 0; i < 40; i++) sim.step(new Map([[a.entityId, input({ throttle: 1 }, i)]]));
    sim.step(new Map([[a.entityId, input({ brakeReverse: 1 }, 40)]]));
    expect(sim.snapshot('a').local!.vehicle.velocity.z).toBeGreaterThan(0);
    for (let i = 41; i < 140; i++) sim.step(new Map([[a.entityId, input({ brakeReverse: 1 }, i)]]));
    expect(sim.snapshot('a').local!.vehicle.velocity.z).toBeLessThan(0); sim.dispose();
  });
  it('replays checkpoints including cadence, events, controller timers and identity', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim);
    const c = sim.checkpoint(); const run = () => { for (let i = 0; i < 90; i++) sim.step(new Map([[a.entityId, input({ throttle: 1, steer: 0.2, fire: true }, i)]])); return { state: sim.snapshot('a'), events: sim.drainEvents() }; };
    const first = run(); sim.restore(c); expect(run()).toEqual(first); sim.dispose();
  });
  it('restores predicted vehicle controller state without a stale contact solver', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim);
    const start = sim.authority('a')!;
    const predicted = predictVehicle(map(), start.vehicle, start.driver, { ...neutralActions(), throttle: 1 });
    sim.step(new Map([[a.entityId, input({ throttle: 1 })]]));
    expect(sim.authority('a')!.vehicle).toEqual(predicted.vehicle);
    expect(sim.authority('a')!.driver).toEqual(predicted.driver); sim.dispose();
  });
  it('blocks moving vehicles and fast projectiles on the same static wall', () => {
    const fixture = map(); fixture.colliders.push({ id: 'wall', shape: 'box', pose: { x: 0, z: 0, yaw: 0 }, halfExtents: { x: 20, y: 2, z: 0.1 }, layer: 'world-solid', surface: 'asphalt' });
    const sim = createSimulation(fixture, { trafficCount: 0 }); const a = player(sim); player(sim, 'b');
    place(sim, { a: { x: 0, z: -10, yaw: 0 }, b: { x: 0, z: 10, yaw: Math.PI } });
    for (let i = 0; i < 180; i++) sim.step(new Map([[a.entityId, input({ throttle: 1, fire: true }, i)]]));
    expect(sim.snapshot('a').local!.vehicle.pose.z).toBeLessThan(-2.2);
    expect(sim.authority('b')!.vehicle.health).toBe(100); sim.dispose();
  });
  it('uses the last authored surface overlay', () => {
    const fixture = map(); fixture.surfaces = [{ id: 'grass', polygonXZ: [-50, -50, 50, -50, 50, 50, -50, 50], surface: 'grass' }, { id: 'dirt', polygonXZ: [-10, -10, 10, -10, 10, 10, -10, 10], surface: 'dirt' }];
    expect(surfaceAt(fixture, { x: 0, z: 0 })).toBe('dirt'); expect(surfaceAt(fixture, { x: 30, z: 30 })).toBe('grass');
  });
  it('rejects blocked spawns, invalid geometry and nonfinite tuning', () => {
    const fixture = map(); fixture.spawns[0]!.pose.x = NaN;
    expect(() => createSimulation(fixture, { trafficCount: 0 })).toThrow();
    expect(() => createSimulation(map(), { trafficCount: 0, config: { ...DEFAULT_GAMEPLAY_CONFIG, maxHealth: NaN } })).toThrow();
  });
});

describe('authoritative combat and round rules', () => {
  it('applies one hit per projectile with owner immunity and exact 5 Hz cadence', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim); player(sim, 'b');
    place(sim, { a: { x: 0, z: -10, yaw: 0 }, b: { x: 0, z: 10, yaw: 0 } });
    for (let i = 0; i < 60; i++) sim.step(new Map([[a.entityId, input({ fire: true }, i)]]));
    const events = sim.drainEvents(), hits = events.filter(e => e.kind === 'hit');
    expect(events.filter(e => e.kind === 'shot')).toHaveLength(5);
    expect(new Set(hits.map(e => e.payload.projectileId)).size).toBe(hits.length);
    expect(sim.authority('b')!.vehicle.health).toBe(100 - hits.length * 10);
    expect(sim.authority('a')!.vehicle.health).toBe(100); sim.dispose();
  });
  it('protects a spawn, ends protection on fire, credits one wreck and respawns', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim); const b = player(sim, 'b');
    const c = sim.checkpoint(); c.state.records.find(r => r.vehicle.playerId === 'a')!.vehicle.pose = { x: 0, z: -10, yaw: 0 }; c.state.records.find(r => r.vehicle.playerId === 'b')!.vehicle.pose = { x: 0, z: 10, yaw: 0 }; sim.restore(c);
    for (let i = 0; i < 50; i++) sim.step(new Map([[a.entityId, input({ fire: true }, i)]]));
    expect(sim.authority('b')!.vehicle.health).toBe(100);
    sim.step(new Map([[b.entityId, input({ fire: true }, 0)]])); expect(sim.authority('b')!.vehicle.protectedUntilTick).toBe(51);
    for (let i = 50; i < 185; i++) sim.step(new Map([[a.entityId, input({ fire: true }, i)]]));
    expect(sim.authority('b')!.vehicle.status).toBe('wrecked');
    expect(sim.snapshot().scores.find(s => s.playerId === 'a')!.score).toBe(1);
    expect(sim.drainEvents().filter(e => e.kind === 'wreck')).toHaveLength(1);
    for (let i = 0; i < 180; i++) sim.step(new Map());
    expect(sim.authority('b')!.vehicle.status).toBe('active'); expect(sim.authority('b')!.vehicle.health).toBe(100); expect(sim.authority('b')!.vehicle.discontinuityId).toBe(1); sim.dispose();
  });
  it('deduplicates held command edges while permitting held-fire cadence', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim);
    for (let i = 0; i < 30; i++) sim.step(new Map([[a.entityId, input({ sirenToggle: true, fire: true }, 1)]]));
    expect(sim.authority('a')!.vehicle.sirenOn).toBe(true); expect(sim.drainEvents().filter(e => e.kind === 'shot')).toHaveLength(3); sim.dispose();
  });
  it('ignores unknown vehicles, invalid input and stale one-shot command identities', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim);
    sim.step(new Map([['spoofed-id', input({ throttle: 1, fire: true }, 20)], [a.entityId, input({ sirenToggle: true }, 20)]]));
    sim.step(new Map([[a.entityId, input({ sirenToggle: true, recover: true }, 19)]]));
    expect(sim.authority('a')!.vehicle.sirenOn).toBe(true); expect(sim.authority('a')!.vehicle.discontinuityId).toBe(0);
    sim.step(new Map([[a.entityId, input({ throttle: Number.NaN, fire: true }, 21)]]));
    expect(sim.authority('a')!.lastConsumedSequence).toBe(20); expect(sim.drainEvents().filter(e => e.kind === 'shot')).toHaveLength(0); sim.dispose();
  });
  it('supports eight players, a protected late join and reconnect epoch rebasing', () => {
    const fixture = map(); fixture.spawns = Array.from({ length: 8 }, (_, i) => ({ id: `spawn-${i}`, pose: { x: (i % 4) * 20 - 30, z: Math.floor(i / 4) * 60 - 30, yaw: 0 }, clearanceRadius: 5 }));
    const sim = createSimulation(fixture, { mode: 'multiplayer', trafficCount: 0, config: { ...DEFAULT_GAMEPLAY_CONFIG, countdownSeconds: 0.05 } });
    for (let i = 0; i < 7; i++) player(sim, `p${i}`);
    expect(sim.startRound('p0')).toBe(true); for (let i = 0; i < 3; i++) sim.step(new Map());
    const late = player(sim, 'p7'); expect(sim.snapshot('p7').phase).toBe('playing'); expect(late.protectedUntilTick).toBeGreaterThan(3);
    expect(() => player(sim, 'ninth')).toThrow('Room full');
    sim.step(new Map([[late.entityId, input({ throttle: 1 }, 50)]])); sim.setConnection('p7', 'reconnecting');
    expect(sim.snapshot().scores.find(s => s.playerId === 'p7')!.connection).toBe('reconnecting');
    sim.setConnection('p7', 'connected'); sim.step(new Map([[late.entityId, { ...input({ throttle: 1 }, 0), sessionEpoch: 'new-epoch' }]]));
    expect(sim.snapshot('p7').sessionEpoch).toBe('new-epoch'); expect(sim.authority('p7')!.lastConsumedSequence).toBe(0); expect(sim.snapshot().vehicles).toHaveLength(8); sim.dispose();
  });
  it('runs countdown/results/rematch and transfers creator control after departure', () => {
    const sim = createSimulation(map(), { mode: 'multiplayer', trafficCount: 0, config: { ...DEFAULT_GAMEPLAY_CONFIG, countdownSeconds: 0.05, roundSeconds: 0.1 } });
    player(sim); player(sim, 'b'); expect(sim.startRound('b')).toBe(false); expect(sim.startRound('a')).toBe(true);
    for (let i = 0; i < 3; i++) sim.step(new Map()); expect(sim.snapshot().phase).toBe('playing');
    for (let i = 0; i < 6; i++) sim.step(new Map()); expect(sim.snapshot().phase).toBe('results');
    expect(sim.drainEvents().filter(e => e.kind === 'round-ended')).toHaveLength(1);
    sim.removePlayer('a'); expect(sim.rematch('b')).toBe(true); expect(sim.snapshot().phase).toBe('lobby'); sim.dispose();
  });
  it('does not advance a recovery cooldown or duplicate score when recovering', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim);
    sim.step(new Map([[a.entityId, input({ recover: true }, 0)]]));
    const first = sim.authority('a')!; sim.step(new Map([[a.entityId, input({ recover: true }, 1)]]));
    expect(sim.authority('a')!.vehicle.discontinuityId).toBe(first.vehicle.discontinuityId);
    expect(sim.snapshot().scores[0]!.score).toBe(0); sim.dispose();
  });
  it('allows deterministic simultaneous lethal hits and awards each attacker once', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim), b = player(sim, 'b');
    place(sim, { a: { x: 0, z: -5, yaw: 0 }, b: { x: 0, z: 5, yaw: Math.PI } });
    const c = sim.checkpoint(); for (const r of c.state.records) r.vehicle.health = 10; sim.restore(c);
    sim.step(new Map([[a.entityId, input({ fire: true }, 0)], [b.entityId, input({ fire: true }, 0)]]));
    for (let i = 0; i < 10; i++) sim.step(new Map());
    expect(sim.snapshot().scores.map(s => s.score)).toEqual([1, 1]);
    expect(sim.drainEvents().filter(e => e.kind === 'wreck')).toHaveLength(2); sim.dispose();
  });
  it('delays respawn when all authored spawn clearances are occupied', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); player(sim); player(sim, 'b');
    const c = sim.checkpoint(), a = c.state.records[0]!, b = c.state.records[1]!;
    a.vehicle.pose = { x: 0, z: -30, yaw: 0 };
    b.vehicle.status = 'wrecked'; b.vehicle.health = 0; b.vehicle.respawnAtTick = 1;
    const blocker = structuredClone(a); blocker.vehicle.entityId = 'blocker'; blocker.vehicle.playerId = null; blocker.vehicle.pose = { x: 0, z: 30, yaw: 0 }; c.state.records.push(blocker);
    sim.restore(c); sim.step(new Map());
    expect(sim.authority('b')!.vehicle.status).toBe('respawning'); expect(sim.authority('b')!.vehicle.respawnAtTick).toBe(31); sim.dispose();
  });
  it('admits a waiting participant when temporary traffic occupancy blocks every safe spawn', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); player(sim); player(sim, 'b');
    const joining = player(sim, 'c'); expect(joining.status).toBe('respawning'); expect(sim.snapshot().scores).toHaveLength(3);
    sim.removePlayer('b'); for (let i = 0; i < 30; i++) sim.step(new Map());
    expect(sim.authority('c')!.vehicle.status).toBe('active'); expect(sim.authority('c')!.vehicle.discontinuityId).toBe(1); sim.dispose();
  });
  it('prevents recovery during recent damage and rejects incompatible checkpoints', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim);
    const c = sim.checkpoint(); c.state.records[0]!.driver.lastDamageTick = 0; sim.restore(c);
    sim.step(new Map([[a.entityId, input({ recover: true }, 1)]])); expect(sim.authority('a')!.vehicle.discontinuityId).toBe(0);
    c.mapRevision = 'wrong'; expect(() => sim.restore(c)).toThrow('Incompatible'); sim.dispose();
  });
  it('keeps planar car contacts finite and bounded and respects a time-aligned proxy', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); const a = player(sim); player(sim, 'b');
    place(sim, { a: { x: 0, z: -3, yaw: 0 }, b: { x: 0, z: 3, yaw: Math.PI } });
    for (let i = 0; i < 120; i++) sim.step(new Map([[a.entityId, input({ throttle: 1 }, i)]]));
    for (const v of sim.snapshot().vehicles) { expect(Object.values(v.pose).every(Number.isFinite)).toBe(true); expect(Math.hypot(v.velocity.x, v.velocity.z)).toBeLessThan(30); }
    const authority = sim.authority('a')!, proxy = sim.authority('b')!.vehicle;
    proxy.pose = { ...authority.vehicle.pose, z: authority.vehicle.pose.z + 3 };
    const predicted = predictVehicle(map(), authority.vehicle, newDriver(), neutralActions(), [proxy]);
    expect(Math.abs(predicted.vehicle.pose.z - authority.vehicle.pose.z)).toBeGreaterThan(0.5); sim.dispose();
  });
  it('completes pursuit only after staying close at low relative speed', () => {
    const fixture = map(); fixture.laneNodes = [{ id: 's', x: 20, z: -80 }, { id: 'n', x: 20, z: 80 }]; fixture.laneEdges = [{ from: 's', to: 'n', speedLimit: 0.01 }, { from: 'n', to: 's', speedLimit: 0.01 }];
    const sim = createSimulation(fixture, { trafficCount: 1 }); player(sim);
    const c = sim.checkpoint(), suspect = c.state.records.find(r => r.traffic)!;
    c.state.records.find(r => r.vehicle.playerId === 'a')!.vehicle.pose = { ...suspect.vehicle.pose, x: suspect.vehicle.pose.x + 5 }; sim.restore(c);
    for (let i = 0; i < 180; i++) sim.step(new Map());
    expect(sim.snapshot().pursuit!.state).toBe('complete'); expect(sim.drainEvents().filter(e => e.kind === 'pursuit-complete')).toHaveLength(1); sim.dispose();
  });
  it('retains pursuit identity after a wreck and respawns a distant suspect to resume the chase', () => {
    const fixture = map(); fixture.laneNodes = [{ id: 's', x: 20, z: -80 }, { id: 'n', x: 20, z: 80 }]; fixture.laneEdges = [{ from: 's', to: 'n', speedLimit: 10 }, { from: 'n', to: 's', speedLimit: 10 }];
    const sim = createSimulation(fixture, { trafficCount: 1 }); player(sim);
    const c = sim.checkpoint(), suspect = c.state.records.find(r => r.traffic)!;
    suspect.vehicle.status = 'wrecked'; suspect.vehicle.health = 0; suspect.vehicle.respawnAtTick = 1;
    sim.restore(c); sim.step(new Map());
    const state = sim.snapshot(), restoredSuspect = state.vehicles.find(v => v.entityId === state.pursuit!.suspectId)!;
    expect(restoredSuspect.status).toBe('active'); expect(restoredSuspect.discontinuityId).toBe(1); expect(state.pursuit!.state).toBe('chasing'); sim.dispose();
  });
  it('disposes resources idempotently and rejects subsequent stepping', () => {
    const sim = createSimulation(map(), { trafficCount: 0 }); sim.dispose(); sim.dispose(); expect(() => sim.step(new Map())).toThrow('disposed');
  });
});
