import { expect, it } from 'vitest';
import { HELICOPTER_RULES, helicopterPoseAt, type VehicleState } from '@fender/contracts';
import { newHelicopter, stepHelicopter, damageHelicopter } from './helicopter';
const bounds={minX:-200,maxX:200,minZ:-200,maxZ:200};
const officer:VehicleState={entityId:'officer',playerId:'p',bodyAssetId:'patrol',pose:{x:0,z:0,yaw:0},velocity:{x:12,z:0,yawRate:0},health:100,status:'active',protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0};
it('swoops, drops velocity-led bombs, departs and returns only in the later bomb dispatches',()=>{
 for(const stage of [0,1,2,3,5,6,7])expect(newHelicopter(stage,0,'h')).toBeNull();
 const runtime=newHelicopter(4,0,'h')!,phases:string[]=[],bombs=[];
 for(let tick=1;tick<=1800;tick++){const drop=stepHelicopter(runtime,[officer],tick,bounds);if(phases.at(-1)!==runtime.state.phase)phases.push(runtime.state.phase);if(drop)bombs.push(drop);}
 expect(phases.filter(p=>p==='approach').length).toBeGreaterThanOrEqual(2);
 expect(phases).toEqual(expect.arrayContaining(['away','approach','attack','depart']));expect(bombs.length).toBeGreaterThanOrEqual(4);
 expect(bombs[0]!.target.x).toBeCloseTo(12*48/60);expect(bombs[0]!.originHeight).toBe(HELICOPTER_RULES.altitude);
});
it('retains shot-down state through future passes and checkpoint copies, with a fresh helper in a new dispatch',()=>{
 const runtime=newHelicopter(8,0,'h')!;for(let tick=1;tick<=300;tick++)stepHelicopter(runtime,[officer],tick,bounds);
 expect(damageHelicopter(runtime,20,300)).toBe(false);expect(runtime.state.health).toBe(40);
 expect(damageHelicopter(runtime,40,301)).toBe(true);expect(runtime.state.phase).toBe('downed');
 const restored=structuredClone(runtime);for(let tick=302;tick<3000;tick++)expect(stepHelicopter(restored,[officer],tick,bounds)).toBeNull();
 expect(restored.state).toMatchObject({health:0,phase:'downed'});expect(newHelicopter(9,3000,'next')!.state.health).toBe(60);
});
it('never targets protected, inactive or absent officers and cannot be shot while away',()=>{
 const runtime=newHelicopter(9,0,'h')!;expect(damageHelicopter(runtime,60,0)).toBe(false);
 for(let tick=1;tick<1200;tick++)expect(stepHelicopter(runtime,[{...officer,protectedUntilTick:9999}],tick,bounds)).toBeNull();
 expect(runtime.state.phase).toBe('away');
});

it.each([4,8])('gives dispatch %i a slow forward firing window without extra bombs',stage=>{
 const runtime=newHelicopter(stage,0,'fair-pass')!;runtime.state.endsAtTick=0;
 const moving=structuredClone(officer);moving.velocity={x:0,z:8,yawRate:0};
 let attackTicks=0,approachSpeed=0,departSpeed=0,drops=0,minAhead=Infinity,maxRelativeSpeed=0;
 let previous:{x:number;z:number}|null=null,previousPhase='';
 for(let tick=0;tick<1800;tick++){
  moving.pose={x:0,z:8*tick/60,yaw:0};
  const drop=stepHelicopter(runtime,[moving],tick,bounds);if(drop)drops++;
  const state=runtime.state,pose=helicopterPoseAt(state,tick);
  const speed=Math.hypot(state.to.x-state.from.x,state.to.z-state.from.z)*60/(state.endsAtTick-state.startedAtTick);
  if(state.phase==='approach')approachSpeed=speed;
  if(state.phase==='attack'){
   attackTicks++;minAhead=Math.min(minAhead,pose.z-moving.pose.z);
   if(previous&&previousPhase==='attack')maxRelativeSpeed=Math.max(maxRelativeSpeed,Math.hypot(pose.x-previous.x,pose.z-moving.pose.z-previous.z)*60);
   previous={x:pose.x,z:pose.z-moving.pose.z};
  }
  previousPhase=state.phase;
  if(state.phase==='depart'){departSpeed=speed;break;}
 }
 expect(approachSpeed,'officers must be able to follow the approaching marker').toBeLessThanOrEqual(stage===8?8:12);
 expect(attackTicks,'ice needs extra time to line up the car').toBeGreaterThanOrEqual(stage===8?540:360);
 expect(minAhead,'the first pass should be reachable by ordinary forward guns').toBeGreaterThanOrEqual(18);
 expect(maxRelativeSpeed,'the marker should cross the officer firing line slowly').toBeLessThanOrEqual(stage===8?2.6:4);
 expect(departSpeed).toBeLessThanOrEqual(stage===8?9:12);
 expect(drops,'a longer shooting window must not multiply the pass bombs').toBe(3);
});
