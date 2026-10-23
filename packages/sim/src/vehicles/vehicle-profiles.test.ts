import { afterEach, beforeAll, expect, it } from 'vitest';
import { GAMEPLAY_REVISION, VEHICLE_BODIES, VEHICLE_PROFILES, getVehicleProfile, neutralActions, type CollisionMap, type DriverActions } from '@fender/contracts';
import { createSimulation, predictVehicle, type Simulation, type SimulationOptions } from '../core/simulation.js';
import { DEFAULT_GAMEPLAY_CONFIG } from '../core/config.js';
import { newDriver } from './controller.js';
import { initPhysics } from '../physics/rapier.js';

const arena: CollisionMap = { id: 'profile-arena', revision: 'profile-arena-1', bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 }, colliders: [], surfaces: [], spawns: [{ id: 'a', pose: { x: 0, z: -1000, yaw: 0 }, clearanceRadius: 5 }, { id: 'b', pose: { x: 0, z: 1000, yaw: Math.PI }, clearanceRadius: 5 }], laneNodes: [], laneEdges: [] };
const simulations: Simulation[] = [];
function simulation(options: SimulationOptions = {}) { const sim = createSimulation(arena, { trafficCount: 0, ...options }); simulations.push(sim); return sim; }
function select(sim: Simulation, playerId: string, bodyId: string): boolean {
  expect(sim).toHaveProperty('setPlayerVehicle', expect.any(Function));
  if (!('setPlayerVehicle' in sim) || typeof sim.setPlayerVehicle !== 'function') return false;
  return sim.setPlayerVehicle(playerId, bodyId);
}
function step(sim: Simulation, entityId: string, sequence: number, actions: Partial<DriverActions> = {}) {
  sim.step(new Map([[entityId, { sessionEpoch: 'test', sourceCommandSequence: sequence, actions: { ...neutralActions(), ...actions } }]]));
}
beforeAll(async () => { await initPhysics(); });
afterEach(() => { for (const sim of simulations.splice(0)) sim.dispose(); });

it('spawns the armored army car and light roadster with their own maximum health', () => {
  const sim = simulation();
  expect(sim.addPlayer({ playerId: 'army', nickname: 'Army', bodyAssetId: 'army' })).toMatchObject({ health: 130, maxHealth: 130 });
  expect(sim.addPlayer({ playerId: 'roadster', nickname: 'Roadster', bodyAssetId: 'roadster' })).toMatchObject({ health: 80, maxHealth: 80 });
});

it('gives the roadster a real straight-line speed advantage over armor', () => {
  const speed = (body: string) => {
    const sim = simulation(), car = sim.addPlayer({ playerId: body, nickname: body, bodyAssetId: body });
    for (let sequence = 0; sequence < 600; sequence++) sim.step(new Map([[car.entityId, { sessionEpoch: 'test', sourceCommandSequence: sequence, actions: { ...neutralActions(), throttle: 1 } }]]));
    const vehicle = sim.authority(body)!.vehicle;
    return Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
  };
  const armored = speed('army'), fast = speed('roadster');
  expect(armored).toBeCloseTo(20, 3); expect(fast).toBeCloseTo(28, 3); expect(fast).toBeGreaterThan(armored);
});

it('uses the shared gameplay revision and scales custom health and handling overrides proportionally', () => {
  expect(DEFAULT_GAMEPLAY_CONFIG.revision).toBe(GAMEPLAY_REVISION);
  const config = { ...DEFAULT_GAMEPLAY_CONFIG, maxHealth: 200, vehicle: { ...DEFAULT_GAMEPLAY_CONFIG.vehicle, topSpeed: 12, acceleration: 9 } };
  const sim = simulation({ config }), car = sim.addPlayer({ playerId: 'scaled', nickname: 'Scaled', bodyAssetId: 'army' });
  expect(car).toMatchObject({ health: 260, maxHealth: 260 });
  for (let sequence = 0; sequence < 600; sequence++) step(sim, car.entityId, sequence, { throttle: 1 });
  expect(sim.authority('scaled')!.vehicle.velocity.z).toBeCloseTo(10, 3);
});

