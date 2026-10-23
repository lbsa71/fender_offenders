import { describe, expect, it } from 'vitest';
import type { CollisionMap, GameEvent, ProjectileState, VehicleState, WorldSnapshot } from '@fender/contracts';
import { ProjectilePresentation } from './projectile-presentation';

const map: CollisionMap = { id: 'projectile-fixture', revision: 'test', bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, colliders: [], surfaces: [], spawns: [], laneNodes: [], laneEdges: [] };
const projectile = (id = 'left', overrides: Partial<ProjectileState> = {}): ProjectileState => ({ entityId: id, ownerEntityId: 'local', pose: { x: -.63, z: 3.6166666667, yaw: 0 }, velocity: { x: 0, z: 70, yawRate: 0 }, bornTick: 100, expiresTick: 139, sourceCommandSequence: 10, sourceShotOrdinal: 1, volleyId: 'volley-1', barrelIndex: id === 'left' ? 0 : 1, damage: 5, ...overrides });
function snapshot(tick: number, projectiles: ProjectileState[], options: { match?: string; epoch?: string; life?: number } = {}): WorldSnapshot {
  const vehicle: VehicleState = { entityId: 'local', playerId: 'player', bodyAssetId: 'roadster', pose: { x: 0, z: 0, yaw: 0 }, velocity: { x: 0, z: 28, yawRate: 0 }, health: 80, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: options.life ?? 0 };
  return { protocolVersion: 1, mapRevision: 'test', gameplayRevision: 'test', sessionEpoch: options.epoch ?? 'epoch', serverTick: tick, matchId: options.match ?? 'match', phase: 'playing', phaseEndsAtTick: null, projectiles, vehicles: [vehicle], scores: [], local: { vehicle, driver: { resolvedSteering: 0, reverseHoldTicks: 0, nextFireTick: 0, shotOrdinal: 1, nextRecoveryTick: 0, lastDamageTick: null }, lastConsumedSequence: 10 } };
}
function impact(id: string, matchId = 'match', kind: 'hit' | 'projectile-impact' = 'projectile-impact'): GameEvent {
  const common = { eventId: `impact-${id}`, matchId, serverTick: 101 };
  return kind === 'hit' ? { ...common, kind, payload: { projectileId: id, targetId: 'other', damage: 5, position: { x: 0, z: 4, yaw: 0 } } } : { ...common, kind, payload: { projectileId: id, ownerEntityId: 'local', position: { x: 0, z: 4, yaw: 0 } } };
}

