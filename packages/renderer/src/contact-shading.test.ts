import { afterEach, beforeEach, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import type { VehicleState } from '@fender/contracts';
import { ContactShading } from './contact-shading';

let engine: NullEngine, scene: Scene, contacts: ContactShading;
const vehicle = (id: string, x: number, z: number, status: VehicleState['status'] = 'active'): VehicleState => ({ entityId: id, playerId: id, bodyAssetId: 'patrol', pose: { x, z, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 }, health: 100, status, protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 });
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); contacts = new ContactShading(scene); });
afterEach(() => { contacts.dispose(); scene.dispose(); engine.dispose(); });
it('anchors bounded patches to actual road/dirt/grass locations and clears absent/respawning vehicles', () => {
  contacts.update([vehicle('road', 4, -40), vehicle('dirt', -40, -43), vehicle('grass', -32, 61)]);
  expect(contacts.getStats().contactPatches).toBe(3);
  expect(contacts.meshes[0]!.position.asArray()).toEqual([-4, .042, -40]);
  expect(contacts.meshes[1]!.position.y).toBeGreaterThan(.25); expect(contacts.meshes[2]!.position.y).toBeGreaterThan(.22);
  contacts.update([vehicle('respawn', 4, -40, 'respawning')]); expect(contacts.getStats().contactPatches).toBe(0);
  contacts.update(Array.from({ length: 50 }, (_, i) => vehicle(`${i}`, 4, i))); expect(contacts.getStats().contactPatches).toBe(32);
  contacts.reset(); expect(contacts.getStats().contactPatches).toBe(0);
});
it('reuses its shared texture and releases the entire pool', () => {
  const texture = scene.textures.find(t => t.name === 'vehicle-contact');
  for (let i = 0; i < 20; i++) contacts.update([vehicle('moving', i, i)]);
  expect(scene.meshes).toHaveLength(32); expect(scene.textures).toHaveLength(1);
  contacts.dispose(); contacts.dispose(); expect(scene.meshes).toHaveLength(0); expect(scene.textures).not.toContain(texture);
});
