import { expect, it } from 'vitest';
import * as contracts from './index.js';

it('exposes six shared vehicle profiles with distinct trade-offs and a safe fallback', () => {
  expect(contracts).toHaveProperty('VEHICLE_PROFILES');
  const profiles = Reflect.get(contracts, 'VEHICLE_PROFILES') as Record<string, { maxHealth: number; topSpeed: number }>;
  expect(Object.keys(profiles).sort()).toEqual(['ambulance', 'army', 'fire-chief', 'interceptor', 'patrol', 'roadster']);
  expect(profiles.army!.maxHealth).toBeGreaterThan(profiles.patrol!.maxHealth);
  expect(profiles.army!.topSpeed).toBeLessThan(profiles.patrol!.topSpeed);
  expect(profiles.roadster!.maxHealth).toBeLessThan(profiles.patrol!.maxHealth);
  expect(profiles.roadster!.topSpeed).toBeGreaterThan(profiles.patrol!.topSpeed);
  const lookup = Reflect.get(contracts, 'getVehicleProfile') as (id: string) => unknown;
  expect(lookup('unknown-body')).toBe(profiles.patrol);
});
