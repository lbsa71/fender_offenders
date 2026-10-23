import type { VehicleState } from '@fender/contracts';
import { box, segmentPolygon, type Point } from '../physics/geometry.js';

export const AIM_ASSIST_LIMITS = Object.freeze({ maxAngleRadians: 4 * Math.PI / 180, lateralRadius: 2.5, range: 40 });
export type AimLineBlocked = (from: Point, to: Point) => boolean;

/** A one-time, visible-target correction. Does not change vehicle state or lead a moving target. */
export function selectAssistedYaw(shooter: VehicleState, candidates: readonly VehicleState[], tick: number, segmentBlocked: AimLineBlocked, suspectEntityId?: string): number {
  const start = shooter.pose, fx = Math.sin(start.yaw), fz = Math.cos(start.yaw);
  const targets: { vehicle: VehicleState; yaw: number; angle: number; distance: number }[] = [];
  for (const vehicle of candidates) {
    if (vehicle.entityId === shooter.entityId || vehicle.status !== 'active' || vehicle.protectedUntilTick > tick || vehicle.playerId === null && vehicle.entityId !== suspectEntityId) continue;
    const dx = vehicle.pose.x - start.x, dz = vehicle.pose.z - start.z, distance = Math.hypot(dx, dz);
    if (distance === 0 || distance > AIM_ASSIST_LIMITS.range || dx * fx + dz * fz <= 0 || Math.abs(dx * fz - dz * fx) > AIM_ASSIST_LIMITS.lateralRadius) continue;
    const yaw = Math.atan2(dx, dz), angle = Math.abs(Math.atan2(Math.sin(yaw - start.yaw), Math.cos(yaw - start.yaw)));
    if (angle > AIM_ASSIST_LIMITS.maxAngleRadians + 1e-12) continue;
    targets.push({ vehicle, yaw, angle, distance });
  }
  targets.sort((a, b) => a.angle - b.angle || a.distance - b.distance || (a.vehicle.entityId < b.vehicle.entityId ? -1 : a.vehicle.entityId > b.vehicle.entityId ? 1 : 0));
  for (const target of targets) {
    if (segmentBlocked(start, target.vehicle.pose)) continue;
    const targetEntry = segmentPolygon(start, target.vehicle.pose, box(target.vehicle.pose)) ?? 1;
    // Protected players and civilians still occlude a shot, even though they are not eligible targets.
    const occluded = candidates.some(vehicle => {
      if (vehicle.entityId === shooter.entityId || vehicle.entityId === target.vehicle.entityId || vehicle.status !== 'active') return false;
      const hit = segmentPolygon(start, target.vehicle.pose, box(vehicle.pose));
      return hit !== null && hit < targetEntry;
    });
    if (!occluded) return target.yaw;
  }
  return start.yaw;
}
