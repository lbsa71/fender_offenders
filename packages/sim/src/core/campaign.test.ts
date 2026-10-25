import { afterEach, beforeAll, expect, it } from 'vitest';
import * as contracts from '@fender/contracts';
import { createSimulation, type Simulation, type SimulationOptions } from './simulation.js';
import { DEFAULT_GAMEPLAY_CONFIG } from './config.js';
import { initPhysics } from '../physics/rapier.js';

const arena = (): contracts.CollisionMap => ({ id:'campaign-arena', revision:'campaign-map-1', bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100}, colliders:[], surfaces:[], spawns:[{id:'a',pose:{x:-40,z:-30,yaw:0},clearanceRadius:5},{id:'b',pose:{x:40,z:30,yaw:0},clearanceRadius:5},{id:'c',pose:{x:40,z:-30,yaw:0},clearanceRadius:5}], laneNodes:[{id:'south',x:0,z:-80},{id:'north',x:0,z:80}], laneEdges:[{from:'south',to:'north',speedLimit:.01},{from:'north',to:'south',speedLimit:.01}] });
const simulations: Simulation[] = [];
function simulation(options: SimulationOptions = {}) {
  const sim=createSimulation(arena(),{mode:'practice',trafficCount:0,pursuit:true,campaign:true,...options}); simulations.push(sim);
  sim.addPlayer({playerId:'a',nickname:'Officer A',bodyAssetId:'patrol'}); return sim;
}
function campaign(sim:Simulation) { const state=sim.snapshot().campaign; expect(state,'Campaign must be an authoritative opt-in state').toBeDefined(); return state!; }
function ticks(sim:Simulation,count:number) { for(let i=0;i<count;i++)sim.step(new Map()); }
function start(sim:Simulation) { expect(sim.startRound('a')).toBe(true); ticks(sim,180); expect(sim.snapshot().phase).toBe('playing'); }
function prepare(sim:Simulation,method:'arrested'|'wrecked',playerId='a') {
  const c=sim.checkpoint(),target=c.state.records.find(r=>r.vehicle.entityId===c.state.pursuit!.suspectId)!;
  target.vehicle.pose={x:0,z:0,yaw:0};target.vehicle.velocity={x:0,z:0,yawRate:0};target.vehicle.protectedUntilTick=0;
  if(method==='wrecked')target.vehicle.health=10;
  for(const r of c.state.records)if(r.vehicle.playerId){r.vehicle.pose={x:r.vehicle.playerId===playerId?(method==='arrested'?-5:0):30,z:r.vehicle.playerId===playerId&&method==='wrecked'?-20:0,yaw:0};r.vehicle.velocity={x:0,z:0,yawRate:0};r.vehicle.protectedUntilTick=0;}
  sim.restore(c); return {targetId:target.vehicle.entityId,officerId:c.state.records.find(r=>r.vehicle.playerId===playerId)!.vehicle.entityId};
}
function resolve(sim:Simulation,method:'arrested'|'wrecked',playerId='a') {
  const {officerId}=prepare(sim,method,playerId);
  if(method==='arrested')ticks(sim,180);
  else {sim.step(new Map([[officerId,{actions:{...contracts.neutralActions(),fire:true},sessionEpoch:'campaign-test',sourceCommandSequence:0}]]));ticks(sim,30);}
  expect(sim.snapshot().phase).toBe('results');
}
beforeAll(initPhysics); afterEach(()=>simulations.splice(0).forEach(sim=>sim.dispose()));

