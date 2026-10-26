import { afterEach, beforeAll, expect, it } from 'vitest';
import { neutralActions, type CollisionMap } from '@fender/contracts';
import { createSimulation, type Simulation } from '../core/simulation';
import { initPhysics } from '../physics/rapier';
import { newHelicopter, type HelicopterRuntime } from './helicopter';
const map:CollisionMap={id:'air-arena',revision:'air-1',bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},colliders:[],surfaces:[],spawns:[{id:'a',pose:{x:0,z:0,yaw:0},clearanceRadius:5}],laneNodes:[{id:'a',x:-90,z:80},{id:'b',x:90,z:80}],laneEdges:[{from:'a',to:'b',speedLimit:.01}]};
const sims:Simulation[]=[];beforeAll(initPhysics);afterEach(()=>sims.splice(0).forEach(s=>s.dispose()));
function encounter(){
 const sim=createSimulation(map,{mode:'practice',trafficCount:0,campaign:true,pursuit:true});sims.push(sim);sim.addPlayer({playerId:'officer',nickname:'Officer',sessionEpoch:'e'});
 const c=sim.checkpoint(),player=c.state.records.find(r=>r.vehicle.playerId==='officer')!,boss=c.state.records.find(r=>r.traffic?.suspect)!;
 c.state.phase='playing';c.state.phaseEnd=10000;c.state.campaign!.dispatchIndex=4;
 player.vehicle.pose={x:0,z:0,yaw:0};player.vehicle.protectedUntilTick=0;boss.vehicle.pose={x:80,z:80,yaw:0};boss.vehicle.protectedUntilTick=0;
 const h=newHelicopter(4,c.tick,'test-chopper')!;Object.assign(h.state,{phase:'attack',from:{x:0,z:20},to:{x:0,z:20},startedAtTick:c.tick,endsAtTick:9999,health:20});h.nextBombTick=9999;
 Reflect.set(c.state,'helicopter',h);sim.restore(c);return {sim,playerId:player.vehicle.entityId,bossId:boss.vehicle.entityId};
}
it('ordinary player bullets shoot down the helper without resolving the suspect, and it cannot return in this dispatch',()=>{
 const {sim,bossId,playerId}=encounter();for(let i=0;i<180&&sim.snapshot().helicopter?.phase!=='downed';i++)sim.step(new Map([[playerId,{sessionEpoch:'e',sourceCommandSequence:i,actions:{...neutralActions(),fire:true}}]]));
 expect(sim.snapshot().helicopter).toMatchObject({entityId:'test-chopper',health:0,phase:'downed'});
 expect(sim.snapshot()).toMatchObject({phase:'playing',campaign:{dispatchIndex:4,outcomes:[]}});expect(sim.snapshot().vehicles.find(v=>v.entityId===bossId)!.health).toBeGreaterThan(0);
 const saved=sim.checkpoint();sim.restore(saved);for(let i=0;i<1800;i++)sim.step(new Map());
 expect(sim.snapshot().helicopter).toMatchObject({entityId:'test-chopper',health:0,phase:'downed'});expect(sim.snapshot().grenades?.some(g=>g.ownerEntityId==='test-chopper')).toBe(false);
});
it('air-dropped bombs lead the officer, replicate their origin height and apply real authority damage once',()=>{
 const {sim,playerId}=encounter(),c=sim.checkpoint(),h=Reflect.get(c.state,'helicopter') as HelicopterRuntime|undefined;
 const helicopter=h??newHelicopter(4,c.tick,'test-chopper')!;Object.assign(helicopter.state,{phase:'attack',from:{x:0,z:20},to:{x:0,z:20},endsAtTick:9999});helicopter.nextBombTick=0;Reflect.set(c.state,'helicopter',helicopter);
 const player=c.state.records.find(r=>r.vehicle.entityId===playerId)!;player.vehicle.velocity={x:0,z:8,yawRate:0};sim.restore(c);sim.step(new Map());
 const bomb=sim.snapshot().grenades?.find(g=>g.ownerEntityId==='test-chopper');expect(bomb).toBeDefined();expect(bomb!.originHeight).toBe(18);expect(bomb!.target.z).toBeGreaterThan(5);
 const at=sim.checkpoint();const victim=at.state.records.find(r=>r.vehicle.entityId===playerId)!;victim.vehicle.pose={...bomb!.target};victim.vehicle.velocity={x:0,z:0,yawRate:0};sim.restore(at);
 for(let i=0;i<50;i++)sim.step(new Map());expect(sim.snapshot().vehicles.find(v=>v.entityId===playerId)!.health).toBeLessThan(100);
 expect(sim.drainEvents().filter(e=>e.kind==='grenade-exploded'&&e.payload.grenadeId===bomb!.entityId)).toHaveLength(1);
});
