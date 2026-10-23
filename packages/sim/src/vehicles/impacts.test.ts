import {beforeAll,describe,expect,it} from 'vitest';
import {neutralActions,type CollisionMap,type GameEvent,type VehicleState} from '@fender/contracts';
import {createSimulation} from '../core/simulation';
import {initPhysics} from '../physics/rapier';
import {box} from '../physics/geometry';
import {resolveStatic,resolveVehicleContacts} from './controller';

const map=():CollisionMap=>({id:'impact-arena',revision:'impact-1',bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},colliders:[],surfaces:[],spawns:[{id:'a',pose:{x:0,z:-30,yaw:0},clearanceRadius:5},{id:'b',pose:{x:0,z:30,yaw:Math.PI},clearanceRadius:5}],laneNodes:[],laneEdges:[]});
const car=(id:string,z:number,vz:number):VehicleState=>({entityId:id,playerId:id,bodyAssetId:'patrol',pose:{x:0,z,yaw:0},velocity:{x:0,z:vz,yawRate:0},health:100,maxHealth:100,status:'active',protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0});
type Impact={vehicleId:string;normal:{x:number;z:number};speed:number};
beforeAll(initPhysics);
describe('real collision impact observations',()=>{
 it('reports the closing wall normal/speed while retaining the same collision response',()=>{
  const a=car('a',-3,16),baseline=structuredClone(a),solid=box({x:0,z:0,yaw:0},20,1),hits:Impact[]=[];
  resolveStatic(baseline,map(),[solid]);resolveStatic(a,map(),[solid],impact=>hits.push(impact));
  expect(hits).toHaveLength(1);expect(hits[0]).toMatchObject({vehicleId:'a',normal:{x:0,z:-1},speed:16});
  expect(a).toEqual(baseline);expect(a.health).toBe(100);
 });
 it('reports boundary impacts but ignores stationary/tangential overlap',()=>{
  const boundary=car('edge',-20,0),hits:Impact[]=[];boundary.pose.x=99.5;boundary.velocity.x=12;
  resolveStatic(boundary,map(),[],impact=>hits.push(impact));
  expect(hits).toHaveLength(1);expect(hits[0]).toMatchObject({normal:{x:-1,z:0},speed:12});
  const scrape=car('scrape',-3,0);scrape.velocity.x=20;
  resolveStatic(scrape,map(),[box({x:0,z:0,yaw:0},20,1)],impact=>hits.push(impact));
  expect(hits).toHaveLength(1);
 });
 it('reports both sides of a head-on contact from relative closing speed',()=>{
  const a=car('a',-1.9,10),b=car('b',1.9,-10),hits:Impact[]=[];
  resolveVehicleContacts([a,b],map(),[],impact=>hits.push(impact));
  expect(hits).toHaveLength(2);expect(hits.find(h=>h.vehicleId==='a')).toMatchObject({normal:{x:0,z:-1},speed:20});
  expect(hits.find(h=>h.vehicleId==='b')).toMatchObject({normal:{x:0,z:1},speed:20});
 });
 it('publishes one authoritative crash for a hard wall hit, without ram damage or scrape spam',()=>{
  const fixture=map();fixture.colliders.push({id:'wall',shape:'box',pose:{x:0,z:0,yaw:0},halfExtents:{x:20,y:3,z:1},layer:'world-solid',surface:'asphalt'});
  const sim=createSimulation(fixture,{trafficCount:0});const a=sim.addPlayer({playerId:'a',nickname:'a',sessionEpoch:'a'});
  try{
   const checkpoint=sim.checkpoint(),record=checkpoint.state.records.find(r=>r.vehicle.entityId===a.entityId)!;
   record.vehicle.pose.z=-4;record.vehicle.velocity.z=18;sim.restore(checkpoint);
   const hits:GameEvent[]=[];
   for(let i=0;i<120;i++){sim.step(new Map([[a.entityId,{actions:{...neutralActions(),throttle:1},sessionEpoch:'a',sourceCommandSequence:i}]]));hits.push(...sim.drainEvents().filter(e=>e.kind==='crash'));}
   expect(hits).toHaveLength(1);
   expect(hits[0]).toMatchObject({kind:'crash',payload:{vehicleId:a.entityId,normal:{x:0,z:-1},discontinuityId:0}});
   expect((hits[0] as Extract<GameEvent,{kind:'crash'}>).payload.speed).toBeGreaterThan(10);
   expect(sim.authority('a')!.vehicle.health).toBe(100);
   const saved=sim.checkpoint();const run=()=>{for(let i=0;i<60;i++)sim.step(new Map());return{state:sim.snapshot('a'),events:sim.drainEvents()};};
   const first=run();sim.restore(saved);expect(run()).toEqual(first);
  }finally{sim.dispose();}
 });
 it('retains its half-second per-car crash cooldown through checkpoint restore',()=>{
  const fixture=map();fixture.colliders.push({id:'wall',shape:'box',pose:{x:0,z:0,yaw:0},halfExtents:{x:20,y:3,z:1},layer:'world-solid',surface:'asphalt'});
  const sim=createSimulation(fixture,{trafficCount:0});const a=sim.addPlayer({playerId:'a',nickname:'a'});
  try{
   const ticks:number[]=[];
   for(let i=0;i<32;i++){
    const c=sim.checkpoint(),v=c.state.records.find(r=>r.vehicle.entityId===a.entityId)!.vehicle;
    v.pose.z=-3;v.velocity={x:0,z:18,yawRate:0};sim.restore(c);sim.step(new Map());
    ticks.push(...sim.drainEvents().filter(e=>e.kind==='crash').map(e=>e.serverTick));
   }
   expect(ticks).toEqual([1,31]);
  }finally{sim.dispose();}
 });
 it('publishes a wall strike for a blocked projectile without damaging a hidden target',()=>{
  const fixture=map();fixture.colliders.push({id:'wall',shape:'box',pose:{x:0,z:0,yaw:0},halfExtents:{x:20,y:3,z:1},layer:'world-solid',surface:'asphalt'});
  const sim=createSimulation(fixture,{trafficCount:0});const a=sim.addPlayer({playerId:'a',nickname:'a',sessionEpoch:'a'});sim.addPlayer({playerId:'b',nickname:'b'});
  try{
   const c=sim.checkpoint();for(const r of c.state.records)r.vehicle.protectedUntilTick=0;sim.restore(c);
   sim.step(new Map([[a.entityId,{actions:{...neutralActions(),fire:true},sessionEpoch:'a',sourceCommandSequence:0}]]));
   for(let i=0;i<35;i++)sim.step(new Map());
   const events=sim.drainEvents(),strike=events.find(e=>e.kind==='projectile-impact');
   expect(strike).toMatchObject({kind:'projectile-impact',payload:{ownerEntityId:a.entityId,position:{x:-.63,yaw:0}}});expect(events.filter(e=>e.kind==='projectile-impact')).toHaveLength(2);
   expect((strike as Extract<GameEvent,{kind:'projectile-impact'}>).payload.position.z).toBeCloseTo(-1,6);
   expect(sim.authority('b')!.vehicle.health).toBe(100);expect(events.filter(e=>e.kind==='hit')).toHaveLength(0);
  }finally{sim.dispose();}
 });
});
