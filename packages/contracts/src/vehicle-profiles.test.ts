import { expect, it } from 'vitest';
import * as contracts from './index.js';

it('offers Night Courier as a selectable armored 1920s sedan',()=>{
  expect(contracts.isVehicleBodyId('gangster')).toBe(true);
  expect(contracts.VEHICLE_BODIES).toContain('gangster');
  expect(contracts.getVehicleProfile('gangster')).toMatchObject({id:'gangster',name:'Night Courier',maxHealth:120,topSpeed:21});
});

it('offers the DB5 as a selectable classic GT with shared handling',()=>{
  expect(contracts.isVehicleBodyId('db5')).toBe(true);
  expect(contracts.VEHICLE_BODIES).toContain('db5');
  expect(contracts.getVehicleProfile('db5')).toMatchObject({id:'db5',name:'Aston Martin DB5',maxHealth:90,topSpeed:26});
});

it('exposes eight shared vehicle profiles with distinct trade-offs and a safe fallback', () => {
  expect(contracts).toHaveProperty('VEHICLE_PROFILES');
  const profiles = Reflect.get(contracts, 'VEHICLE_PROFILES') as Record<string, { maxHealth: number; topSpeed: number }>;
  expect(Object.keys(profiles).sort()).toEqual(['ambulance', 'army', 'db5', 'fire-chief', 'gangster', 'interceptor', 'patrol', 'roadster']);
  expect(profiles.army!.maxHealth).toBeGreaterThan(profiles.patrol!.maxHealth);
  expect(profiles.army!.topSpeed).toBeLessThan(profiles.patrol!.topSpeed);
  expect(profiles.roadster!.maxHealth).toBeLessThan(profiles.patrol!.maxHealth);
  expect(profiles.roadster!.topSpeed).toBeGreaterThan(profiles.patrol!.topSpeed);
  const lookup = Reflect.get(contracts, 'getVehicleProfile') as (id: string) => unknown;
  expect(lookup('unknown-body')).toBe(profiles.patrol);
});
