import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { VEHICLE_BODIES } from '@fender/content';
import { CarFactory, type CarVisual } from './cars';

let engine: NullEngine, scene: Scene, factory: CarFactory;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); factory = new CarFactory(scene); });
afterEach(() => { scene.dispose(); engine.dispose(); });
function part(car: CarVisual, name: string) {
  const value = car.parts.find(value => value.sourceMesh.material?.name === name);
  expect(value, `visible ${name} geometry`).toBeDefined();
  return value!.sourceMesh;
}
function paint(car: CarVisual, name: string) {
  const mesh = part(car, `paint-${name}`);
  expect(mesh.material).toBeInstanceOf(PBRMaterial);
  return { color: (mesh.material as PBRMaterial).albedoColor.toHexString().toLowerCase(), bounds: mesh.getBoundingInfo().boundingBox };
}

describe('original procedural vehicle bodies', () => {
  it('publishes all six selectable bodies in the shared authoritative catalog', () => {
    expect(VEHICLE_BODIES).toEqual(['patrol', 'interceptor', 'roadster', 'army', 'ambulance', 'fire-chief']);
  });

  it.each(['patrol', 'interceptor', 'roadster'])('retains the existing %s body and instanced geometry', body => {
    const first = factory.create('one', body, false), next = factory.create('two', body, false);
    expect(paint(first, body).bounds.maximum.y).toBeGreaterThan(1.5);
    expect(next.parts[0]!.sourceMesh).toBe(first.parts[0]!.sourceMesh);
    expect(first.parts.every(mesh => mesh.getTotalVertices() > 0)).toBe(true);
  });

  it('renders an olive upright army 4x4 with an elevated rear spare tire', () => {
    const car = factory.create('army-test', 'army', false), body = paint(car, 'army');
    expect(body.color).toBe('#69754a');
    expect(body.bounds.maximum.y).toBeGreaterThan(2);
    const tires = part(car, 'rubber').getBoundingInfo().boundingBox;
    expect(tires.minimum.z).toBeLessThan(-2.2);
    expect(tires.maximum.y).toBeGreaterThan(1.8);
  });

  it('renders a white ambulance with a tall rear box, fictional teal medical crosses and red service stripe', () => {
    const car = factory.create('ambulance-test', 'ambulance', false), body = paint(car, 'ambulance');
    expect(body.color).toBe('#f4efe0');
    expect(body.bounds.maximum.y).toBeGreaterThan(2.5);
    expect(body.bounds.minimum.z).toBeLessThan(-2);
    const marking = part(car, 'medical-cross');
    expect((marking.material as PBRMaterial).albedoColor.toHexString().toLowerCase()).toBe('#318c88');
    expect((part(car, 'medical-service').material as PBRMaterial).albedoColor.toHexString().toLowerCase()).toBe('#c94b43');
    const crosses = marking.getBoundingInfo().boundingBox;
    expect(crosses.maximum.y).toBeGreaterThan(2.2);
    expect(crosses.maximum.x - crosses.minimum.x).toBeGreaterThan(1.9);
    const glass = part(car, 'glass').getVerticesData('position')!;
    const upperWindshieldZ = Array.from({ length: glass.length / 3 }, (_, i) => [glass[i * 3 + 1]!, glass[i * 3 + 2]!] as const).filter(([y]) => y > 1.7).map(([, z]) => z);
    expect(Math.max(...upperWindshieldZ), 'upper front windshield must project ahead of the medical box').toBeGreaterThan(.7);
    expect(car.sirenRed).not.toBeNull(); expect(car.sirenBlue).not.toBeNull();
  });

  it('renders a red fire-chief SUV with a raised cabin, service stripe and roof lightbar', () => {
    const car = factory.create('chief-test', 'fire-chief', false), body = paint(car, 'fire-chief');
    expect(body.color).toBe('#bd4c3d');
    expect(body.bounds.maximum.y).toBeGreaterThan(2);
    const stripe = part(car, 'fire-service').getBoundingInfo().boundingBox;
    expect(stripe.maximum.z - stripe.minimum.z).toBeGreaterThan(3);
    expect(car.sirenRed).not.toBeNull(); expect(car.sirenBlue).not.toBeNull();
    expect(car.sirenRed!.sourceMesh.getBoundingInfo().boundingBox.minimum.y).toBeGreaterThan(2.2);
  });

  it.each(['army', 'ambulance', 'fire-chief'])('keeps %s inside the existing driving envelope and traffic independent', body => {
    const car = factory.create(body, body, false);
    for (const mesh of car.parts) {
      const bounds = mesh.sourceMesh.getBoundingInfo().boundingBox;
      expect(Math.max(Math.abs(bounds.minimum.x), Math.abs(bounds.maximum.x))).toBeLessThan(1.25);
      expect(Math.max(Math.abs(bounds.minimum.z), Math.abs(bounds.maximum.z))).toBeLessThan(2.55);
      expect(bounds.maximum.y).toBeLessThan(3);
    }
    expect(paint(factory.create('traffic', body, true), 'traffic').color).toBe('#cbb26e');
  });
});
