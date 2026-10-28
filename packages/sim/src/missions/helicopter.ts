import { HELICOPTER_RULES, helicopterPoseAt, getDispatchFeatures, type HelicopterState, type VehicleState, type PlanarPose, type CollisionMap } from '@fender/contracts';
import { predictedBombTarget } from './boss-ai';
export interface HelicopterRuntime { state:HelicopterState;nextBombTick:number;targetId:string|null }
export interface HelicopterDrop {origin:PlanarPose;target:PlanarPose;originHeight:number}
export function newHelicopter(dispatchIndex:number,tick:number,entityId:string):HelicopterRuntime|null{
 if(![4,8,9].includes(dispatchIndex))return null;
 return {state:{entityId,dispatchIndex,phase:'away',health:HELICOPTER_RULES.health,from:{x:0,z:0},to:{x:0,z:0},yaw:0,startedAtTick:tick,endsAtTick:tick+HELICOPTER_RULES.firstDelayTicks},nextBombTick:0,targetId:null};
}
export function stepHelicopter(runtime:HelicopterRuntime,officers:readonly VehicleState[],tick:number,bounds:CollisionMap['bounds']):HelicopterDrop|null{
 const state=runtime.state;if(state.phase==='downed')return null;
 const targets=officers.filter(v=>v.playerId!==null&&v.status==='active'&&v.protectedUntilTick<=tick).sort((a,b)=>a.entityId.localeCompare(b.entityId));
 const target=targets.find(v=>v.entityId===runtime.targetId)??targets[0];
 const inside=(p:{x:number;z:number})=>({x:Math.max(bounds.minX+4,Math.min(bounds.maxX-4,p.x)),z:Math.max(bounds.minZ+4,Math.min(bounds.maxZ-4,p.z))});
 const fly=(phase:HelicopterState['phase'],from:{x:number;z:number},to:{x:number;z:number},duration:number)=>{
  state.phase=phase;state.from=inside(from);state.to=inside(to);state.yaw=Math.atan2(state.to.x-state.from.x,state.to.z-state.from.z);state.startedAtTick=tick;state.endsAtTick=tick+duration;
 };
 if(tick>=state.endsAtTick){
  const winter=getDispatchFeatures(state.dispatchIndex).winterRoads;
  const approachTicks=winter?HELICOPTER_RULES.snowApproachTicks:HELICOPTER_RULES.approachTicks;
  const attackTicks=winter?HELICOPTER_RULES.snowAttackTicks:HELICOPTER_RULES.attackTicks;
  const departTicks=winter?HELICOPTER_RULES.snowDepartTicks:HELICOPTER_RULES.departTicks;
  const yaw=target?.pose.yaw??state.yaw,forward={x:Math.sin(yaw),z:Math.cos(yaw)},right={x:Math.cos(yaw),z:-Math.sin(yaw)};
  const offset=(p:{x:number;z:number},side:number,ahead:number)=>({x:p.x+right.x*side+forward.x*ahead,z:p.z+right.z*side+forward.z*ahead});
  const current=helicopterPoseAt(state,tick);
  if(state.phase==='away'){
   if(!target)return null;runtime.targetId=target.entityId;
   // Sample the officer's course for this immutable pass, including the approach time.
   const lead={x:target.pose.x+target.velocity.x*approachTicks/60,z:target.pose.z+target.velocity.z*approachTicks/60};
   fly('approach',offset(lead,-50,26),offset(lead,-10,24),approachTicks);
  }else if(state.phase==='approach'){
   const end=offset(current,20,0);end.x+=(target?.velocity.x??0)*attackTicks/60;end.z+=(target?.velocity.z??0)*attackTicks/60;
   fly('attack',current,end,attackTicks);runtime.nextBombTick=tick;
  }else if(state.phase==='attack')fly('depart',current,offset(current,50,25),departTicks);
  else fly('away',current,current,HELICOPTER_RULES.returnTicks);
 }
 if(state.phase!=='attack'||!target||tick<runtime.nextBombTick||tick>=state.startedAtTick+HELICOPTER_RULES.bombsPerPass*HELICOPTER_RULES.bombIntervalTicks)return null;
 runtime.nextBombTick=tick+HELICOPTER_RULES.bombIntervalTicks;
 const targetPose=predictedBombTarget(target,48);Object.assign(targetPose,inside(targetPose));
 return {origin:helicopterPoseAt(state,tick),target:targetPose,originHeight:HELICOPTER_RULES.altitude};
}
export function damageHelicopter(runtime:HelicopterRuntime,damage:number,tick:number):boolean{
 const state=runtime.state;if(state.phase==='away'||state.phase==='downed'||!Number.isFinite(damage)||damage<=0)return false;
 state.health=Math.max(0,state.health-damage);if(state.health)return false;
 const pose=helicopterPoseAt(state,tick);state.phase='downed';state.from={x:pose.x,z:pose.z};state.to={...state.from};state.startedAtTick=tick;state.endsAtTick=tick+90;return true;
}