it('preserves scaled armor and body choice through respawn and serialized checkpoints', () => {
  const config = { ...DEFAULT_GAMEPLAY_CONFIG, maxHealth: 200 };
  const sim = simulation({ config }); sim.addPlayer({ playerId: 'scaled', nickname: 'Scaled', bodyAssetId: 'army' });
  const wreck = JSON.parse(JSON.stringify(sim.checkpoint())) as ReturnType<Simulation['checkpoint']>;
  wreck.state.records[0]!.vehicle.status = 'wrecked'; wreck.state.records[0]!.vehicle.health = 0; wreck.state.records[0]!.vehicle.respawnAtTick = 1;
  sim.restore(wreck); sim.step(new Map());
  expect(sim.snapshot().vehicles[0]).toMatchObject({ bodyAssetId: 'army', health: 260, maxHealth: 260, status: 'active', discontinuityId: 1 });
});

it('changes a lobby car without changing identity, score or protection, and rejects live or unknown choices', () => {
  const sim = simulation({ mode: 'multiplayer' });
  const car = sim.addPlayer({ playerId: 'host', nickname: 'Host', bodyAssetId: 'patrol' });
  sim.addPlayer({ playerId: 'guest', nickname: 'Guest' });
  step(sim, car.entityId, 0, { throttle: 1, steer: 1 });
  const original = sim.authority('host')!;
  expect(select(sim, 'host', 'army')).toBe(true);
  const changed = sim.authority('host')!;
  expect(changed.vehicle).toMatchObject({ entityId: car.entityId, bodyAssetId: 'army', health: 130, maxHealth: 130, protectedUntilTick: original.vehicle.protectedUntilTick, discontinuityId: original.vehicle.discontinuityId + 1, velocity: { x: 0, z: 0, yawRate: 0 } });
  expect(changed.vehicle.pose).toEqual(original.vehicle.pose); expect(changed.driver).toEqual(newDriver()); expect(changed.lastConsumedSequence).toBe(original.lastConsumedSequence);
  expect(sim.snapshot().scores[0]!.score).toBe(0); expect(select(sim, 'host', 'untrusted-car')).toBe(false); expect(select(sim, 'missing-player', 'patrol')).toBe(false);
  sim.startRound('host'); expect(select(sim, 'host', 'roadster')).toBe(false);
  const playing = sim.checkpoint(); playing.state.phase = 'playing'; sim.restore(playing);
  expect(select(sim, 'host', 'roadster')).toBe(false);
  const results = sim.checkpoint(); results.state.phase = 'results'; sim.restore(results);
  expect(select(sim, 'host', 'roadster')).toBe(false);
});

it('allows active practice selection but cannot revive a wreck by selecting another car', () => {
  const sim = simulation(), car = sim.addPlayer({ playerId: 'practice', nickname: 'Practice' });
  expect(select(sim, 'practice', 'roadster')).toBe(true);
  const wreck = sim.checkpoint(); wreck.state.records[0]!.vehicle.status = 'wrecked'; wreck.state.records[0]!.vehicle.health = 0; wreck.state.records[0]!.vehicle.respawnAtTick = 180; sim.restore(wreck);
  expect(select(sim, 'practice', 'army')).toBe(false); expect(sim.authority('practice')!.vehicle.status).toBe('wrecked');
  expect(car.entityId).toBe(sim.authority('practice')!.vehicle.entityId);
});

it.each(VEHICLE_BODIES)('keeps %s movement prediction identical to authority with custom tuning', body => {
  const config = { ...DEFAULT_GAMEPLAY_CONFIG, maxHealth: 120, vehicle: { ...DEFAULT_GAMEPLAY_CONFIG.vehicle, topSpeed: 21, acceleration: 15, steeringRate: 1.8, grip: 8 } };
  const sim = simulation({ config }), car = sim.addPlayer({ playerId: body, nickname: body, bodyAssetId: body });
  let predicted = sim.authority(body)!;
  for (let sequence = 0; sequence < 180; sequence++) {
    const actions = { ...neutralActions(), throttle: 1, steer: Math.sin(sequence / 25) * 0.6, handbrake: sequence > 100 && sequence < 120 };
    const next = predictVehicle(arena, predicted.vehicle, predicted.driver, actions, [], config);
    step(sim, car.entityId, sequence, actions); predicted = { ...predicted, ...next };
    expect(next.vehicle).toEqual(sim.authority(body)!.vehicle); expect(next.driver).toEqual(sim.authority(body)!.driver);
  }
});

