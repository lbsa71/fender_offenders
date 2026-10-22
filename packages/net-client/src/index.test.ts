import { describe, expect, it } from 'vitest';
import type { VehicleState } from '@fender/contracts';
import { interpolateVehicle } from './index.js';

function car(): VehicleState {
  return { entityId: 'car', playerId: 'officer', bodyAssetId: 'patrol', pose: { x: 0, z: 0, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 };
}
describe('remote interpolation baseline', () => {
  it('interpolates location and takes the short yaw arc across the angle boundary', () => {
    const a = car(), b = car(); a.pose.yaw = Math.PI - 0.1; b.pose = { x: 10, z: 20, yaw: -Math.PI + 0.1 }; b.health = 50;
    const middle = interpolateVehicle(a, b, 0.5);
    expect(middle.pose.x).toBe(5); expect(middle.pose.z).toBe(10); expect(Math.abs(Math.abs(middle.pose.yaw) - Math.PI)).toBeLessThan(1e-6);
    expect(middle.health).toBe(50); expect(a.pose.x).toBe(0); expect(b.pose.x).toBe(10);
    middle.pose.x = 500; expect(b.pose.x).toBe(10);
  });
  it('snaps across a respawn/teleport discontinuity rather than crossing intervening geometry', () => {
    const a = car(), b = car(); b.pose = { x: 80, z: 50, yaw: 1 }; b.discontinuityId = 1;
    const sample = interpolateVehicle(a, b, 0.1); expect(sample).toEqual(b); expect(sample).not.toBe(b); expect(sample.pose).not.toBe(b.pose);
  });
  it('snaps on a wreck/respawn status transition while retaining authoritative health', () => {
    const a = car(), b = car(); b.status = 'wrecked'; b.health = 0; b.pose.x = 12;
    expect(interpolateVehicle(a, b, 0.2)).toEqual(b);
  });
});
