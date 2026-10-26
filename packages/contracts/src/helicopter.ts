import type { PlanarPose } from './index';
export interface HelicopterState {
 entityId:string;dispatchIndex:number;phase:'away'|'approach'|'attack'|'depart'|'downed';health:number;
 from:{x:number;z:number};to:{x:number;z:number};yaw:number;startedAtTick:number;endsAtTick:number;
}
export const HELICOPTER_RULES=Object.freeze({health:60,altitude:18,hitRadius:2.5,firstDelayTicks:240,approachTicks:120,attackTicks:150,departTicks:120,returnTicks:300,bombIntervalTicks:54});
export function helicopterPoseAt(state:HelicopterState,tick:number):PlanarPose{
 const t=Math.max(0,Math.min(1,(tick-state.startedAtTick)/Math.max(1,state.endsAtTick-state.startedAtTick)));
 return {x:state.from.x+(state.to.x-state.from.x)*t,z:state.from.z+(state.to.z-state.from.z)*t,yaw:state.yaw};
}
