import { afterEach, beforeEach, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import type { VehicleState } from '@fender/contracts';
import { PedestrianCrowd } from './pedestrians';
let scene: Scene, engine: NullEngine;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); });
it('renders24 recognizable low-poly figures with contrasting heads/shirts and articulated limbs', () => {
  const crowd = new PedestrianCrowd(scene); expect(crowd.getStats().total).toBe(24);
  for (let i = 0; i < 24; i++) { expect(scene.getTransformNodeByName(`pedestrian-${i}`)).not.toBeNull(); const head = scene.getMeshByName(`pedestrian-${i}-head`)!, torso = scene.getMeshByName(`pedestrian-${i}-torso`)!; expect(head.getTotalVertices()).toBeGreaterThan(12); expect(head.material).not.toBe(torso.material); }
  crowd.dispose();
});
it('passes suspect identity through to crowd motion while ordinary cars remain calm', () => {
  const crowd = new PedestrianCrowd(scene);
  const root = scene.getTransformNodeByName('pedestrian-0')!;
  const vehicle = { entityId: 'wanted', playerId: null, bodyAssetId: 'patrol', pose: { x: -root.position.x + 7, z: root.position.z - 14, yaw: 0 }, velocity: { x: 0, z: 28, yawRate: 0 }, status: 'active' } as VehicleState;
  crowd.update([vehicle], 1 / 60, false);
  expect(crowd.getStats().running).toBe(0);
  crowd.reset();crowd.update([vehicle], 1 / 60, false, 'wanted');
  expect(crowd.getStats().running).toBeGreaterThan(0);
  crowd.dispose();
});
it('moves gait normally but removes bob, lean and limb swing for reduced motion without removing safety', () => {
  const crowd = new PedestrianCrowd(scene); crowd.update([], .2, false);
  const arm = scene.getTransformNodeByName('pedestrian-0-left-arm'); expect(arm).not.toBeNull(); expect(Math.abs(arm!.rotation.x)).toBeGreaterThan(.05);
  crowd.update([], .1, true); expect(arm!.rotation.x).toBe(0);
  const root = scene.getTransformNodeByName('pedestrian-0')!;
  const vehicle = { entityId: 'officer', playerId: 'player', pose: { x: -root.position.x, z: root.position.z, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 }, status: 'active' } as VehicleState;
  crowd.update([vehicle], 0, true); expect(!root.isEnabled() || Math.hypot(-root.position.x - vehicle.pose.x, root.position.z - vehicle.pose.z) > 4).toBe(true); expect(crowd.getStats().running).toBeGreaterThan(0); crowd.dispose();
});
it('repeated reset, scene return and disposal keep mesh/material counts bounded', () => {
  const meshes = scene.meshes.length, materials = scene.materials.length, nodes = scene.transformNodes.length;
  for (let run = 0; run < 3; run++) {
    const crowd = new PedestrianCrowd(scene); const allocated = scene.meshes.length; expect(allocated).toBeGreaterThan(24);
    for (let i = 0; i < 12; i++) { crowd.update([], .1, false); crowd.reset(); expect(scene.meshes.length).toBe(allocated); }
    crowd.dispose(); crowd.dispose(); crowd.reset(); crowd.update([], .1, false);
    expect(crowd.getStats().total).toBe(0); expect(scene.meshes.length).toBe(meshes); expect(scene.materials.length).toBe(materials); expect(scene.transformNodes.length).toBe(nodes);
  }
});
