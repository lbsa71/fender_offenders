import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initPhysics } from '@fender/physics';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import type { CollisionMap } from '@fender/contracts';
import { CarFactory } from './cars';
import { WreckEffects } from './wreck-effects';

const arena: CollisionMap = {
  id: 'breakup-arena', revision: 'breakup-1', bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
  colliders: [{ id: 'wall', shape: 'box', pose: { x: 3, z: 0, yaw: 0 }, halfExtents: { x: .15, y: 4, z: 20 }, layer: 'world-solid', surface: 'asphalt' }],
  surfaces: [], spawns: [{ id: 'origin', pose: { x: 0, z: 0, yaw: 0 }, clearanceRadius: 3 }], laneNodes: [], laneEdges: [],
};
const wreck = { vehicleId: 'assembly-car', bodyAssetId: 'ambulance', pose: { x: 0, z: 0, yaw: 0 }, discontinuityId: 3 };
let engine: NullEngine, scene: Scene, factory: CarFactory, effects: WreckEffects;
beforeAll(async () => { await initPhysics(); });
beforeEach(async () => {
  engine = new NullEngine(); scene = new Scene(engine); factory = new CarFactory(scene);
  effects = Reflect.construct(WreckEffects, [scene, factory, arena]);
  await Reflect.get(effects, 'ready');
});
afterEach(() => { effects.dispose(); factory.dispose(); scene.dispose(); engine.dispose(); });
const pieces = () => scene.meshes.filter(mesh => mesh.metadata?.wreckComponent && mesh.isVisible && mesh.isEnabled());
const stats = () => Object.assign({ wreckPieces: 0, wreckBodies: 0, wreckPartCollisions: 0 }, effects.getStats()) as unknown as Record<string, number>;

describe('actual car assembly breakup physics', () => {
  it('applies reduced motion immediately while the local physics world is still initializing', async () => {
    effects.dispose(); effects = new WreckEffects(scene, factory, arena);
    effects.spawn(wreck); effects.update(1 / 60, { reducedMotion: true });
    expect(stats().wreckPieces, 'accessibility changes must not wait for WASM startup').toBe(0);
    await effects.ready;
    expect(stats().wreckBodies).toBe(0);
  });
  it('gives every original car component its own physical fragment, including variant details and guns', () => {
    effects.spawn(wreck); effects.update(1 / 60);
    expect(stats().wreckPieces, 'a complete assembled car must break up, rather than ten generic replacement pieces').toBeGreaterThan(40);
    const parts = (Reflect.get(factory, 'breakupParts') as Function).call(factory, wreck.bodyAssetId, false);
    expect(stats().wreckPieces).toBe(parts.length);
    expect(stats().wreckBodies).toBe(parts.length);
    expect(pieces().map(mesh => mesh.metadata.componentId).sort()).toEqual(parts.map((mesh: any) => mesh.metadata.componentId).sort());
    for (const name of ['medical-box', 'medical-roof-cap', 'gun', 'hub', 'mirror']) expect(pieces().some(mesh => mesh.metadata.componentName === name), name).toBe(true);
    expect(pieces().every(mesh => parts.some((part: any) => part.geometry === mesh.geometry && part.material === mesh.material))).toBe(true);
  });

  it('collides individual fragments with the street, a building wall and other fragments', () => {
    effects.spawn(wreck);
    expect(stats().wreckBodies, 'fragments need independent rigid bodies').toBeGreaterThan(40);
    let highest = 0, moved = false;
    for (let tick = 0; tick < 138; tick++) {
      effects.update(1 / 60);
      for (const mesh of pieces()) {
        mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        expect(box.minimumWorld.y, 'rotating pieces must stay above the road').toBeGreaterThan(-.08);
        expect(box.minimumWorld.x, 'pieces must not pass through the nearby wall').toBeGreaterThan(-2.95);
        highest = Math.max(highest, box.maximumWorld.y);
        moved ||= Math.abs(mesh.getAbsolutePosition().z) > 3;
      }
    }
    expect(highest).toBeGreaterThan(3);
    expect(moved).toBe(true);
    expect(stats().wreckPartCollisions, 'fragment collisions must be physical, not independent ballistic animations').toBeGreaterThan(0);
  });

  it('matches debris to an unarmed civilian and an armed villain without allocating new visual pools per explosion', () => {
    const meshes = scene.meshes.length;
    effects.spawn({ ...wreck, bodyAssetId: 'traffic-sedan' }); effects.update(1 / 60);
    expect(pieces().length).toBeGreaterThanOrEqual(40);
    expect(pieces().some(mesh => mesh.metadata.componentName === 'gun')).toBe(false);
    effects.remove(wreck.vehicleId);
    effects.spawn({ ...wreck, bodyAssetId: 'army', discontinuityId: 4 }); effects.update(1 / 60);
    expect(pieces().filter(mesh => mesh.metadata.componentName === 'gun')).toHaveLength(2);
    expect(pieces().some(mesh => mesh.metadata.componentName === 'rear-spare')).toBe(true);
    expect(scene.meshes.length).toBe(meshes);
    effects.reset(); expect(stats().wreckBodies).toBe(0); expect(pieces()).toHaveLength(0);
  });

  it('clears rigid bodies for reduced motion, expiry, removal, reset and disposal', () => {
    effects.spawn(wreck, { reducedMotion: true });
    expect(stats().wreckBodies).toBe(0);
    effects.reset(); effects.spawn(wreck); effects.update(.1);
    expect(stats().wreckBodies).toBeGreaterThan(40);
    effects.update(.1, { reducedMotion: true }); expect(stats().wreckBodies).toBe(0);
    effects.reset(); effects.spawn(wreck); effects.remove(wreck.vehicleId); expect(stats().wreckBodies).toBe(0);
    effects.spawn({ ...wreck, discontinuityId: 4 });
    for (let i = 0; i < 160; i++) effects.update(1 / 60);
    expect(stats().wreckBodies).toBe(0); expect(pieces()).toHaveLength(0);
    effects.spawn({ ...wreck, discontinuityId: 5 }); effects.dispose();
    expect(stats().wreckBodies).toBe(0);
  });
});
