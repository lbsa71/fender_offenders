import { afterEach, beforeEach, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { districtMap } from '@fender/content';
import type { CollisionMap, RenderFrame, VehicleState } from '@fender/contracts';
import { LightDetail, sourceIsVisible } from './light-detail';
import { CarFactory } from './cars';
import { MeshBuilder } from './primitives';

let engine: NullEngine, scene: Scene, camera: FreeCamera, detail: LightDetail, factory: CarFactory;
const map: CollisionMap = { ...districtMap, colliders: [] };
beforeEach(() => {
  engine = new NullEngine(); scene = new Scene(engine); scene.useRightHandedSystem = true;
  camera = new FreeCamera('test-camera', new Vector3(0, 8, -16), scene); camera.setTarget(Vector3.Zero()); scene.activeCamera = camera;
  const window = new StandardMaterial('#4f7e87false', scene); window.diffuseColor.set(.3, .4, .5);
  detail = new LightDetail(scene, map); factory = new CarFactory(scene);
});
afterEach(() => { detail.dispose(); factory.dispose(); scene.dispose(); engine.dispose(); });
const frame: RenderFrame = { sampleTimeSeconds: 1, localEntityId: 'officer', vehicles: [], projectiles: [], cameraTarget: null };
const source = { position: new Vector3(0, 4, 0) };

it('clips sources at camera edges and behind the camera, with reflected building occlusion', () => {
  const planes = Frustum.GetPlanes(camera.getViewMatrix().multiply(camera.getProjectionMatrix()));
  expect(sourceIsVisible(source.position, camera.position, planes, map)).toBe(true);
  for (const point of [new Vector3(100, 4, 0), new Vector3(0, 8, -30), new Vector3(0, 100, 0)]) expect(sourceIsVisible(point, camera.position, planes, map)).toBe(false);
  const blocked = { ...map, colliders: [{ id: 'building', shape: 'box' as const, pose: { x: 0, z: -4, yaw: .3 }, halfExtents: { x: 3, y: 5, z: 1 }, layer: 'world-solid' as const, surface: 'asphalt' as const }] };
  expect(sourceIsVisible(source.position, camera.position, planes, blocked)).toBe(false);
  camera.position.y = 24; camera.setTarget(Vector3.Zero());
  const highPlanes = Frustum.GetPlanes(camera.getViewMatrix().multiply(camera.getProjectionMatrix()));
  const lowBuilding = { ...blocked, colliders: blocked.colliders.map(c => ({ ...c, halfExtents: { x: 3, y: 2, z: 1 } })) };
  expect(sourceIsVisible(source.position, camera.position, highPlanes, lowBuilding)).toBe(true);
});
it('occludes a source behind the visible gabled roof as well as the collision wall', () => {
  const house = { ...map, colliders: [{ id: 'house-a', shape: 'box' as const, pose: { x: 0, z: -4, yaw: 0 }, halfExtents: { x: 3, y: 3, z: 1 }, layer: 'world-solid' as const, surface: 'asphalt' as const }] };
  expect(sourceIsVisible(new Vector3(0, 8, 0), new Vector3(0, 9, -16), [], house)).toBe(false);
});
it('attaches steady halos to sources, caps the pool, and removes offscreen or removed sources immediately', () => {
  const sources = Array.from({ length: 20 }, (_, i) => ({ position: new Vector3((i % 4) - 2, 4, i % 3) }));
  detail.update(frame, new Map(), sources, 1, 'high', false);
  expect(detail.getStats().sourceGlints).toBe(8);
  source.position.x = 1; detail.update(frame, new Map(), [source], 1, 'high', false);
  expect(detail.getStats().sourceGlints).toBe(1); expect(detail.glints[0]!.position.x).toBe(1);
  camera.setTarget(new Vector3(0, 8, -40)); detail.update(frame, new Map(), [source], 1, 'high', false); expect(detail.getStats().sourceGlints).toBe(0);
  detail.update(frame, new Map(), [], 1, 'high', false); expect(detail.getStats().sourceGlints).toBe(0);
});
it('suppresses halos for reduced flash/low while preserving steady window emission', () => {
  for (const [quality, reduced] of [['high', true], ['low', false]] as const) {
    detail.update(frame, new Map(), [source], 1, quality, reduced); expect(detail.getStats().sourceGlints).toBe(0);
    const window = scene.getMaterialByName('#4f7e87false') as StandardMaterial;
    expect(window.emissiveColor.r).toBeGreaterThan(.3); expect(window.emissiveColor.r).toBeGreaterThan(window.emissiveColor.b);
  }
  detail.update(frame, new Map(), [source], 0, 'high', false); expect((scene.getMaterialByName('#4f7e87false') as StandardMaterial).emissiveColor.r).toBe(0);
});
it('budgets actual shadowless headlight cones and cleans up on wreck, respawn, garage and disposal', () => {
  const car = factory.create('officer', 'patrol', false); car.root.position.set(-3, .03, 2); car.root.scaling.x = -1;
  const vehicle: VehicleState = { entityId: 'officer', playerId: 'officer', bodyAssetId: 'patrol', pose: { x: 3, z: 2, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 };
  const cars = new Map([['officer', car]]), active = { ...frame, vehicles: [vehicle] };
  detail.update(active, cars, [], 1, 'high', false); expect(detail.getStats().headlightLights).toBe(1);
  expect(detail.headlights[0]!.position.x).toBeCloseTo(-3); expect(detail.headlights[0]!.position.z).toBeGreaterThan(4);
  expect(detail.headlights.every(light => light.getShadowGenerator() === null)).toBe(true);
  detail.update(active, cars, [], 1, 'low', false); expect(detail.getStats().headlightLights).toBe(0);
  for (const status of ['wrecked', 'respawning'] as const) {
    detail.update({ ...active, vehicles: [{ ...vehicle, status }] }, cars, [], 1, 'high', false); expect(detail.getStats().headlightLights).toBe(0);
  }
  detail.update(active, cars, [], 1, 'high', false); detail.reset(); expect(detail.getStats()).toMatchObject({ headlightLights: 0, sourceGlints: 0 });
  const halo = scene.textures.find(t => t.name === 'source-halo');
  car.root.dispose(); factory.dispose(); detail.dispose(); detail.dispose(); expect(scene.lights).toHaveLength(0); expect(scene.textures).not.toContain(halo);
});
it('moves an active headlight without invalidating unchanged receiver shaders', () => {
  const receiver = MeshBuilder.CreateBox('headlight-receiver', { size: 2 }, scene);
  receiver.material = new StandardMaterial('receiver', scene);
  const car = factory.create('officer', 'patrol', false);
  const vehicle: VehicleState = { entityId: 'officer', playerId: 'officer', bodyAssetId: 'patrol', pose: { x: 0, z: 0, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 };
  const cars = new Map([['officer', car]]), active = { ...frame, vehicles: [vehicle] };
  detail.update(active, cars, [], .55, 'medium', false); scene.render();
  const defines = receiver.subMeshes![0]!.materialDefines!;
  expect(defines.isDirty).toBe(false);
  const initialPosition = detail.headlights[0]!.position.clone(), transitions: boolean[] = [];
  detail.headlights[0]!.onEnabledStateChangedObservable.add(enabled => transitions.push(enabled));
  car.root.position.x += 3;
  detail.update(active, cars, [], 1, 'medium', false);
  expect(detail.headlights[0]!.position.x).toBeCloseTo(initialPosition.x + 3);
  expect(detail.headlights[0]!.intensity).toBeCloseTo(1.1);
  expect(defines.isDirty, 'moving a steady light must not rebuild material defines').toBe(false);
  expect(transitions).toEqual([]);
  detail.update(active, cars, [], 0, 'medium', false);
  expect(detail.getStats().headlightLights).toBe(0);
  expect(defines.isDirty, 'removing a light must still invalidate its receivers').toBe(true);
});