describe('projectile presentation clocks and authority boundaries', () => {
  it('advances both local barrels by at most 100ms, preserves metadata, and leaves authority untouched', () => {
    const source = snapshot(100, [projectile(), projectile('right', { pose: { x: .63, z: 3.6166666667, yaw: 0 } })]);
    const original = structuredClone(source), presentation = new ProjectilePresentation(map); presentation.receive(source);
    const pair = presentation.sample('local', 109, 103);
    expect(pair).toHaveLength(2);
    expect(pair.map(p => p.pose.z)).toEqual([expect.closeTo(10.6166666667), expect.closeTo(10.6166666667)]);
    expect(pair.map(p => [p.entityId, p.volleyId, p.barrelIndex, p.damage])).toEqual([['left', 'volley-1', 0, 5], ['right', 'volley-1', 1, 5]]);
    expect(pair[0]!.velocity).toEqual(source.projectiles[0]!.velocity);
    expect(pair[0]!.presentationAgeSeconds).toBeCloseTo(7 / 60);
    pair[0]!.pose.x = 99; expect(source).toEqual(original);
  });

  it('never rotates or homes an existing shot when its shooter turns, nor rewinds it on delayed snapshots', () => {
    const p = new ProjectilePresentation(map); p.receive(snapshot(100, [projectile()]));
    const first = p.sample('local', 106, 100)[0]!; expect(first.pose.z).toBeCloseTo(10.6166666667);
    // Wire rounding can put the new authority anchor slightly behind the old projected line.
    const delayed = snapshot(103, [projectile('left', { pose: { x: -.63, z: 7.1066666667, yaw: 0 } })]);
    delayed.vehicles[0]!.pose.yaw = Math.PI / 2; p.receive(delayed);
    const after = p.sample('local', 104, 100)[0]!;
    expect(after.pose.z).toBeGreaterThanOrEqual(first.pose.z);
    expect(after.pose.x).toBe(first.pose.x); expect(after.pose.yaw).toBe(0); expect(after.velocity).toEqual(first.velocity);
  });

  it('interpolates remote shots on the buffered clock and back-samples a newly born pair', () => {
    const p = new ProjectilePresentation(map); p.receive(snapshot(100, []));
    const shot = projectile('left', { ownerEntityId: 'remote', bornTick: 103, pose: { x: -.63, z: 7.1166666667, yaw: 0 } });
    p.receive(snapshot(106, [shot, { ...shot, entityId: 'right', barrelIndex: 1, pose: { ...shot.pose, x: .63 } }]));
    expect(p.sample('local', 106, 102)).toEqual([]);
    const born = p.sample('local', 107, 104); expect(born).toHaveLength(2);
    expect(born[0]!.pose.z).toBeCloseTo(4.7833333334); expect(born[0]!.presentationAgeSeconds).toBeCloseTo(2 / 60);
    p.receive(snapshot(112, [{ ...shot, pose: { ...shot.pose, z: 14.1166666667 } }]));
    expect(p.sample('local', 112, 109)[0]!.pose.z).toBeCloseTo(10.6166666667);
  });

  it('bounds remote extrapolation and expires shots on the unclamped target clock', () => {
    const p = new ProjectilePresentation(map); p.receive(snapshot(100, [projectile('left', { ownerEntityId: 'remote' })]));
    expect(p.sample('local', 120, 120)[0]!.pose.z).toBeCloseTo(10.6166666667);
    expect(p.sample('local', 140, 140)).toEqual([]);
  });

  it('does not resurrect an expired shot when a later snapshot lowers the estimated clock', () => {
    const p = new ProjectilePresentation(map); p.receive(snapshot(130, [projectile()]));
    expect(p.sample('local', 140, 140)).toEqual([]);
    p.receive(snapshot(132, [projectile()])); expect(p.sample('local', 135, 135)).toEqual([]);
  });

  it('does not show local or remote shots before birth and honors current authoritative removal', () => {
    const p = new ProjectilePresentation(map); p.receive(snapshot(100, [projectile('left', { bornTick: 103 })]));
    expect(p.sample('local', 102, 102)).toEqual([]);
    p.receive(snapshot(106, [])); expect(p.sample(null, 106, 100)).toEqual([]);
  });

  it.each(['hit', 'projectile-impact'] as const)('retires %s before a stale snapshot can render it, including events before the first snapshot', kind => {
    const p = new ProjectilePresentation(map); p.present([impact('left', 'match', kind)]); p.receive(snapshot(100, [projectile()]));
    expect(p.sample('local', 100, 100)).toEqual([]);
    p.receive(snapshot(103, [projectile()]), true); expect(p.sample('local', 103, 103)).toEqual([]);
  });

  it('does not let old-match events retire new-match shots and resets on new epochs or explicit reuse', () => {
    const p = new ProjectilePresentation(map); p.receive(snapshot(100, [projectile()])); p.present([impact('left')]);
    p.receive(snapshot(100, [projectile()], { match: 'next' })); p.present([impact('left')]);
    expect(p.sample('local', 100, 100)).toHaveLength(1);
    p.present([impact('left', 'next')]); p.receive(snapshot(100, [projectile()], { match: 'next', epoch: 'new' }));
    expect(p.sample('local', 100, 100)).toHaveLength(1);
    p.reset(); expect(p.sample('local', 100, 100)).toEqual([]);
    p.receive(snapshot(100, [projectile()])); expect(p.sample('local', 100, 100)).toHaveLength(1);
    p.dispose(); p.receive(snapshot(100, [projectile()])); expect(p.sample('local', 100, 100)).toEqual([]);
  });

  it('resets projection progress on the local life changing while preserving retired IDs across resync', () => {
    const p = new ProjectilePresentation(map); p.receive(snapshot(100, [projectile(), projectile('right')])); p.sample('local', 106, 106);
    p.present([impact('right')]); p.receive(snapshot(101, [projectile(), projectile('right')], { life: 1 }), true);
    const sampled = p.sample('local', 101, 101); expect(sampled).toHaveLength(1); expect(sampled[0]!.pose.z).toBeCloseTo(3.6166666667);
  });

  it('accepts a lower tick in a new epoch without keeping the old presentation floor or retirement', () => {
    const p = new ProjectilePresentation(map); p.receive(snapshot(110, [projectile()])); p.present([impact('left')]);
    p.receive(snapshot(100, [projectile()], { epoch: 'reconnected' }));
    const shots = p.sample('local', 100, 100); expect(shots).toHaveLength(1); expect(shots[0]!.pose.z).toBeCloseTo(3.6166666667);
  });

  it('ignores out-of-order snapshots after a long stream without losing authoritative absence', () => {
    const p = new ProjectilePresentation(map); for (let tick = 100; tick < 150; tick++) p.receive(snapshot(tick, []));
    p.receive(snapshot(140, [projectile('left', { bornTick: 140, expiresTick: 200 })])); expect(p.sample('local', 149, 149)).toEqual([]);
  });
});

