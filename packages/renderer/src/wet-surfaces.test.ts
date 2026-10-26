import { afterEach, beforeEach, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { WetSurfaces } from './wet-surfaces';
import { DISTRICT_WATER } from '@fender/content';
import { ROAD_PUDDLES } from '@fender/content';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from './primitives';
import { WaterSplashes } from './water-splashes';
import type { VehicleState } from '@fender/contracts';

let engine: NullEngine, scene: Scene, water: WetSurfaces;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); scene.useRightHandedSystem = true; water = new WetSurfaces(scene); });
afterEach(() => { water.dispose(); scene.dispose(); engine.dispose(); });
it('keeps decorative puddles visible and renders the exact physics polygon on every preset',()=>{
 expect(water.getStats().waterSurfaces).toBe(6);
 for(const quality of ['low','medium','high'] as const){water.update(.1,quality,false);expect(water.getStats().waterSurfaces).toBe(6);
 for(const zone of ROAD_PUDDLES){const mesh=water.meshes.find(m=>m.name===`wet-${zone.id}`)!,positions=mesh.getVerticesData('position')!;
 for(let i=0;i<zone.polygonXZ.length/2;i++){expect(-(positions[(i+1)*3]!+mesh.position.x)).toBeCloseTo(zone.polygonXZ[i*2]!,5);expect(positions[(i+1)*3+2]!+mesh.position.z).toBeCloseTo(zone.polygonXZ[i*2+1]!,5);}}
 }
});

it('shares one opaque PBR surface across authored sites, without per-site reflection targets', () => {
  expect(water.meshes).toHaveLength(DISTRICT_WATER.length);
  for (const [i, mesh] of water.meshes.entries()) {
    expect(mesh.material).toBe(water.material); expect(mesh.isPickable).toBe(false);
    expect(mesh.position.asArray()).toEqual([-DISTRICT_WATER[i]!.x, DISTRICT_WATER[i]!.y, DISTRICT_WATER[i]!.z]);
  }
  expect(water.material.alpha).toBe(1); expect(scene.customRenderTargets).toHaveLength(0); expect(scene.lights).toHaveLength(0);
});
it('bounds visible scene reflections to one small target, excludes water feedback and releases it', () => {
  const camera = new FreeCamera('driving', new Vector3(-34, 43, -116), scene); camera.setTarget(new Vector3(-42, 0, -76)); scene.activeCamera = camera;
  const nearby = MeshBuilder.CreateBox('nearby-object', { size: 2 }, scene); nearby.position.set(-42, 2, -61);
  water.update(.1, 'medium', false);
  expect(scene.customRenderTargets).toHaveLength(1);
  const reflection = scene.customRenderTargets[0]!;
  expect(reflection.getSize().width).toBeLessThanOrEqual(256);
  expect(reflection.renderList).toContain(nearby);
  expect(reflection.renderList!.some(mesh => mesh.material === water.material)).toBe(false);
  for (let i = 0; i < 10; i++) water.update(.1, i % 2 ? 'low' : 'high', false);
  expect(scene.customRenderTargets).toEqual([reflection]);
  camera.setTarget(new Vector3(-42, 90, -200)); water.update(.1, 'medium', false);
  expect(scene.customRenderTargets).toHaveLength(0);
  camera.setTarget(new Vector3(-42, 0, -76)); water.update(.1, 'medium', false);
  expect(scene.customRenderTargets).toEqual([reflection]);
  water.dispose(); expect(scene.customRenderTargets).toHaveLength(0); expect(scene.textures).not.toContain(reflection);
  nearby.dispose();
});
it('freezes decorative time immediately for reduced motion and low quality', () => {
  water.update(.1, 'high', false); expect(water.time).toBeCloseTo(.1);
  water.update(.1, 'high', true); expect(water.time).toBeCloseTo(.1);
  water.update(.1, 'low', false); expect(water.time).toBeCloseTo(.1); expect(water.ripples).toBe(false);
  water.update(.1, 'medium', false); expect(water.time).toBeCloseTo(.2);
});
it('reuses resources across quality changes and releases every surface/material', () => {
  const material = water.material;
  for (let i = 0; i < 100; i++) water.update(.1, i % 2 ? 'low' : 'high', false);
  expect(scene.meshes.filter(m => m.name.startsWith('wet-'))).toHaveLength(6); expect(scene.materials).toContain(material);
  water.dispose(); water.dispose(); expect(scene.meshes).toHaveLength(0); expect(scene.materials).not.toContain(material);
});
it('gives the pond and pool a pale, flat shallow border without erecting a route obstacle', () => {
  const borders = scene.meshes.filter(m => m.name.startsWith('shallow-border-'));
  expect(borders).toHaveLength(2);
  expect(borders.every(m => !m.isPickable && m.getBoundingInfo().boundingBox.extendSize.y < .03)).toBe(true);
});
it('throws speed-scaled tire droplets from a fixed pool and clears motion, life and leave effects', () => {
  const spray = new WaterSplashes(scene);
  const car: VehicleState = { entityId: 'splash-car', playerId: 'officer', bodyAssetId: 'patrol', pose: { x: 4, z: -41, yaw: 0 }, velocity: { x: 0, z: 18, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 };
  spray.update([car], .05, 'high', false); car.pose.z = -36; spray.update([car], .05, 'high', false); spray.update([car], .08, 'high', false);
  expect(spray.getStats().waterSplashDrops).toBeGreaterThan(4);
  const particles = scene.meshes.filter(m => m.name.startsWith('water-splash-drop-')); const capacity = particles.length;
  expect(capacity).toBeLessThanOrEqual(96); expect(particles.some(m => m.isVisible && m.position.y > .25)).toBe(true);
  car.discontinuityId++; spray.update([car], .05, 'high', false); expect(spray.getStats().waterSplashDrops).toBe(0);
  car.pose.z = -35; spray.update([car], .12, 'high', false); spray.update([car], .05, 'high', true); expect(spray.getStats().waterSplashDrops).toBe(0);
  spray.reset(); expect(spray.getStats().waterSplashDrops).toBe(0); expect(scene.meshes.filter(m => m.name.startsWith('water-splash-drop-'))).toHaveLength(capacity);
  const crowd = Array.from({ length: 32 }, (_, i) => ({ ...car, entityId: `water-crowd-${i}`, pose: { x: 4, z: -41, yaw: 0 } }));
  spray.update(crowd, .05, 'high', false); for (const vehicle of crowd) vehicle.pose.z = -36; spray.update(crowd, .05, 'high', false);
  expect(spray.getStats().waterSplashDrops).toBe(96); spray.update(crowd, .05, 'low', false); expect(spray.getStats().waterSplashDrops).toBeLessThanOrEqual(48);
  for (let i = 0; i < 10; i++) spray.update(crowd, .1, 'high', false);
  expect(spray.getStats().waterSplashDrops).toBe(0); expect(scene.meshes.filter(m => m.name.startsWith('water-splash-drop-'))).toHaveLength(capacity);
  spray.dispose(); spray.dispose(); expect(scene.meshes.some(m => m.name.startsWith('water-splash-'))).toBe(false);
});