it('does not apply player body bonuses to traffic or mutate the shared configuration', () => {
  const sim = simulation(), player = sim.addPlayer({ playerId: 'traffic-template', nickname: 'Template', bodyAssetId: 'patrol' });
  const vehicle = { ...player, playerId: null, velocity: { x: 0, z: 0, yawRate: 0 } };
  const config = structuredClone(DEFAULT_GAMEPLAY_CONFIG), initial = structuredClone(config);
  const run = (body: string) => {
    let current: ReturnType<typeof predictVehicle> = { vehicle: { ...vehicle, bodyAssetId: body }, driver: newDriver() };
    for (let tick = 0; tick < 120; tick++) current = predictVehicle(arena, current.vehicle, current.driver, { ...neutralActions(), throttle: 1 }, [], config);
    return current.vehicle;
  };
  expect(run('army').velocity).toEqual(run('roadster').velocity); expect(config).toEqual(initial);
});

it.each(VEHICLE_BODIES)('uses real %s armor for hits to wreck and restores it on respawn', body => {
  const sim = simulation(), shooter = sim.addPlayer({ playerId: 'shooter', nickname: 'Shooter', bodyAssetId: 'patrol' });
  const victim = sim.addPlayer({ playerId: 'victim', nickname: 'Victim', bodyAssetId: body });
  const fixture = sim.checkpoint();
  fixture.state.records[0]!.vehicle.pose = { x: 0, z: -10, yaw: 0 }; fixture.state.records[1]!.vehicle.pose = { x: 0, z: 10, yaw: 0 };
  for (const record of fixture.state.records) record.vehicle.protectedUntilTick = 0;
  sim.restore(fixture);
  const hits: { damage: number; tick: number }[] = [];
  for (let sequence = 0; sequence < 240 && sim.authority('victim')!.vehicle.status === 'active'; sequence++) {
    step(sim, shooter.entityId, sequence, { fire: true });
    for (const event of sim.drainEvents()) if (event.kind === 'hit' && event.payload.targetId === victim.entityId) hits.push({ damage: event.payload.damage, tick: event.serverTick });
  }
  const hitBudgets = { patrol: 10, interceptor: 9, roadster: 8, army: 13, ambulance: 11, 'fire-chief': 10 };
  const expectedHits = hitBudgets[body];
  expect(hits).toHaveLength(expectedHits); expect(hits.every(hit => hit.damage === 10)).toBe(true);
  expect(hits.at(-1)!.tick - hits[0]!.tick).toBe((expectedHits - 1) * 12);
  expect(sim.snapshot().scores.find(s => s.playerId === 'shooter')!.score).toBe(1);
  for (let tick = 0; tick < 180; tick++) sim.step(new Map());
  expect(sim.authority('victim')!.vehicle).toMatchObject({ status: 'active', health: getVehicleProfile(body).maxHealth, maxHealth: getVehicleProfile(body).maxHealth, discontinuityId: 1 });
  expect(sim.authority('victim')!.vehicle.protectedUntilTick).toBeGreaterThan(sim.snapshot().serverTick);
});

it.each(VEHICLE_BODIES)('keeps %s weapon damage, fire cadence and spawn-protection duration equal', body => {
  const sim = simulation(), shooter = sim.addPlayer({ playerId: 'shooter', nickname: 'Shooter', bodyAssetId: body });
  sim.addPlayer({ playerId: 'victim', nickname: 'Victim', bodyAssetId: 'patrol' });
  expect(shooter.protectedUntilTick).toBe(120);
  const fixture = sim.checkpoint(); fixture.state.records[0]!.vehicle.pose = { x: 0, z: -10, yaw: 0 }; fixture.state.records[1]!.vehicle.pose = { x: 0, z: 10, yaw: 0 };
  fixture.state.records[1]!.vehicle.protectedUntilTick = 0; sim.restore(fixture);
  for (let sequence = 0; sequence < 48; sequence++) step(sim, shooter.entityId, sequence, { fire: true });
  const events = sim.drainEvents(), shots = events.filter(e => e.kind === 'shot');
  expect(shots.map(e => e.serverTick)).toEqual([1, 13, 25, 37]);
  expect(events.filter(e => e.kind === 'hit').every(e => e.payload.damage === 10)).toBe(true);
  expect(sim.authority('victim')!.vehicle.health).toBe(70);
  expect(sim.authority('shooter')!.vehicle.protectedUntilTick).toBeLessThanOrEqual(sim.snapshot().serverTick);
});