describe('projection cannot pass solid map geometry', () => {
  const box = (yaw = 0): CollisionMap['colliders'][number] => ({ id: 'wall', shape: 'box', pose: { x: 0, z: 5, yaw }, halfExtents: { x: 2, y: 2, z: .5 }, layer: 'world-solid', surface: 'asphalt' });
  it.each([0, Math.PI / 4])('clips before a wall at yaw %s instead of teleporting through it', yaw => {
    const p = new ProjectilePresentation({ ...map, colliders: [box(yaw)] }); p.receive(snapshot(100, [projectile()]));
    const shot = p.sample('local', 106, 100)[0]!; expect(shot.pose.z).toBeLessThan(5); expect(shot.pose.z).toBeGreaterThan(4);
  });
  it('hides a shot whose authoritative start is inside a solid and ignores non-solid geometry', () => {
    const p = new ProjectilePresentation({ ...map, colliders: [box()] }); p.receive(snapshot(100, [projectile('left', { pose: { x: 0, z: 5, yaw: 0 } })]));
    expect(p.sample('local', 100, 100)).toEqual([]);
    const sensor = new ProjectilePresentation({ ...map, colliders: [{ ...box(), layer: 'sensor' }] }); sensor.receive(snapshot(100, [projectile()]));
    expect(sensor.sample('local', 106, 100)[0]!.pose.z).toBeGreaterThan(10);
  });
  it('clips rotated convex hulls with duplicated top/bottom vertices', () => {
    const vertices = [-2, -2, -.5, 2, -2, -.5, 2, -2, .5, -2, -2, .5, -2, 2, -.5, 2, 2, -.5, 2, 2, .5, -2, 2, .5];
    const p = new ProjectilePresentation({ ...map, colliders: [{ id: 'convex-wall', shape: 'convex', vertices, pose: { x: 0, z: 5, yaw: Math.PI / 4 }, layer: 'world-solid', surface: 'asphalt' }] }); p.receive(snapshot(100, [projectile()]));
    const z = p.sample('local', 106, 100)[0]!.pose.z; expect(z).toBeLessThan(5); expect(z).toBeGreaterThan(4);
  });
});
