import { afterEach, beforeAll, expect, it } from 'vitest';
import { neutralActions, type CollisionMap, type PropDefinition, type PropState, type VehicleState } from '@fender/contracts';
import { createSimulation, type Simulation, type SimulationOptions } from '../core/simulation.js';
import { initPhysics } from './rapier.js';
import { createPropPhysics } from './props.js';
const map = (): CollisionMap => ({id:'props-arena',revision:'props-1',bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},colliders:[],surfaces:[],spawns:[{id:'a',pose:{x:0,z:-15,yaw:0},clearanceRadius:5},{id:'b',pose:{x:0,z:15,yaw:0},clearanceRadius:5}],laneNodes:[],laneEdges:[]});
const sims:Simulation[]=[];
function simulation(options:SimulationOptions={},fixture=map()){const sim=createSimulation(fixture,{trafficCount:0,...options});sims.push(sim);return sim;}
beforeAll(initPhysics);afterEach(()=>{sims.splice(0).forEach(sim=>sim.dispose());});
it('falls under real gravity and rests on the ground as an authoritative prop',()=>{
 const sim=simulation({props:[{entityId:'falling-barrel',kind:'barrel',position:{x:0,y:4,z:0}}]} as SimulationOptions);
 for(let i=0;i<45;i++)sim.step(new Map());
 expect(sim.snapshot()).toHaveProperty('props',expect.arrayContaining([expect.objectContaining({entityId:'falling-barrel',kind:'barrel',mode:'dynamic'})]));
 const prop=sim.snapshot().props![0]!;expect(prop.position.y).toBeLessThan(3);expect(prop.position.y).toBeGreaterThan(0);
});

it.each(['barrel','crate','bin','bench'] as const)('lets a car toss a loose %s without changing the arcade car response',kind=>{
 const baseline=simulation(),props=simulation({props:[{entityId:'loose',kind,position:{x:0,y:kind==='barrel'||kind==='bench'?.6:kind==='bin'?.55:.5,z:0}}]});
 const a=baseline.addPlayer({playerId:'a',nickname:'a'}),b=props.addPlayer({playerId:'a',nickname:'a'});
 for(let i=0;i<120;i++){const input={actions:{...neutralActions(),throttle:1},sessionEpoch:'a',sourceCommandSequence:i};baseline.step(new Map([[a.entityId,input]]));props.step(new Map([[b.entityId,input]]));expect(props.authority('a')).toEqual(baseline.authority('a'));}
 const loose=props.snapshot().props![0]!;expect(loose.position.z).toBeGreaterThan(2);expect(loose.mode).toBe('dynamic');
});

it.each(['lamp','sign','tree'] as const)('keeps a %s fixed until real car contact then lets gravity topple it',kind=>{
 const height=kind==='lamp'?2.5:kind==='tree'?2.4:1.5;
 const sim=simulation({props:[{entityId:'anchored',kind,position:{x:0,y:height,z:0}}]});
 for(let i=0;i<120;i++)sim.step(new Map());expect(sim.snapshot().props![0]).toMatchObject({mode:'fixed',position:{x:0,z:0},discontinuityId:0});expect(sim.snapshot().props![0]!.position.y).toBeCloseTo(height,6);
 const car=sim.addPlayer({playerId:'a',nickname:'a'});
 for(let i=0;i<150;i++)sim.step(new Map([[car.entityId,{actions:{...neutralActions(),throttle:1},sessionEpoch:'a',sourceCommandSequence:i}]]));
 const prop=sim.snapshot().props![0]!;expect(prop.mode).toBe('dynamic');expect(prop.discontinuityId).toBe(1);expect(Math.hypot(prop.rotation.x,prop.rotation.z)).toBeGreaterThan(.15);
});

