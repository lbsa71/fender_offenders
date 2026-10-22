import type { CollisionMap, DriverActions, VehicleState } from '@fender/contracts';
import { clamp, wrapAngle } from '../physics/geometry.js';
import { neutralActions } from '../vehicles/controller.js';

export interface TrafficRuntime { edgeIndex: number; jamTicks: number; suspect: boolean }

export function trafficInput(vehicle: VehicleState, runtime: TrafficRuntime, map: CollisionMap): DriverActions {
  const actions = neutralActions();
  let edge = map.laneEdges[runtime.edgeIndex];
  if (!edge) return actions;
  let target = map.laneNodes.find(n => n.id === edge!.to)!;
  if (Math.hypot(target.x - vehicle.pose.x, target.z - vehicle.pose.z) < 11) {
    const next = map.laneEdges.findIndex(e => e.from === edge!.to);
    if (next >= 0) { runtime.edgeIndex = next; edge = map.laneEdges[next]!; target = map.laneNodes.find(n => n.id === edge!.to)!; }
  }
  const difference = wrapAngle(Math.atan2(target.x - vehicle.pose.x, target.z - vehicle.pose.z) - vehicle.pose.yaw);
  actions.steer = clamp(difference * 2.1, -1, 1);
  const targetSpeed = Math.min(edge.speedLimit, runtime.suspect ? 12 : 10) * (Math.abs(difference) > 0.6 ? 0.65 : 1);
  const speed = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
  actions.throttle = speed < targetSpeed ? 0.65 : 0;
  actions.brakeReverse = speed > targetSpeed + 1 ? 0.5 : 0;
  runtime.jamTicks = speed < 1 ? runtime.jamTicks + 1 : 0;
  return actions;
}
