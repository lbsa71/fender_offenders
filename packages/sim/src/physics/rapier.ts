import RAPIER from '@dimforge/rapier3d-compat';
import type { CollisionMap } from '@fender/contracts';
import type { Point } from './geometry.js';

let initialized = false;
let initialization: Promise<void> | undefined;
export function initPhysics(): Promise<void> {
  return initialization ??= RAPIER.init().then(() => { initialized = true; });
}

export interface StaticQueries { segmentHit(start: Point, end: Point): number | null; dispose(): void }

/** Rapier owns immutable map queries; vehicle contacts use the documented bounded planar model. */
export function createStaticQueries(map: CollisionMap): StaticQueries {
  if (!initialized) throw new Error('Call and await initPhysics() before createSimulation()');
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  for (const c of map.colliders) {
    if (c.layer !== 'world-solid') continue;
    const shape = c.shape === 'box' ? RAPIER.ColliderDesc.cuboid(c.halfExtents!.x, c.halfExtents!.y, c.halfExtents!.z) : RAPIER.ColliderDesc.convexHull(new Float32Array(c.vertices!));
    if (!shape) { world.free(); throw new Error(`Cannot build collider ${c.id}`); }
    shape.setTranslation(c.pose.x, 0, c.pose.z).setRotation({ x: 0, y: Math.sin(c.pose.yaw / 2), z: 0, w: Math.cos(c.pose.yaw / 2) });
    world.createCollider(shape);
  }
  world.timestep = 1 / 60;
  world.step();
  return {
    segmentHit(start, end) {
      const ray = new RAPIER.Ray({ x: start.x, y: 0, z: start.z }, { x: end.x - start.x, y: 0, z: end.z - start.z });
      const hit = world.castRay(ray, 1, true);
      return hit ? hit.timeOfImpact : null;
    },
    dispose() { world.free(); },
  };
}

/** Small real-WASM feasibility fixture; no rendering adapter or fake physics involved. */
export async function runPhysicsSpike(): Promise<{ planar: boolean; contact: boolean; staticQuery: boolean; restored: boolean }> {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.6, 0).enabledTranslations(true, false, true).enabledRotations(false, true, false);
  const a = world.createRigidBody(desc), b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.6, 4));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.95, 0.5, 2.15), a);
  world.createCollider(RAPIER.ColliderDesc.cuboid(3, 1, 0.5), b);
  a.setLinvel({ x: 0, y: 0, z: 12 }, true);
  a.applyImpulse({ x: 0, y: 10, z: 0 }, true);
  a.applyTorqueImpulse({ x: 5, y: 0.2, z: 5 }, true);
  for (let i = 0; i < 60; i++) world.step();
  const t = a.translation(), rotation = a.rotation();
  const planar = Math.abs(t.y - 0.6) < 1e-6 && Math.abs(rotation.x) < 1e-6 && Math.abs(rotation.z) < 1e-6;
  const contact = t.z < 2;
  const staticQuery = world.castRay(new RAPIER.Ray({ x: 2, y: 0.6, z: 0 }, { x: 0, y: 0, z: 1 }), 10, true) !== null;
  const state = world.takeSnapshot(), handle = a.handle;
  const restoredWorld = RAPIER.World.restoreSnapshot(state);
  const restored = Math.abs(restoredWorld.getRigidBody(handle).translation().z - t.z) < 1e-6;
  restoredWorld.free(); world.free();
  return { planar, contact, staticQuery, restored };
}
