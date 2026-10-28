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
 expect(bombs[0]!.target.x).toBeCloseTo(12*48/60);expect(bombs[0]!.originHeight).toBeGreaterThanOrEqual(HELICOPTER_RULES.firingAltitude);expect(bombs[0]!.originHeight).toBeLessThanOrEqual(11);
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
 let attackTicks=0,approachSpeed=0,departSpeed=0,drops=0,minAhead=Infinity,maxAhead=-Infinity,maxRelativeSpeed=0;
 let previous:{x:number;z:number}|null=null,previousPhase='';
 for(let tick=0;tick<1800;tick++){
  moving.pose={x:0,z:8*tick/60,yaw:0};
  const drop=stepHelicopter(runtime,[moving],tick,bounds);if(drop)drops++;
  const state=runtime.state,pose=helicopterPoseAt(state,tick);
  const speed=Math.hypot(state.to.x-state.from.x,state.to.z-state.from.z)*60/(state.endsAtTick-state.startedAtTick);
  if(state.phase==='approach')approachSpeed=speed;
  if(state.phase==='attack'){
   attackTicks++;minAhead=Math.min(minAhead,pose.z-moving.pose.z);maxAhead=Math.max(maxAhead,pose.z-moving.pose.z);
   if(previous&&previousPhase==='attack')maxRelativeSpeed=Math.max(maxRelativeSpeed,Math.hypot(pose.x-previous.x,pose.z-moving.pose.z-previous.z)*60);
   previous={x:pose.x,z:pose.z-moving.pose.z};
  }
  previousPhase=state.phase;
  if(state.phase==='depart'){departSpeed=speed;break;}
 }
 expect(approachSpeed,'officers must be able to follow the approaching marker').toBeLessThanOrEqual(stage===8?8:12);
 expect(attackTicks,'ice needs extra time to line up the car').toBeGreaterThanOrEqual(stage===8?540:360);
 expect(minAhead,'the firing run must stay in front of the officer').toBeGreaterThanOrEqual(5);
 expect(maxAhead,'the aircraft must stay close enough for the driving camera').toBeLessThanOrEqual(18);
 expect(maxRelativeSpeed,'the marker should cross the officer firing line slowly').toBeLessThanOrEqual(stage===8?2.6:4);
 expect(departSpeed).toBeLessThanOrEqual(stage===8?9:12);
 expect(drops,'a longer shooting window must not multiply the pass bombs').toBe(3);
});

it.each([4,8])('offers a reachable firing window after the officer accelerates or changes course in dispatch %i',stage=>{
 const approachTicks=stage===8?HELICOPTER_RULES.snowApproachTicks:HELICOPTER_RULES.approachTicks;
 for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const manoeuvre of ['steady','fast','accelerate','stop','approach-turn','attack-turn'] as const){
  const runtime=newHelicopter(stage,0,'intercept')!;runtime.state.endsAtTick=0;
  const moving=structuredClone(officer);moving.pose={x:0,z:0,yaw:heading};
  let streak=0,longest=0,attackStarted:number|null=null,drops=0,previous:{x:number;z:number}|null=null;
  for(let tick=0;tick<1600;tick++){
   const turning=manoeuvre==='approach-turn'?tick>=120:manoeuvre==='attack-turn'&&tick>=approachTicks+60;
   moving.pose.yaw=heading+(turning?Math.PI/2:0);
   const speed=manoeuvre==='fast'?26:manoeuvre==='stop'&&tick>=120?0:manoeuvre==='accelerate'&&tick>=120?22:12;
   moving.velocity={x:Math.sin(moving.pose.yaw)*speed,z:Math.cos(moving.pose.yaw)*speed,yawRate:0};
   if(tick){moving.pose.x+=moving.velocity.x/60;moving.pose.z+=moving.velocity.z/60;}
   const drop=stepHelicopter(runtime,[moving],tick,{minX:-2000,maxX:2000,minZ:-2000,maxZ:2000});if(drop)drops++;
   const pose=helicopterPoseAt(runtime.state,tick);
   if(previous)expect(Math.hypot(pose.x-previous.x,pose.z-previous.z),`${manoeuvre}: course corrections must not teleport the aircraft`).toBeLessThan(.85);
   previous=pose;
   if(runtime.state.phase==='attack'){
    attackStarted??=tick;const dx=pose.x-moving.pose.x,dz=pose.z-moving.pose.z,fx=Math.sin(moving.pose.yaw),fz=Math.cos(moving.pose.yaw);
    const ahead=dx*fx+dz*fz,lateral=Math.abs(dx*fz-dz*fx);
    streak=ahead>=5&&ahead<=24&&lateral<=2.5?streak+1:0;longest=Math.max(longest,streak);
   }
   if(runtime.state.phase==='depart')break;
  }
  expect(attackStarted).not.toBeNull();expect(longest,`${manoeuvre}, heading ${heading}: ordinary forward guns need a two-second opportunity`).toBeGreaterThanOrEqual(120);expect(drops).toBe(3);
 }
});

it('keeps a course moving across ordinary packet delay at its next correction boundary',()=>{
 const runtime=newHelicopter(4,0,'buffered-intercept')!;runtime.state.endsAtTick=0;
 const moving=structuredClone(officer);moving.velocity={x:0,z:12,yawRate:0};
 const boundary=HELICOPTER_RULES.approachTicks+89;
 for(let tick=0;tick<=boundary;tick++){moving.pose={x:0,z:12*tick/60,yaw:0};stepHelicopter(runtime,[moving],tick,bounds);}
 const a=helicopterPoseAt(runtime.state,boundary+12),b=helicopterPoseAt(runtime.state,boundary+18);
 expect(Math.hypot(b.x-a.x,b.z-a.z),'A delayed course snapshot must not freeze the aircraft at every handoff').toBeGreaterThan(.5);
});

it('varies the entry side between encounters instead of repeating the same shooting setup',()=>{
 const entries=[4,8,9].map(stage=>{const runtime=newHelicopter(stage,0,'varied')!;runtime.state.endsAtTick=0;stepHelicopter(runtime,[{...officer,velocity:{x:0,z:0,yawRate:0}}],0,bounds);return Math.sign(runtime.state.from.x);});
 expect(new Set(entries).size).toBe(2);
});

it('restores an in-progress intercept and its bomb budget deterministically',()=>{
 const original=newHelicopter(8,0,'checkpoint-air')!;original.state.endsAtTick=0;
 const moving=structuredClone(officer);
 const advance=(runtime:ReturnType<typeof newHelicopter>,tick:number)=>{moving.pose={x:tick<200?0:(tick-200)/5,z:Math.min(200,tick)/5,yaw:tick<200?0:Math.PI/2};moving.velocity={x:tick<200?0:12,z:tick<200?12:0,yawRate:0};return stepHelicopter(runtime!,[moving],tick,bounds);};
 for(let tick=0;tick<430;tick++)advance(original,tick);
 const restored=structuredClone(original);
 for(let tick=430;tick<1400;tick++){expect(advance(restored,tick)).toEqual(advance(original,tick));expect(restored.state).toEqual(original.state);}
});
