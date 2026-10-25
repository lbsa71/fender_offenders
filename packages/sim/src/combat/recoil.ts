import type { DriverRuntimeState, VehicleState } from '@fender/contracts';
import type { SimulationConfig } from '../core/config';
import { tuningForVehicle } from '../vehicles/profiles';

/** One accepted paired volley, shared by authority and prediction. Never acts as a reverse engine. */
export function applyVolleyRecoil(vehicle: VehicleState, driver: DriverRuntimeState, tick: number, config: SimulationConfig, cooldownTicks = config.weapon.cooldownTicks): void {
  const fx = Math.sin(vehicle.pose.yaw), fz = Math.cos(vehicle.pose.yaw);
  const forward = vehicle.velocity.x * fx + vehicle.velocity.z * fz;
  // Scale the kick with the existing acceleration profile, retaining a useful cost on every body.
  const impulse = Math.min(Math.max(0, forward), config.weapon.recoilImpulse * tuningForVehicle(config, vehicle).acceleration / 26);
  vehicle.velocity.x -= fx * impulse; vehicle.velocity.z -= fz * impulse;
  driver.recoilStrength = Math.min(1, (driver.recoilStrength ?? 0) + config.weapon.recoilBuildup);
  driver.nextFireTick = tick + cooldownTicks; driver.shotOrdinal++;
  vehicle.protectedUntilTick = tick;
}
