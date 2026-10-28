import { HELICOPTER_RULES, helicopterPoseAt, helicopterHeightAt, getDispatchFeatures, type HelicopterState, type VehicleState, type PlanarPose, type CollisionMap } from '@fender/contracts';
import { predictedBombTarget } from './boss-ai';
interface FlightPlan {
 phase:HelicopterState['phase'];startedAtTick:number;endsAtTick:number;nextCourseTick:number;pass:number;
 side:number;lateral:number;ahead:number;velocity:{x:number;z:number};
}
export interface HelicopterRuntime { state:HelicopterState;nextBombTick:number;targetId:string|null;flight?:FlightPlan }
export interface HelicopterDrop {origin:PlanarPose;target:PlanarPose;originHeight:number}
export function newHelicopter(dispatchIndex:number,tick:number,entityId:string):HelicopterRuntime|null{
 if(![4,8,9].includes(dispatchIndex))return null;
 return {state:{entityId,dispatchIndex,phase:'away',health:HELICOPTER_RULES.health,from:{x:0,z:0},to:{x:0,z:0},yaw:0,startedAtTick:tick,endsAtTick:tick+HELICOPTER_RULES.firstDelayTicks},nextBombTick:0,targetId:null};
}
export function stepHelicopter(runtime:HelicopterRuntime,officers:readonly VehicleState[],tick:number,bounds:CollisionMap['bounds']):HelicopterDrop|null{
 const state=runtime.state;if(state.phase==='downed')return null;
 const targets=officers.filter(v=>v.playerId!==null&&v.status==='active'&&v.protectedUntilTick<=tick).sort((a,b)=>a.entityId.localeCompare(b.entityId));
 let target=targets.find(v=>v.entityId===runtime.targetId)??targets[0];
 const inside=(p:{x:number;z:number})=>({x:Math.max(bounds.minX+4,Math.min(bounds.maxX-4,p.x)),z:Math.max(bounds.minZ+4,Math.min(bounds.maxZ-4,p.z))});
 const winter=getDispatchFeatures(state.dispatchIndex).winterRoads;
 const offset=(p:{x:number;z:number},side:number,ahead:number)=>{
  const yaw=target?.pose.yaw??state.yaw;
  return{x:p.x+Math.cos(yaw)*side+Math.sin(yaw)*ahead,z:p.z-Math.sin(yaw)*side+Math.cos(yaw)*ahead};
 };
 let flight=runtime.flight;
 if(!flight||flight.phase!==state.phase){
  const seconds=Math.max(1/60,(state.endsAtTick-state.startedAtTick)/60);
  flight=runtime.flight={phase:state.phase,startedAtTick:state.startedAtTick,endsAtTick:state.endsAtTick,nextCourseTick:state.endsAtTick,pass:flight?.pass??0,side:1,lateral:5,ahead:9,velocity:{x:(state.to.x-state.from.x)/seconds,z:(state.to.z-state.from.z)/seconds}};
 }
 const fly=(phase:HelicopterState['phase'],from:{x:number;z:number},to:{x:number;z:number},duration:number,fromHeight:number,toHeight:number)=>{
  Object.assign(state,{phase,from:inside(from),to:inside(to),startedAtTick:tick,endsAtTick:tick+duration,fromHeight,toHeight});
  if(Math.hypot(state.to.x-state.from.x,state.to.z-state.from.z)>.01)state.yaw=Math.atan2(state.to.x-state.from.x,state.to.z-state.from.z);
 };
 const begin=(phase:HelicopterState['phase'],duration:number)=>{
  flight!.phase=phase;flight!.startedAtTick=tick;flight!.endsAtTick=tick+duration;flight!.nextCourseTick=tick;
 };
 if(tick>=flight.endsAtTick){
  const current=helicopterPoseAt(state,tick),height=helicopterHeightAt(state,tick);
  if(state.phase==='away'){
   if(!target)return null;
   flight.pass++;target=targets[(flight.pass-1)%targets.length]!;runtime.targetId=target.entityId;
   const variant=flight.pass+state.dispatchIndex;
   flight.side=variant%2?1:-1;flight.lateral=4+(variant%3)*.5;flight.ahead=8+(variant%3)*.5;
   flight.velocity={x:target.velocity.x,z:target.velocity.z};
   begin('approach',winter?HELICOPTER_RULES.snowApproachTicks:HELICOPTER_RULES.approachTicks);
   const entry=offset(target.pose,-flight.side*22,flight.ahead);
   fly('approach',entry,entry,0,HELICOPTER_RULES.altitude,HELICOPTER_RULES.altitude);
  }else if(state.phase==='approach'){
   begin('attack',winter?HELICOPTER_RULES.snowAttackTicks:HELICOPTER_RULES.attackTicks);
   fly('attack',current,current,0,height,height);runtime.nextBombTick=tick;
  }else if(state.phase==='attack'){
   const duration=winter?HELICOPTER_RULES.snowDepartTicks:HELICOPTER_RULES.departTicks;
   begin('depart',duration);fly('depart',current,offset(current,flight.side*35,18),duration,height,HELICOPTER_RULES.altitude);
  }else{begin('away',HELICOPTER_RULES.returnTicks);fly('away',current,current,HELICOPTER_RULES.returnTicks,height,height);}
 }
 // Correct course between committed legs, never in response to aiming or firing.
 if((state.phase==='approach'||state.phase==='attack')&&target&&tick>=flight.nextCourseTick){
  const current=helicopterPoseAt(state,tick),height=helicopterHeightAt(state,tick);
  const duration=Math.min(state.phase==='approach'?60:90,flight.endsAtTick-tick),seconds=duration/60;
  const progress=Math.min(1,(tick+duration-flight.startedAtTick)/(flight.endsAtTick-flight.startedAtTick));
  const side=flight.side*flight.lateral*(state.phase==='approach'?-1:2*progress-1);
  const lead={x:target.pose.x+target.velocity.x*seconds,z:target.pose.z+target.velocity.z*seconds};
  const goal=inside(offset(lead,side,flight.ahead));
  let dx=(goal.x-current.x)/seconds-target.velocity.x,dz=(goal.z-current.z)/seconds-target.velocity.z;
  const correction=Math.hypot(dx,dz),limit=state.phase==='approach'?8:10;
  if(correction>limit){dx*=limit/correction;dz*=limit/correction;}
  const desired={x:target.velocity.x+dx,z:target.velocity.z+dz},change={x:desired.x-flight.velocity.x,z:desired.z-flight.velocity.z};
  const acceleration=Math.hypot(change.x,change.z),fraction=Math.min(1,16*seconds/Math.max(.001,acceleration));
  flight.velocity.x+=change.x*fraction;flight.velocity.z+=change.z*fraction;
  // Publish continuation beyond the next handoff so latency cannot turn each leg into a stop/start.
  flight.nextCourseTick=tick+duration;
  const horizon=duration*2,horizonSeconds=horizon/60,nextHeight=Math.max(HELICOPTER_RULES.firingAltitude,height-2.5*horizonSeconds);
  fly(state.phase,current,{x:current.x+flight.velocity.x*horizonSeconds,z:current.z+flight.velocity.z*horizonSeconds},horizon,height,nextHeight);
 }
 if(state.phase!=='attack'||!target||tick<runtime.nextBombTick||tick>=flight.startedAtTick+HELICOPTER_RULES.bombsPerPass*HELICOPTER_RULES.bombIntervalTicks)return null;
 runtime.nextBombTick=tick+HELICOPTER_RULES.bombIntervalTicks;
 const targetPose=predictedBombTarget(target,48);Object.assign(targetPose,inside(targetPose));
 return {origin:helicopterPoseAt(state,tick),target:targetPose,originHeight:helicopterHeightAt(state,tick)};
}
export function damageHelicopter(runtime:HelicopterRuntime,damage:number,tick:number):boolean{
 const state=runtime.state;if(state.phase==='away'||state.phase==='downed'||!Number.isFinite(damage)||damage<=0)return false;
 state.health=Math.max(0,state.health-damage);if(state.health)return false;
 const pose=helicopterPoseAt(state,tick),height=helicopterHeightAt(state,tick);state.phase='downed';state.from={x:pose.x,z:pose.z};state.to={...state.from};state.startedAtTick=tick;state.endsAtTick=tick+90;state.fromHeight=height;state.toHeight=0;return true;
}