it('preserves complete moving and broken-body Rapier state through checkpoint restore',()=>{
 const sim=simulation({props:[{entityId:'barrel',kind:'barrel',position:{x:0,y:3,z:0}},{entityId:'lamp',kind:'lamp',position:{x:0,y:2.5,z:5}}]});
 const car=sim.addPlayer({playerId:'a',nickname:'a'});
 for(let i=0;i<100;i++)sim.step(new Map([[car.entityId,{actions:{...neutralActions(),throttle:1},sessionEpoch:'a',sourceCommandSequence:i}]]));
 const checkpoint=sim.checkpoint();const run=()=>{for(let i=0;i<90;i++)sim.step(new Map());return{state:sim.snapshot(),events:sim.drainEvents()};};
 sim.drainEvents();const first=run();sim.restore(checkpoint);expect(run()).toEqual(first);
});

it('sweeps a fast car through thin anchored and loose bodies instead of tunnelling',()=>{
 const world=createPropPhysics(map(),[{entityId:'pole',kind:'lamp',position:{x:0,y:2.5,z:0}},{entityId:'barrel',kind:'barrel',position:{x:1,y:.6,z:0}}]);
 const car:VehicleState={entityId:'car',playerId:'car',bodyAssetId:'patrol',pose:{x:0,z:-2.7,yaw:0},velocity:{x:0,z:300,yawRate:0},status:'active',health:100,protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0};
 try{world.step([car]);car.pose.z=2.7;world.step([car]);expect(world.snapshot()[0]!.mode).toBe('dynamic');expect(world.snapshot()[1]!.position.z).toBeGreaterThan(.1);}finally{world.dispose();}
});

it.each(['lamp','sign','tree'] as const)('releases a fixed %s struck by a genuinely thrown barrel after the car has left',kind=>{
 const height=kind==='lamp'?2.5:kind==='tree'?2.4:1.5;
 const world=createPropPhysics(map(),[{entityId:'barrel',kind:'barrel',position:{x:0,y:.6,z:0}},{entityId:'fixed',kind,position:{x:0,y:height,z:3}}]);
 const car:VehicleState={entityId:'car',playerId:'car',bodyAssetId:'patrol',pose:{x:0,z:-3,yaw:0},velocity:{x:0,z:20,yawRate:0},status:'active',health:100,protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0};
 try{
  world.step([car]);car.pose.z=-2;world.step([car]);
  expect(world.snapshot()[1]!.mode).toBe('fixed');
  for(let i=0;i<180;i++)world.step([]);
  const fallen=world.snapshot()[1]!;expect(fallen.mode).toBe('dynamic');expect(fallen.discontinuityId).toBe(1);expect(Math.hypot(fallen.rotation.x,fallen.rotation.z)).toBeGreaterThan(.15);
 }finally{world.dispose();}
});

it('does not release fixed props from floor support or a barrel gently resting against the post',()=>{
 const world=createPropPhysics(map(),[{entityId:'barrel',kind:'barrel',position:{x:0,y:.6,z:-.55}},{entityId:'lamp',kind:'lamp',position:{x:0,y:2.5,z:0}}]);
 try{for(let i=0;i<300;i++)world.step([]);expect(world.snapshot()[1]!.mode).toBe('fixed');}finally{world.dispose();}
});

it('rests and sleeps loose props on the floor, and blocks a thrown barrel on building geometry',()=>{
 const ground=simulation({props:[{entityId:'resting',kind:'crate',position:{x:0,y:4,z:0}}]});
 for(let i=0;i<900;i++)ground.step(new Map());
 expect(ground.snapshot().props![0]).toMatchObject({sleeping:true});expect(ground.snapshot().props![0]!.position.y).toBeCloseTo(.5,1);
 const fixture=map();fixture.colliders.push({id:'building-wall',shape:'box',pose:{x:0,z:4,yaw:0},halfExtents:{x:15,y:3,z:.1},layer:'world-solid',surface:'asphalt'});
 const wall=simulation({props:[{entityId:'barrel',kind:'barrel',position:{x:0,y:.6,z:0}}]},fixture),car=wall.addPlayer({playerId:'a',nickname:'a'});
 for(let i=0;i<180;i++)wall.step(new Map([[car.entityId,{actions:{...neutralActions(),throttle:1},sessionEpoch:'a',sourceCommandSequence:i}]]));
 expect(wall.snapshot().props![0]!.position.z).toBeLessThan(4);expect(wall.snapshot().props![0]!.position.y).toBeGreaterThan(0);
});

