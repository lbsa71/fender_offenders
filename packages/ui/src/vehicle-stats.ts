import { getVehicleProfile, type VehicleBodyId, type VehicleState } from '@fender/contracts';

/** Pure projection shared by unit/suspect cards, including pending reassignment. */
export function vehicleStats(id: VehicleBodyId, authority?: Pick<VehicleState, 'bodyAssetId' | 'maxHealth'>) {
  const profile = getVehicleProfile(id);
  return {
    ...profile,
    maxHealth: authority?.bodyAssetId === id ? authority.maxHealth ?? profile.maxHealth : profile.maxHealth,
    speedKmh: Math.round(profile.topSpeed * 3.6),
    accelerationMeter: Math.min(1, profile.acceleration / 24),
    handlingMeter: Math.min(1, profile.steeringRate / 2.6 * Math.sqrt(profile.grip / 10)),
  };
}
