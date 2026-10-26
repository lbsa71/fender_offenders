import type { DispatchDrivingContext } from './dispatch-features';

export interface RoadGadgetState {
  entityId: string; ownerEntityId: string; kind: 'oil' | 'blades';
  pose: { x: number; z: number; yaw: number };
  bornTick: number; activeAtTick: number; expiresTick: number;
}
export const ROAD_GADGET_RULES = Object.freeze({ oilRadius: 2.75, oilGrip: .45, oilWarningTicks: 45, oilActiveTicks: 300, bladeWarningTicks: 60, bladeActiveTicks: 90, bladeDamage: 8, cooldownTicks: 720, maxActive: 8 });
export function withRoadGadgets(context: DispatchDrivingContext, gadgets: readonly RoadGadgetState[], tick: number): DispatchDrivingContext {
  return { ...context, oilSlicks: gadgets.filter(g => g.kind === 'oil' && tick >= g.activeAtTick && tick < g.expiresTick).map(g => ({ ownerEntityId: g.ownerEntityId, pose: g.pose, radius: ROAD_GADGET_RULES.oilRadius })) };
}