it('does not break an upright tree when a car passes beside its trunk under the high crown',()=>{
 const world=createPropPhysics(map(),[{entityId:'tree',kind:'tree',position:{x:0,y:2.4,z:0}}]);
 const car:VehicleState={entityId:'car',playerId:'car',bodyAssetId:'patrol',pose:{x:1.8,z:-4,yaw:0},velocity:{x:0,z:12,yawRate:0},status:'active',health:100,protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0};
 try{for(let i=0;i<40;i++){world.step([car]);car.pose.z+=.2;}expect(world.snapshot()[0]!.mode).toBe('fixed');}finally{world.dispose();}
});

it('resets stable prop IDs and discontinuities across rounds without leaking bodies or snapshot ownership',()=>{
 const sim=simulation({mode:'multiplayer',props:[{entityId:'barrel',kind:'barrel',position:{x:0,y:3,z:0}}]});
 sim.addPlayer({playerId:'a',nickname:'a'});sim.addPlayer({playerId:'b',nickname:'b'});
 for(let i=0;i<45;i++)sim.step(new Map());expect(sim.snapshot().props![0]!.position.y).toBeLessThan(3);
 expect(sim.startRound('a')).toBe(true);const first=sim.snapshot().props![0]!;expect(first.position.y).toBe(3);expect(first.discontinuityId).toBe(1);
 first.position.y=99;expect(sim.snapshot().props![0]!.position.y).toBe(3);
 const results=sim.checkpoint();results.state.phase='results';sim.restore(results);expect(sim.rematch('a')).toBe(true);
 expect(sim.snapshot().props![0]).toMatchObject({entityId:'barrel',discontinuityId:2,position:{y:3}});
 sim.dispose();sim.dispose();expect(()=>sim.snapshot()).toThrow('disposed');
});

it('rejects excessive, duplicate and non-finite prop authoring before creating a live world',()=>{
 const good:PropDefinition={entityId:'same',kind:'barrel',position:{x:0,y:.6,z:0}};
 expect(()=>simulation({props:[good,good]})).toThrow('props');
 expect(()=>simulation({props:[{...good,position:{x:NaN,y:0,z:0}}]})).toThrow('prop');
 expect(()=>simulation({props:Array.from({length:193},(_,i)=>({...good,entityId:String(i)}))})).toThrow('props');
});

it('rejects a checkpoint authored for different prop geometry without mutating the live simulation',()=>{
 const a=simulation({props:[{entityId:'same',kind:'barrel',position:{x:0,y:.6,z:0}}]});
 const b=simulation({props:[{entityId:'same',kind:'tree',position:{x:0,y:2.4,z:0}}]});
 const before=b.snapshot();expect(()=>b.restore(a.checkpoint())).toThrow('prop');expect(b.snapshot()).toEqual(before);
});
it('attaches the final authoritative pose, body and discontinuity to wreck effects',()=>{
 const sim=simulation(),a=sim.addPlayer({playerId:'a',nickname:'a'});sim.addPlayer({playerId:'b',nickname:'b',bodyAssetId:'roadster'});
 const c=sim.checkpoint();for(const r of c.state.records)r.vehicle.protectedUntilTick=0;
 c.state.records[1]!.vehicle.pose={x:0,z:0,yaw:0};c.state.records[1]!.vehicle.health=10;c.state.records[1]!.vehicle.discontinuityId=4;sim.restore(c);
 sim.step(new Map([[a.entityId,{actions:{...neutralActions(),fire:true},sessionEpoch:'a',sourceCommandSequence:0}]]));for(let i=0;i<20;i++)sim.step(new Map());
 expect(sim.drainEvents().find(event=>event.kind==='wreck')).toMatchObject({payload:{position:{x:0,z:0,yaw:0},bodyAssetId:'roadster',discontinuityId:4}});
});
