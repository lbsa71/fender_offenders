import type { CollisionMap, DriverActions, VehicleState } from '@fender/contracts';
import type { DrivingSound } from './audio';

const unit = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

/** Render-only surface lookup. It neither changes grip nor imports simulation internals. */
function roadSurface(vehicle: VehicleState, map: CollisionMap): DrivingSound['surface'] {
  const { x, z } = vehicle.pose;
  for (let n = map.surfaces.length - 1; n >= 0; n--) {
    const zone = map.surfaces[n], p = zone.polygonXZ; let inside = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
    }
    if (inside) return zone.surface;
  }
  return 'asphalt';
}

export class DrivingSoundTracker {
  private identity = '';
  private previousSpeed = 0;
  reset() { this.identity = ''; this.previousSpeed = 0; }
  sample(vehicle: VehicleState, map: CollisionMap, dt: number, input?: Pick<DriverActions, 'throttle' | 'brakeReverse'>): DrivingSound {
    const speed = Math.hypot(vehicle.velocity.x, vehicle.velocity.z), identity = `${vehicle.entityId}:${vehicle.discontinuityId}`;
    const acceleration = identity === this.identity && dt > 0 && dt <= .1 ? (speed - this.previousSpeed) / dt : 0;
    this.identity = identity; this.previousSpeed = speed;
    const forward = Math.sin(vehicle.pose.yaw) * vehicle.velocity.x + Math.cos(vehicle.pose.yaw) * vehicle.velocity.z;
    const lateral = Math.cos(vehicle.pose.yaw) * vehicle.velocity.x - Math.sin(vehicle.pose.yaw) * vehicle.velocity.z;
    return {
      bodyAssetId: vehicle.bodyAssetId,
      load: input ? unit(forward < -.5 ? input.brakeReverse : input.throttle) : unit(.2 + acceleration / 18),
      slip: speed > 3 ? unit((Math.atan2(Math.abs(lateral - vehicle.velocity.yawRate * 1.3), Math.max(4, Math.abs(forward))) - .12) / .5) : 0,
      surface: roadSurface(vehicle, map),
    };
  }
}
