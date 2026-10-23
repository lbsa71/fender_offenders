export interface CartoonMotion {lean:number;scaleX:number;scaleY:number;scaleZ:number;heave:number;pitch:number;bumpAge:number;bumpStrength:number;bumpCooldown:number;turnCooldown:number;turnArmed:boolean;cue:'boing'|'squeak'|null}
export interface CartoonInput {speed:number;yawRate:number;bump:boolean;reducedMotion:boolean}
export interface RoadBump {id:string;x:number;z:number;yaw:number;width:number;length:number;height:number}
export const newCartoonMotion=():CartoonMotion=>({lean:0,scaleX:1,scaleY:1,scaleZ:1,heave:0,pitch:0,bumpAge:10,bumpStrength:0,bumpCooldown:0,turnCooldown:0,turnArmed:true,cue:null});
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
/** Pure cosmetic sampling: never modifies a pose, velocity, health or collision shape. */
export function stepCartoonMotion(state:CartoonMotion,input:CartoonInput,delta:number):CartoonMotion{
  const dt=clamp(Number.isFinite(delta)?delta:0,0,.1);
  if(dt===0)return {...state,cue:null};
  if(input.reducedMotion)return {...newCartoonMotion(),turnArmed:false};
  const speed=Number.isFinite(input.speed)?Math.abs(input.speed):0;
  const lateral=speed>.5?clamp(speed*(Number.isFinite(input.yawRate)?input.yawRate:0)/30,-1,1):0;
  let lean=state.lean+(.30*lateral-state.lean)*(1-Math.exp(-10*dt));if(Math.abs(lean)<.000001)lean=0;
  let bumpAge=Math.min(10,state.bumpAge+dt),bumpStrength=state.bumpStrength;
  let bumpCooldown=Math.max(0,state.bumpCooldown-dt),turnCooldown=Math.max(0,state.turnCooldown-dt);
  let turnArmed=state.turnArmed||Math.abs(lateral)<.2,cue:CartoonMotion['cue']=null;
  if(speed>6&&Math.abs(lateral)>.55&&turnArmed&&turnCooldown===0){cue='squeak';turnCooldown=1.2;turnArmed=false;}
  if(input.bump&&speed>2&&bumpCooldown===0){bumpAge=dt;bumpStrength=clamp(speed/22,.22,1);bumpCooldown=.9;cue='boing';}
  let pulse=0;
  if(bumpAge<.1)pulse=-.22*Math.sin(Math.PI*bumpAge/.1);
  else if(bumpAge<.35)pulse=.28*Math.sin(Math.PI*(bumpAge-.1)/.25);
  else if(bumpAge<.75)pulse=-.09*Math.sin(Math.PI*(bumpAge-.35)/.4)*(1-(bumpAge-.35)/.4);
  pulse*=bumpStrength;
  const corner=Math.abs(lean)/.3;
  const heave=bumpAge>.1&&bumpAge<.65?.48*bumpStrength*Math.sin(Math.PI*(bumpAge-.1)/.55):bumpAge<.1?pulse*.22:0;
  return{lean,scaleX:clamp(1+corner*.17-pulse*.35,.85,1.3),scaleY:clamp(1-corner*.13+pulse,.68,1.32),scaleZ:clamp(1+corner*.07-pulse*.25,.88,1.22),heave,pitch:bumpAge<.7?Math.sin(bumpAge/.7*Math.PI*2)*.09*bumpStrength:0,bumpAge,bumpStrength,bumpCooldown,turnCooldown,turnArmed,cue};
}
/** Segment crossing rather than overlap prevents idle/repeated-frame impulses. */
export function crossedRoadBump(previous:{x:number;z:number},current:{x:number;z:number},bump:RoadBump):boolean{
  const dx=current.x-previous.x,dz=current.z-previous.z;
  if(dx*dx+dz*dz>144||dx*dx+dz*dz<.000001)return false;
  const sin=Math.sin(bump.yaw),cos=Math.cos(bump.yaw);
  const before=(previous.x-bump.x)*sin+(previous.z-bump.z)*cos;
  const after=(current.x-bump.x)*sin+(current.z-bump.z)*cos;
  if(!(before<0&&after>=0||before>0&&after<=0))return false;
  const t=before/(before-after),x=previous.x+dx*t-bump.x,z=previous.z+dz*t-bump.z;
  return Math.abs(x*cos-z*sin)<=bump.width/2;
}
