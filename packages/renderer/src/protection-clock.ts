import type { RenderFrame, VehicleState } from '@fender/contracts';

/** Protection is measured by the room clock, which also freezes during solo pause. */
export function isSpawnProtected(vehicle: Pick<VehicleState, 'protectedUntilTick'>, frame: Pick<RenderFrame, 'sampleTimeSeconds' | 'serverTick'>): boolean {
  return vehicle.protectedUntilTick > (frame.serverTick ?? frame.sampleTimeSeconds * 60);
}
