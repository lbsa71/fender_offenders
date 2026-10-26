import type { PlanarPose, RoadGadgetState, VehicleState } from '@fender/contracts';
export interface RoadGadgetRuntime { gadget: RoadGadgetState; hitVehicleIds: string[] }

export function gadgetOpportunity(kind: RoadGadgetState['kind'], owner: VehicleState, officers: readonly VehicleState[], tick: number, blocked: (a: PlanarPose, b: PlanarPose) => boolean): boolean {
  if (owner.status !== 'active' || owner.protectedUntilTick > tick) return false;
  return officers.some(officer => {
    if (officer.status !== 'active' || officer.protectedUntilTick > tick || blocked(owner.pose, officer.pose)) return false;
    const dx = officer.pose.x - owner.pose.x, dz = officer.pose.z - owner.pose.z, distance = Math.hypot(dx, dz);
    const closing = -(dx * (officer.velocity.x - owner.velocity.x) + dz * (officer.velocity.z - owner.velocity.z)) / Math.max(.001, distance);
    const forward = dx * Math.sin(owner.pose.yaw) + dz * Math.cos(owner.pose.yaw), side = dx * Math.cos(owner.pose.yaw) - dz * Math.sin(owner.pose.yaw);
    return closing > .5 && (kind === 'oil' ? distance < 22 && forward < -3 && Math.abs(side) < 6 : distance < 10 && Math.abs(forward) < 6 && Math.abs(side) < 6);
  });
}
export function inBladeReach(owner: VehicleState, target: VehicleState): boolean {
  const dx = target.pose.x - owner.pose.x, dz = target.pose.z - owner.pose.z;
  const forward = dx * Math.sin(owner.pose.yaw) + dz * Math.cos(owner.pose.yaw), side = dx * Math.cos(owner.pose.yaw) - dz * Math.sin(owner.pose.yaw);
  return Math.abs(forward) < 2.1 && Math.abs(side) >= 1.3 && Math.abs(side) < 2.65;
}
