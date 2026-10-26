import { describe, expect, it } from 'vitest';
import type { VehicleState } from '@fender/contracts';
import { WaterCrossings } from './water-crossings';

const car = (z: number, extra: Partial<VehicleState> = {}): VehicleState => ({ entityId: 'hero', playerId: 'hero', bodyAssetId: 'patrol', pose: { x: 4, z, yaw: 0 }, velocity: { x: 0, z: 14, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0, ...extra });
describe('cosmetic tire crossings of authored water', () => {
  it('sprays from both moving tires at the water height, without modifying the car', () => {
    const crossing = new WaterCrossings(); crossing.update([car(-41)], .05);
    const vehicle = car(-36), before = structuredClone(vehicle), cues = crossing.update([vehicle], .05);
    expect(cues).toHaveLength(1); expect(cues[0]!.wheels).toHaveLength(2);
    expect(cues[0]!.wheels.map(w => w.side)).toEqual([-1, 1]);
    expect(cues[0]!.wheels.every(w => w.y === .039 && w.z >= -37 && w.z <= -31)).toBe(true);
    expect(cues[0]!.sound).toBe(true); expect(vehicle).toEqual(before);
  });
  it('detects a whole fast crossing between frames and reverse crossings', () => {
    for (const reverse of [false, true]) {
      const crossing = new WaterCrossings(), velocity = { x: 0, z: reverse ? -24 : 24, yawRate: 0 };
      crossing.update([car(reverse ? -28 : -41, { velocity })], .1);
      const cues = crossing.update([car(reverse ? -40 : -29, { velocity })], .1);
      expect(cues).toHaveLength(1); expect(cues[0]!.wheels.every(w => w.z >= -37 && w.z <= -31)).toBe(true);
    }
  });
  it('does not spray for first appearance, repeated poses, crawling, dry roads, teleports or a new life', () => {
    for (const [start, end] of [
      [car(-35), car(-35)], [car(-36), car(-35, { velocity: { x: 0, z: .2, yawRate: 0 } })],
      [car(-60), car(-59)], [car(-90), car(-34)], [car(-41), car(-35, { discontinuityId: 1 })],
      [car(-41), car(-35, { status: 'wrecked' })],
    ]) {
      const crossing = new WaterCrossings(); expect(crossing.update([start], .05)).toEqual([]);
      expect(crossing.update([end], .05)).toEqual([]);
    }
  });
  it('rate-limits wet trails and sound, then forgets departed cars and resets', () => {
    const crossing = new WaterCrossings(); crossing.update([car(-40)], .02);
    const cues = [];
    for (let i = 0; i < 30; i++) cues.push(...crossing.update([car(-38 + i * .15)], .02));
    expect(cues.length).toBeGreaterThan(1); expect(cues.length).toBeLessThanOrEqual(6);
    expect(cues.filter(c => c.sound).length).toBeLessThanOrEqual(2);
    crossing.update([], .1); expect(crossing.update([car(-34)], .1)).toEqual([]);
    crossing.reset(); expect(crossing.update([car(-33)], .1)).toEqual([]);
  });
  it('uses the real pond and pool footprints and supports rotated traffic cars', () => {
    for (const site of [{ x: 42, z: -63, y: .285 }, { x: -32, z: 61, y: .285 }]) {
      const crossing = new WaterCrossings(), make = (x: number) => car(site.z, { playerId: null, pose: { x, z: site.z, yaw: Math.PI / 2 }, velocity: { x: 18, z: 0, yawRate: 0 } });
      crossing.update([make(site.x - 7)], .05);
      const cues = crossing.update([make(site.x - 1)], .05);
      expect(cues).toHaveLength(1); expect(cues[0]!.wheels.every(w => w.y === site.y)).toBe(true);
    }
  });
});
