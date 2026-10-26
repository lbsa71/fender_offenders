import { expect, it } from 'vitest';
import { vehicleStats } from './vehicle-stats';

it.each([
  ['patrol', 100, 86], ['interceptor', 90, 94], ['roadster', 80, 101],
  ['army', 130, 72], ['ambulance', 110, 79], ['fire-chief', 100, 83],
] as const)('projects %s statistics without a browser or live session', (id, hp, speed) => {
  const stats = vehicleStats(id);
  expect(stats.maxHealth).toBe(hp); expect(stats.speedKmh).toBe(speed);
  expect(stats.accelerationMeter).toBeGreaterThan(0); expect(stats.accelerationMeter).toBeLessThanOrEqual(1);
  expect(stats.handlingMeter).toBeGreaterThan(0); expect(stats.handlingMeter).toBeLessThanOrEqual(1);
});

it('uses authoritative armor only for the car being displayed', () => {
  expect(vehicleStats('army', { bodyAssetId: 'army', maxHealth: 260 }).maxHealth).toBe(260);
  expect(vehicleStats('army', { bodyAssetId: 'patrol', maxHealth: 100 }).maxHealth).toBe(130);
});

it('gives both cards the same meter scale', () => {
  expect(vehicleStats('patrol').accelerationMeter).toBe(.75);
  expect(vehicleStats('patrol').handlingMeter).toBeCloseTo(.766, 3);
  expect(vehicleStats('roadster').accelerationMeter).toBeCloseTo(.917, 3);
});