it.each(VEHICLE_BODIES)('replays %s health, controller and combat state identically from checkpoints', body => {
  const sim = simulation(), car = sim.addPlayer({ playerId: body, nickname: body, bodyAssetId: body });
  const checkpoint = sim.checkpoint();
  const run = () => {
    for (let sequence = 0; sequence < 120; sequence++) step(sim, car.entityId, sequence, { throttle: 1, steer: 0.3, fire: true });
    return { state: sim.snapshot(body), events: sim.drainEvents() };
  };
  const first = run(); sim.restore(checkpoint); expect(run()).toEqual(first);
});

it('gives every profile a tradeoff and a bounded explicit weighted balance budget', () => {
  const profiles = Object.values(VEHICLE_PROFILES), stats = ['maxHealth', 'topSpeed', 'acceleration', 'steeringRate', 'grip'] as const;
  for (const profile of profiles) {
    for (const rival of profiles) if (profile !== rival) expect(stats.every(key => profile[key] >= rival[key]) && stats.some(key => profile[key] > rival[key]), `${profile.id} must not dominate ${rival.id} in every stat`).toBe(false);
    const baseline = getVehicleProfile('patrol');
    const effectiveHealth = Math.ceil(profile.maxHealth / 10) * 10;
    const budget = 0.35 * effectiveHealth / baseline.maxHealth + 0.25 * profile.topSpeed / baseline.topSpeed + 0.2 * profile.acceleration / baseline.acceleration + 0.1 * profile.steeringRate / baseline.steeringRate + 0.1 * profile.grip / baseline.grip;
    expect(budget, `${profile.id} explicit budget`).toBeGreaterThanOrEqual(0.98); expect(budget).toBeLessThanOrEqual(1.02);
  }
});

it('makes light cars accelerate faster and the ambulance turn tighter than armor in real driving', () => {
  const drive = (body: string, ticks: number, actions: Partial<DriverActions>, initialSpeed = 0) => {
    const sim = simulation(), car = sim.addPlayer({ playerId: body, nickname: body, bodyAssetId: body });
    if (initialSpeed) { const initial = sim.checkpoint(); initial.state.records[0]!.vehicle.velocity.z = initialSpeed; sim.restore(initial); }
    for (let sequence = 0; sequence < ticks; sequence++) step(sim, car.entityId, sequence, actions);
    return sim.authority(body)!.vehicle;
  };
  expect(drive('roadster', 60, { throttle: 1 }).velocity.z).toBeGreaterThan(drive('army', 60, { throttle: 1 }).velocity.z * 1.4);
  const tight = drive('ambulance', 30, { steer: 1 }, 12), broad = drive('army', 30, { steer: 1 }, 12);
  expect(tight.pose.yaw).toBeGreaterThan(broad.pose.yaw + 0.05);
});

it('gives the fire chief more lateral recovery grip than a roadster after the same impact', () => {
  const recovery = (body: string) => {
    const sim = simulation(), car = sim.addPlayer({ playerId: body, nickname: body, bodyAssetId: body });
    const impact = sim.checkpoint(); impact.state.records[0]!.vehicle.velocity = { x: 6, z: 12, yawRate: 0 }; sim.restore(impact);
    for (let sequence = 0; sequence < 12; sequence++) step(sim, car.entityId, sequence);
    return sim.authority(body)!.vehicle.velocity.x;
  };
  expect(recovery('fire-chief')).toBeLessThan(recovery('roadster') * 0.8);
});

it('makes the fire chief give up common-speed steering response for its acceleration and grip', () => {
  const turn = (body: string) => {
    const sim = simulation(), car = sim.addPlayer({ playerId: body, nickname: body, bodyAssetId: body });
    const initial = sim.checkpoint(); initial.state.records[0]!.vehicle.velocity.z = 12; sim.restore(initial);
    for (let sequence = 0; sequence < 30; sequence++) step(sim, car.entityId, sequence, { steer: 1 });
    return sim.authority(body)!.vehicle.pose.yaw;
  };
  expect(turn('fire-chief')).toBeLessThan(turn('patrol') - 0.02);
});
