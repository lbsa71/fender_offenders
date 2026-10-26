import { afterEach, beforeAll, expect, it } from 'vitest';
import { getDispatchFeatures, neutralActions, type CollisionMap } from '@fender/contracts';
import { createSimulation, predictVehicle, type Simulation } from './simulation';
import { initPhysics } from '../physics/rapier';
const map:CollisionMap={id:'winter-authority',revision:'winter-authority',bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},colliders:[],surfaces:[],wetSurfaces:[{id:'frozen',polygonXZ:[-200,-200,200,-200,200,200,-200,200]}],spawns:[{id:'a',pose:{x:-40,z:0,yaw:0},clearanceRadius:5}],laneNodes:[{id:'a',x:0,z:-80},{id:'b',x:0,z:80}],laneEdges:[{from:'a',to:'b',speedLimit:8}]};
const sims:Simulation[]=[];
function fixture(){const sim=createSimulation(map,{campaign:true,pursuit:true,trafficCount:0});sims.push(sim);sim.addPlayer({playerId:'a',nickname:'Snow patrol',bodyAssetId:'patrol'});const c=sim.checkpoint();c.state.phase='playing';c.state.phaseEnd=10000;c.state.campaign!.dispatchIndex=8;for(const r of c.state.records){r.traffic=undefined;r.bossAi=undefined;r.vehicle.bodyAssetId='patrol';r.vehicle.pose={x:r.vehicle.playerId?-40:40,z:0,yaw:0};r.vehicle.velocity={x:4,z:20,yawRate:0};r.vehicle.protectedUntilTick=0;}sim.restore(c);return sim;}
beforeAll(initPhysics);afterEach(()=>sims.splice(0).forEach(s=>s.dispose()));
it('matches icy authority, local prediction and checkpoint replay while treating officer and suspect tires equally',()=>{
 const sim=fixture(),initial=sim.snapshot('a').local!,start=sim.checkpoint();let predicted=structuredClone(initial);const actions={...neutralActions(),brakeReverse:.4};
 const step=(sequence:number)=>sim.step(new Map(sim.snapshot().vehicles.map(v=>[v.entityId,{actions,sessionEpoch:'winter',sourceCommandSequence:sequence}])));
 for(let sequence=0;sequence<20;sequence++){step(sequence);predicted={...predicted,...predictVehicle(map,predicted.vehicle,predicted.driver,actions,[],undefined,sequence+1,getDispatchFeatures(8))};}
 const outcome=sim.snapshot('a');expect(outcome.local!.vehicle.pose).toEqual(predicted.vehicle.pose);expect(outcome.local!.vehicle.velocity).toEqual(predicted.vehicle.velocity);expect(outcome.local!.vehicle.velocity.x).toBeGreaterThan(2);
 expect(outcome.vehicles.find(v=>v.playerId===null)!.velocity).toEqual(outcome.local!.vehicle.velocity);sim.restore(start);for(let sequence=0;sequence<20;sequence++)step(sequence);expect(sim.snapshot('a')).toEqual(outcome);
});
it('keeps a front-cutoff automatic arrest available on frozen puddles',()=>{
 const sim=fixture(),c=sim.checkpoint();c.state.contenderTicks=[['a',179]];for(const r of c.state.records){r.vehicle.pose={x:0,z:r.vehicle.playerId?5:0,yaw:0};r.vehicle.velocity={x:0,z:9,yawRate:0};}sim.restore(c);sim.step(new Map());expect(sim.snapshot()).toMatchObject({phase:'results',pursuit:{state:'complete',winnerPlayerId:'a'}});
});
