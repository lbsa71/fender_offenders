import { getVehicleProfile, type VehicleState } from '@fender/contracts';
import type { SimulationConfig } from '../core/config.js';

type ProfileVehicle = Pick<VehicleState, 'playerId' | 'bodyAssetId'>;
const baseline = getVehicleProfile('patrol');

/** Profiles scale gameplay overrides, rather than replacing per-room authoritative tuning. */
export function tuningForVehicle(config: SimulationConfig, vehicle: ProfileVehicle): SimulationConfig['vehicle'] {
  if (vehicle.playerId === null) return config.vehicle;
  const profile = getVehicleProfile(vehicle.bodyAssetId), tune = config.vehicle;
  return { ...tune,
    maxSpeed: tune.maxSpeed * profile.topSpeed / baseline.topSpeed,
    acceleration: tune.acceleration * profile.acceleration / baseline.acceleration,
    steeringRate: tune.steeringRate * profile.steeringRate / baseline.steeringRate,
    grip: tune.grip * profile.grip / baseline.grip,
    driftGrip: tune.driftGrip * profile.grip / baseline.grip,
  };
}

export function maxHealthForVehicle(config: SimulationConfig, vehicle: ProfileVehicle): number {
  return vehicle.playerId === null ? config.rules.health : Math.max(1, Math.round(config.rules.health * getVehicleProfile(vehicle.bodyAssetId).maxHealth / baseline.maxHealth));
}
