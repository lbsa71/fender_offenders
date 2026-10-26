import { afterEach, beforeAll, expect, it } from 'vitest';
import { getBossTactics, neutralActions, packSnapshot, unpackSnapshot, type CollisionMap } from '@fender/contracts';
import { createSimulation, predictVehicle, type Simulation } from './simulation';
import { initPhysics } from '../physics/rapier';

const map: CollisionMap = { id:'tutorial', revision:'tutorial', bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},colliders:[],surfaces:[],spawns:[{id:'a',pose:{x:5,z:0,yaw:0},clearanceRadius:5}],laneNodes:[{id:'a',x:0,z:-80},{id:'b',x:0,z:80}],laneEdges:[{from:'a',to:'b',speedLimit:1}] };
const sims: Simulation[]=[];
function setup(stage=0,authored=map) {
 const sim=createSimulation(authored,{campaign:true,pursuit:true,trafficCount:0});sims.push(sim);sim.addPlayer({playerId:'a',nickname:'Rookie'});
 const c=sim.checkpoint();c.state.campaign!.dispatchIndex=stage;c.state.phase='playing';c.state.phaseEnd=10000;
 for(const r of c.state.records){r.vehicle.protectedUntilTick=0;r.vehicle.velocity={x:0,z:0,yawRate:0};r.vehicle.pose={x:r.vehicle.playerId?5:0,z:0,yaw:0};if(!r.vehicle.playerId)r.traffic=undefined;}
 sim.restore(c);return sim;
}
beforeAll(initPhysics);afterEach(()=>sims.splice(0).forEach(sim=>sim.dispose()));
it('rejects forged opening-dispatch fire without shots, health loss or recoil, but unlocks firing in dispatch three',()=>{
 const first=setup(), car=first.snapshot('a').local!.vehicle;
 for(let i=0;i<30;i++)first.step(new Map([[car.entityId,{actions:{...neutralActions(),fire:true},sessionEpoch:'test',sourceCommandSequence:i}]]));
 expect(first.drainEvents().filter(e=>e.kind==='shot')).toEqual([]);expect(first.snapshot('a').local!.driver.shotOrdinal).toBe(0);
 expect(first.snapshot().projectiles).toEqual([]);expect(first.snapshot().vehicles.every(v=>v.health===v.maxHealth)).toBe(true);
 const second=setup(2), id=second.snapshot('a').local!.vehicle.entityId;second.step(new Map([[id,{actions:{...neutralActions(),fire:true},sessionEpoch:'test',sourceCommandSequence:0}]]));
 expect(second.drainEvents().some(e=>e.kind==='shot')).toBe(true);
});
it('reports the same eligibility reason that awards local arrest progress, including wire and checkpoint recovery',()=>{
 const sim=setup();sim.step(new Map());
 expect(sim.snapshot().pursuit!.contenders![0]).toMatchObject({playerId:'a',guidance:'hold-steady',progress:1/180});
 const saved=sim.checkpoint(),wire=unpackSnapshot(packSnapshot(sim.snapshot()));expect(wire.pursuit).toEqual(sim.snapshot().pursuit);
 const c=sim.checkpoint();c.state.records.find(r=>r.vehicle.playerId==='a')!.vehicle.pose.x=20;sim.restore(c);sim.step(new Map());
 expect(sim.snapshot().pursuit!.contenders![0]).toMatchObject({guidance:'get-closer',progress:0});
 sim.restore(saved);expect(sim.snapshot().pursuit).toEqual(wire.pursuit);
});
it('starts with an unarmed suspect and introduces an extended bomb fuse only in dispatch three',()=>{
 expect(getBossTactics(0).weapon).toBe('none');expect(getBossTactics(2).grenadeFuseTicks).toBe(150);expect(getBossTactics(3).grenadeFuseTicks).toBe(90);
});
it('distinguishes relative speed and obstruction without awarding arrest progress',()=>{
 const fast=setup(),c=fast.checkpoint();c.state.records.find(r=>r.vehicle.playerId==='a')!.vehicle.velocity.z=7;fast.restore(c);fast.step(new Map());
 expect(fast.snapshot().pursuit!.contenders![0]).toMatchObject({guidance:'match-speed',progress:0});
 const blocked=setup(0,{...map,colliders:[{id:'wall',shape:'box',pose:{x:2.5,z:0,yaw:0},halfExtents:{x:.1,y:3,z:5},layer:'world-solid',surface:'asphalt'}]});blocked.step(new Map());
 expect(blocked.snapshot().pursuit!.contenders![0]).toMatchObject({guidance:'clear-obstruction',progress:0});
});
it('cannot classify a lethal stale projectile as a completed opening dispatch',()=>{
 const sim=setup(),c=sim.checkpoint(),target=c.state.records.find(r=>!r.vehicle.playerId)!,officer=c.state.records.find(r=>r.vehicle.playerId==='a')!;
 target.vehicle.health=1;c.state.projectiles=[{entityId:'stale-shot',ownerEntityId:officer.vehicle.entityId,pose:{x:0,z:-3,yaw:0},velocity:{x:0,z:70,yawRate:0},bornTick:0,expiresTick:39,sourceCommandSequence:0,sourceShotOrdinal:1,damage:10}];sim.restore(c);sim.step(new Map());
 expect(sim.snapshot().campaign!.outcomes).toEqual([]);expect(sim.snapshot().phase).toBe('playing');
});
it('matches authoritative wet-road movement through prediction and checkpoint replay',()=>{
 const wetMap={...map,wetSurfaces:[{id:'wet',polygonXZ:[-20,-20,20,-20,20,20,-20,20]}]},sim=setup(3,wetMap),c=sim.checkpoint();
 for(const r of c.state.records){r.vehicle.pose.x=r.vehicle.playerId?0:-50;if(r.vehicle.playerId)r.vehicle.velocity={x:5,z:14,yawRate:0};}sim.restore(c);
 const initial=sim.snapshot('a').local!,actions={...neutralActions(),steer:.2};let predicted=initial;
 for(let i=0;i<20;i++){sim.step(new Map([[initial.vehicle.entityId,{actions,sessionEpoch:'wet',sourceCommandSequence:i}]]));const result=predictVehicle(wetMap,predicted.vehicle,predicted.driver,actions,[],undefined,i+1,{gunsEnabled:true,wetRoads:true});predicted={...initial,...result};}
 const outcome=sim.snapshot('a').local!;expect(outcome.vehicle.pose).toEqual(predicted.vehicle.pose);expect(outcome.vehicle.velocity).toEqual(predicted.vehicle.velocity);
 sim.restore(c);for(let i=0;i<20;i++)sim.step(new Map([[initial.vehicle.entityId,{actions,sessionEpoch:'wet',sourceCommandSequence:i}]]));expect(sim.snapshot('a').local).toEqual(outcome);
});
it('applies wet grip in prediction only inside the shared footprint and restores dry handling on exit',()=>{
 const sim=setup(),car=sim.snapshot('a').local!.vehicle;car.pose={x:0,z:0,yaw:0};car.velocity={x:5,z:14,yawRate:0};
 const wetMap={...map,wetSurfaces:[{id:'test-puddle',polygonXZ:[-4,-10,4,-10,4,10,-4,10]}]};
 const driver=sim.snapshot('a').local!.driver;
 const dry=predictVehicle(wetMap,car,driver,neutralActions(),[],undefined,1,{gunsEnabled:true,wetRoads:false});
 const wet=predictVehicle(wetMap,car,driver,neutralActions(),[],undefined,1,{gunsEnabled:true,wetRoads:true});
 expect(wet.vehicle.velocity.x).toBeGreaterThan(dry.vehicle.velocity.x);
 car.pose.x=20;
 expect(predictVehicle(wetMap,car,driver,neutralActions(),[],undefined,1,{gunsEnabled:true,wetRoads:true})).toEqual(predictVehicle(wetMap,car,driver,neutralActions(),[],undefined,1,{gunsEnabled:true,wetRoads:false}));
});
