import type { DispatchDrivingContext } from './dispatch-features';

export interface SmogExposure { vehicleId: string; bornTick: number; expiresTick: number }
export interface RoadGadgetState {
  entityId: string; ownerEntityId: string; kind: 'oil' | 'blades' | 'smog';
  pose: { x: number; z: number; yaw: number };
  bornTick: number; activeAtTick: number; expiresTick: number;
  exposures?: SmogExposure[];
}
export const SMOG_RULES = Object.freeze({ radius:5, warningTicks:60, cloudTicks:180, envelopeTicks:24, fadeInTicks:12, blindTicks:150, fadeOutTicks:24, exposureTicks:210, immunityTicks:1080, cooldownTicks:1080, maxClouds:4, maxPuffs:128 });
export function smogExposureAt(gadgets:readonly RoadGadgetState[],vehicleId:string,tick:number):SmogExposure|null {
  for(const g of gadgets)if(g.kind==='smog'&&tick<g.expiresTick)for(const e of g.exposures??[])if(e.vehicleId===vehicleId&&tick>=e.bornTick&&tick<e.expiresTick)return e;
  return null;
}
export function smogVisibility(exposure:SmogExposure|null,tick:number):{fog:number;white:number;phase:'fog'|'whiteout'|'clearing'|'clear'} {
  if(!exposure||!Number.isFinite(tick)||tick<exposure.bornTick||tick>=exposure.expiresTick)return {fog:0,white:0,phase:'clear'};
  const age=tick-exposure.bornTick,fade=SMOG_RULES.envelopeTicks,hold=fade+SMOG_RULES.fadeInTicks,end=hold+SMOG_RULES.blindTicks;
  const white=Math.max(0,Math.min(1,age<hold?(age-fade)/SMOG_RULES.fadeInTicks:age<end?1:(exposure.expiresTick-tick)/SMOG_RULES.fadeOutTicks));
  return {fog:Math.min(.88,(age+1)/fade*.88)*(1-white),white,phase:age<fade?'fog':age<end?'whiteout':'clearing'};
}
export const ROAD_GADGET_RULES = Object.freeze({ oilRadius: 2.75, oilGrip: .45, oilWarningTicks: 45, oilActiveTicks: 300, bladeWarningTicks: 60, bladeActiveTicks: 90, bladeDamage: 8, cooldownTicks: 720, maxActive: 8 });
export function withRoadGadgets(context: DispatchDrivingContext, gadgets: readonly RoadGadgetState[], tick: number): DispatchDrivingContext {
  return { ...context, oilSlicks: gadgets.filter(g => g.kind === 'oil' && tick >= g.activeAtTick && tick < g.expiresTick).map(g => ({ ownerEntityId: g.ownerEntityId, pose: g.pose, radius: ROAD_GADGET_RULES.oilRadius })) };
}
