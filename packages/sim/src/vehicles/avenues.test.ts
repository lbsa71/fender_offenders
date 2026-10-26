import { expect, it } from 'vitest';
import { districtMap } from '@fender/content';
import type { VehicleState } from '@fender/contracts';
import { driveVehicle, newDriver, neutralActions } from './controller';

it('lets a patrol car accelerate and hold full speed along a real main street for ten seconds', () => {
  const car: VehicleState = { entityId: 'avenue-patrol', playerId: 'officer', bodyAssetId: 'patrol', pose: { x: 4, z: -110, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 };
  const driver = newDriver(), actions = { ...neutralActions(), throttle: 1 };
  const solids = districtMap.colliders.filter(c => c.halfExtents).map(c => [
    { x: c.pose.x - c.halfExtents!.x, z: c.pose.z - c.halfExtents!.z },
    { x: c.pose.x + c.halfExtents!.x, z: c.pose.z - c.halfExtents!.z },
    { x: c.pose.x + c.halfExtents!.x, z: c.pose.z + c.halfExtents!.z },
    { x: c.pose.x - c.halfExtents!.x, z: c.pose.z + c.halfExtents!.z },
  ]);
  for (let tick = 0; tick < 600; tick++) {
    driveVehicle(car, driver, actions, districtMap, solids);
    if (tick >= 300) expect(car.velocity.z, `cruise tick ${tick}`).toBeGreaterThan(27);
  }
  expect(car.pose.z + 110).toBeGreaterThan(250);
  expect(car.pose.x).toBeCloseTo(4);
});