it('starts a campaign in a frozen briefing lobby while legacy practice still starts playing',()=>{
 const sim=simulation();expect(campaign(sim)).toMatchObject({campaignId:contracts.CAMPAIGN_ID,dispatchIndex:0,status:'active',outcomes:[]});expect(sim.snapshot().phase).toBe('lobby');
 const before=sim.snapshot(),officer=before.vehicles.find(v=>v.playerId==='a')!;
 for(let i=0;i<60;i++)sim.step(new Map([[officer.entityId,{actions:{...contracts.neutralActions(),throttle:1,fire:true},sessionEpoch:'test',sourceCommandSequence:i}]]));
 expect(sim.snapshot().vehicles).toEqual(before.vehicles);expect(sim.snapshot().pursuit!.elapsedTicks).toBe(0);expect(sim.drainEvents()).toEqual([]);
 const legacy=simulation({campaign:false});expect(legacy.snapshot().phase).toBe('playing');expect(legacy.snapshot().campaign).toBeUndefined();
});
it('requires an explicit pursuit and a usable lane graph for campaign mode',()=>{
 expect(()=>createSimulation(arena(),{campaign:true,pursuit:false})).toThrow(/pursuit/i);
 const noLanes=arena();noLanes.laneNodes=[];noLanes.laneEdges=[];expect(()=>createSimulation(noLanes,{campaign:true,pursuit:true})).toThrow(/lane/i);
});
it('allows any connected officer to start alone and rejects duplicate or disconnected requests',()=>{
 const solo=simulation();campaign(solo);expect(solo.startRound('intruder')).toBe(false);solo.setConnection('a','reconnecting');expect(solo.startRound('a')).toBe(false);solo.setConnection('a','connected');start(solo);
 const multi=simulation({mode:'multiplayer'});expect(multi.startRound('a')).toBe(true);expect(multi.startRound('a')).toBe(false);
 const guest=simulation({mode:'multiplayer'});guest.addPlayer({playerId:'b',nickname:'Officer B'});guest.setConnection('b','reconnecting');expect(guest.startRound('b')).toBe(false);guest.setConnection('b','connected');expect(guest.startRound('b')).toBe(true);guest.removePlayer('a');expect(guest.snapshot().phase).toBe('countdown');guest.removePlayer('b');expect(guest.snapshot().phase).toBe('countdown');
});
it('uses the authored target body/profile health and keeps one marked suspect with a stable entity ID',()=>{
 const sim=simulation({config:{...DEFAULT_GAMEPLAY_CONFIG,maxHealth:200}});const state=campaign(sim),target=contracts.getCampaignTarget(contracts.CAMPAIGN_DISPATCHES[state.dispatchIndex]!.targetId)!;
 const car=sim.snapshot().vehicles.find(v=>v.entityId===sim.snapshot().pursuit!.suspectId)!;
 expect(car.playerId).toBeNull();expect(car.bodyAssetId).toBe(target.vehicleBodyId);expect(car.health).toBe(contracts.getVehicleProfile(target.vehicleBodyId).maxHealth*2);expect(car.maxHealth).toBe(car.health);
 expect(sim.checkpoint().state.records.filter(r=>r.traffic?.suspect)).toHaveLength(1);
});
it('restores authored profile health on an unresolved target respawn without awarding a campaign outcome',()=>{
 const sim=simulation({config:{...DEFAULT_GAMEPLAY_CONFIG,maxHealth:200}});campaign(sim);start(sim);
 const c=sim.checkpoint(),target=c.state.records.find(r=>r.vehicle.entityId===c.state.pursuit!.suspectId)!;target.vehicle.status='wrecked';target.vehicle.health=0;target.vehicle.respawnAtTick=c.tick+1;sim.restore(c);ticks(sim,1);
 const respawned=sim.snapshot().vehicles.find(v=>v.entityId===target.vehicle.entityId)!;expect(respawned.status).toBe('active');expect(respawned.health).toBe(contracts.getVehicleProfile(respawned.bodyAssetId).maxHealth*2);expect(respawned.maxHealth).toBe(respawned.health);expect(campaign(sim).outcomes).toEqual([]);
});
it('records a green arrest and one bonus without changing ordinary pursuit rules',()=>{
 const sim=simulation();campaign(sim);start(sim);sim.drainEvents();resolve(sim,'arrested');
 expect(campaign(sim).outcomes).toMatchObject([{dispatchIndex:0,outcome:'arrested',playerId:'a'}]);expect(sim.snapshot().scores[0]!.score).toBe(3);
 expect(sim.drainEvents().filter(e=>e.kind==='pursuit-complete')).toMatchObject([{payload:{outcome:'arrested',bonus:3}}]);
});
it('resolves a lethal player volley as wrecked once, preserves the attacker credit, and never respawns the finished target',()=>{
 const sim=simulation({mode:'multiplayer'});sim.addPlayer({playerId:'b',nickname:'Officer B'});campaign(sim);start(sim);sim.drainEvents();resolve(sim,'wrecked','b');
 expect(campaign(sim).outcomes).toMatchObject([{dispatchIndex:0,outcome:'wrecked',playerId:'b'}]);expect(sim.snapshot().pursuit!.winnerPlayerId).toBe('b');expect(sim.snapshot().scores.find(s=>s.playerId==='b')!.score).toBe(1);
 const events=sim.drainEvents();expect(events.filter(e=>e.kind==='pursuit-complete')).toMatchObject([{payload:{outcome:'wrecked',bonus:1,playerId:'b'}}]);expect(events.filter(e=>e.kind==='round-ended')).toMatchObject([{payload:{reason:'wrecked',winnerPlayerId:'b'}}]);
 const target=sim.snapshot().vehicles.find(v=>v.entityId===sim.snapshot().pursuit!.suspectId)!;ticks(sim,400);expect(sim.snapshot().vehicles.find(v=>v.entityId===target.entityId)).toEqual(target);expect(campaign(sim).outcomes).toHaveLength(1);expect(sim.drainEvents().filter(e=>e.kind==='respawn'||e.kind==='pursuit-complete'||e.kind==='round-ended')).toEqual([]);
 sim.removePlayer('b');expect(campaign(sim).outcomes[0]).toMatchObject({playerId:'b',callsign:'Officer B'});expect(sim.rematch('b')).toBe(false);expect(sim.rematch('a')).toBe(true);expect(sim.rematch('a')).toBe(false);expect(campaign(sim).dispatchIndex).toBe(1);
});
it('wins with wreck classification over an arrest that would finish in the same tick',()=>{
 const sim=simulation();campaign(sim);start(sim);const {officerId}=prepare(sim,'wrecked');const c=sim.checkpoint();c.state.records.find(r=>r.vehicle.playerId==='a')!.vehicle.pose={x:0,z:-5.5,yaw:0};c.state.contenderTicks=[['a',179]];c.state.pursuit!.progress=179/180;sim.restore(c);
 sim.step(new Map([[officerId,{actions:{...contracts.neutralActions(),fire:true},sessionEpoch:'test',sourceCommandSequence:0}]]));ticks(sim,10);expect(campaign(sim).outcomes[0]!.outcome).toBe('wrecked');expect(sim.snapshot().scores[0]!.score).toBe(1);
});
it('advances only successful dispatches, preserves cumulative scores, and completes exactly ten authored stages',()=>{
 const sim=simulation();campaign(sim);const suspectId=sim.snapshot().pursuit!.suspectId;let score=0;
 for(let stage=0;stage<10;stage++){
  const before=structuredClone(campaign(sim).outcomes);expect(campaign(sim).dispatchIndex).toBe(stage);
  const target=contracts.getCampaignTarget(contracts.CAMPAIGN_DISPATCHES[stage]!.targetId)!;const car=sim.snapshot().vehicles.find(v=>v.entityId===suspectId)!;expect(car.bodyAssetId).toBe(target.vehicleBodyId);expect(car.health).toBe(contracts.getVehicleProfile(target.vehicleBodyId).maxHealth);
  start(sim);const method=stage%2?'wrecked':'arrested';resolve(sim,method);score+=method==='arrested'?3:1;
  expect(campaign(sim).outcomes.slice(0,stage)).toEqual(before);expect(campaign(sim).outcomes).toHaveLength(stage+1);expect(campaign(sim).status).toBe(stage===9?'complete':'active');expect(sim.snapshot().scores[0]!.score).toBe(score);
  if(stage<9){expect(sim.rematch('a')).toBe(true);expect(sim.snapshot().phase).toBe('lobby');expect(sim.snapshot().pursuit!.suspectId).toBe(suspectId);expect(sim.snapshot().pursuit!.progress).toBe(0);}
 }
 const publicCopy=sim.snapshot();publicCopy.campaign!.outcomes.length=0;expect(campaign(sim).outcomes).toHaveLength(10);
 expect(sim.rematch('a')).toBe(true);expect(campaign(sim)).toMatchObject({dispatchIndex:0,status:'active',outcomes:[]});expect(sim.snapshot().scores[0]!.score).toBe(0);expect(sim.snapshot().phase).toBe('lobby');
});
it('retries a timed-out stage without an outcome, reveal, advancement or invented winner',()=>{
 const sim=simulation();campaign(sim);start(sim);const c=sim.checkpoint();c.state.phaseEnd=c.tick+1;sim.restore(c);ticks(sim,1);
 expect(sim.snapshot().phase).toBe('results');expect(campaign(sim)).toMatchObject({dispatchIndex:0,status:'active',outcomes:[]});expect(sim.snapshot().pursuit!.winnerPlayerId).toBeNull();expect(sim.rematch('a')).toBe(true);expect(campaign(sim).dispatchIndex).toBe(0);start(sim);expect(campaign(sim).outcomes).toEqual([]);
});
it('allows garage selection in campaign briefings and rejects live/results practice healing',()=>{
 const sim=simulation();campaign(sim);expect(sim.setPlayerVehicle('a','army')).toBe(true);start(sim);expect(sim.setPlayerVehicle('a','roadster')).toBe(false);resolve(sim,'arrested');expect(sim.setPlayerVehicle('a','roadster')).toBe(false);expect(sim.rematch('a')).toBe(true);expect(sim.setPlayerVehicle('a','roadster')).toBe(true);
});
it('restores campaign outcomes, target stats, progress and subsequent events deterministically',()=>{
 const sim=simulation();campaign(sim);start(sim);resolve(sim,'arrested');expect(sim.rematch('a')).toBe(true);start(sim);prepare(sim,'arrested');ticks(sim,90);const checkpoint=sim.checkpoint();sim.drainEvents();
 const run=()=>{ticks(sim,90);return{snapshot:sim.snapshot(),events:sim.drainEvents()};};const first=run();sim.restore(checkpoint);expect(run()).toEqual(first);expect(first.snapshot.campaign!.outcomes).toHaveLength(2);
 expect(sim.rematch('a')).toBe(true);expect(campaign(sim).dispatchIndex).toBe(2);
});
