import { afterEach,beforeAll,expect,it } from 'vitest';
import { neutralActions,type CollisionMap } from '@fender/contracts';
import { createSimulation,type Simulation,type SimulationOptions } from './simulation.js';
import { initPhysics } from '../physics/rapier.js';
const map=():CollisionMap=>({id:'pursuit-arena',revision:'pursuit-1',bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},colliders:[],surfaces:[],spawns:[{id:'a',pose:{x:-40,z:-30,yaw:0},clearanceRadius:5},{id:'b',pose:{x:40,z:30,yaw:0},clearanceRadius:5},{id:'c',pose:{x:40,z:-30,yaw:0},clearanceRadius:5}],laneNodes:[{id:'south',x:0,z:-80},{id:'north',x:0,z:80}],laneEdges:[{from:'south',to:'north',speedLimit:.01},{from:'north',to:'south',speedLimit:.01}]});
const sims:Simulation[]=[];
function simulation(options:SimulationOptions={},fixture=map()){const sim=createSimulation(fixture,{trafficCount:1,pursuit:true,...options});sims.push(sim);return sim;}
function fixture(mode:'practice'|'multiplayer'='practice',ids=['a','b'],authored=map()){
 const sim=simulation({mode},authored);for(const id of ids)sim.addPlayer({playerId:id,nickname:id});
 const c=sim.checkpoint(),suspect=c.state.records.find(record=>record.traffic)!;
 suspect.vehicle.pose={x:0,z:0,yaw:0};suspect.vehicle.velocity={x:0,z:0,yawRate:0};suspect.vehicle.status='wrecked';suspect.vehicle.health=0;suspect.vehicle.respawnAtTick=10000;suspect.vehicle.protectedUntilTick=0;suspect.traffic!.suspect=true;suspect.vehicle.bodyAssetId='suspect';
 c.state.pursuit??={state:'chasing',suspectId:suspect.vehicle.entityId,progress:0,elapsedTicks:0};c.state.phase='playing';c.state.phaseEnd=c.tick+10000;
 for(const record of c.state.records)if(record.vehicle.playerId){record.vehicle.pose={x:record.vehicle.playerId===ids[0]?-5:30,z:0,yaw:0};record.vehicle.velocity={x:0,z:0,yawRate:0};record.vehicle.protectedUntilTick=0;}
 sim.restore(c);return{sim,suspectId:suspect.vehicle.entityId};
}
function ticks(sim:Simulation,count:number){for(let i=0;i<count;i++)sim.step(new Map());}
function place(sim:Simulation,id:string,x:number,z=0){const c=sim.checkpoint(),record=c.state.records.find(record=>record.vehicle.playerId===id)!;record.vehicle.pose={x,z,yaw:0};record.vehicle.velocity={x:0,z:0,yawRate:0};sim.restore(c);}
beforeAll(initPhysics);afterEach(()=>sims.splice(0).forEach(sim=>sim.dispose()));
it('spawns exactly one multiplayer suspect even with zero civilian traffic when enabled',()=>{
 const sim=simulation({mode:'multiplayer',trafficCount:0});expect(sim.snapshot().pursuit).toBeDefined();
 expect(sim.snapshot().vehicles.filter(v=>v.bodyAssetId==='suspect')).toHaveLength(1);
 expect(sim.snapshot().pursuit).toMatchObject({winnerPlayerId:null,contenders:[]});
 const full=simulation({mode:'multiplayer',trafficCount:16});expect(full.snapshot().vehicles.filter(v=>v.bodyAssetId==='suspect')).toHaveLength(1);expect(full.snapshot().vehicles.length).toBeLessThanOrEqual(16);
 expect(simulation({mode:'multiplayer',trafficCount:2,pursuit:false}).snapshot().pursuit).toBeUndefined();
 const noLanes=map();noLanes.laneEdges=[];noLanes.laneNodes=[];expect(simulation({mode:'multiplayer',trafficCount:0},noLanes).snapshot().pursuit).toBeUndefined();
});
it('requires 180 personal qualifying ticks and completes practice once with the identified winner',()=>{
 const{sim,suspectId}=fixture();ticks(sim,179);expect(sim.snapshot().phase).toBe('playing');expect(sim.snapshot().pursuit!.progress).toBeCloseTo(179/180,10);
 ticks(sim,1);expect(sim.snapshot()).toMatchObject({phase:'results',pursuit:{state:'complete',winnerPlayerId:'a',arrestingPlayerId:'a',progress:1}});
 const events=sim.drainEvents();expect(events.filter(e=>e.kind==='pursuit-complete')).toMatchObject([{payload:{playerId:'a',suspectId,bonus:3}}]);expect(events.filter(e=>e.kind==='round-ended')).toMatchObject([{payload:{winnerPlayerId:'a',reason:'apprehended'}}]);
 expect(sim.snapshot().scores.find(s=>s.playerId==='a')!.score).toBe(3);ticks(sim,200);expect(sim.drainEvents().filter(e=>e.kind==='pursuit-complete'||e.kind==='round-ended')).toHaveLength(0);expect(sim.rematch('a')).toBe(false);
});
it('does not let another officer inherit the first officers accumulated arrest progress',()=>{
 const{sim}=fixture();ticks(sim,120);place(sim,'a',-30);place(sim,'b',5);ticks(sim,60);
 expect(sim.snapshot().pursuit!.state).not.toBe('complete');expect(sim.snapshot().pursuit!.contenders).toEqual(expect.arrayContaining([expect.objectContaining({playerId:'a',progress:0}),expect.objectContaining({playerId:'b',progress:1/3})]));
 ticks(sim,119);expect(sim.snapshot().phase).toBe('playing');ticks(sim,1);expect(sim.snapshot().pursuit!.winnerPlayerId).toBe('b');
});
it('ends multiplayer dispatch immediately for the apprehending officer, retaining PvP scores',()=>{
 const{sim}=fixture('multiplayer');ticks(sim,180);expect(sim.snapshot()).toMatchObject({phase:'results',phaseEndsAtTick:null,pursuit:{winnerPlayerId:'a'}});
 expect(sim.snapshot().scores.find(s=>s.playerId==='a')!.score).toBe(3);expect(sim.drainEvents().filter(e=>e.kind==='round-ended')).toHaveLength(1);
});
it('resolves a simultaneous finish by ascending stable player ID rather than insertion order',()=>{
 const{sim}=fixture('multiplayer',['z','a']);place(sim,'a',5);ticks(sim,180);expect(sim.snapshot().pursuit!.winnerPlayerId).toBe('a');expect(sim.snapshot().scores.find(s=>s.playerId==='z')!.score).toBe(0);
});
it('blocks apprehension through a solid wall even within the distance radius',()=>{
 const authored=map();authored.colliders.push({id:'wall',shape:'box',pose:{x:-2.5,z:0,yaw:0},halfExtents:{x:.1,y:3,z:10},layer:'world-solid',surface:'asphalt'});
 const{sim}=fixture('practice',['a','b'],authored);ticks(sim,200);expect(sim.snapshot().pursuit!.progress).toBe(0);expect(sim.snapshot().phase).toBe('playing');
});
it('also apprehends a living suspect without requiring gunfire or a wreck',()=>{
 const{sim,suspectId}=fixture('multiplayer');const c=sim.checkpoint(),suspect=c.state.records.find(r=>r.vehicle.entityId===suspectId)!;
 suspect.vehicle.status='active';suspect.vehicle.health=100;suspect.vehicle.respawnAtTick=null;sim.restore(c);
 ticks(sim,179);expect(sim.snapshot().phase).toBe('playing');ticks(sim,1);
 expect(sim.snapshot().pursuit!.winnerPlayerId).toBe('a');expect(sim.snapshot().vehicles.find(v=>v.entityId===suspectId)!.health).toBe(100);
});
it('requires distance below eight metres and relative speed below five metres per second',()=>{
 const{sim}=fixture();place(sim,'a',-8);ticks(sim,1);expect(sim.snapshot().pursuit!.progress).toBe(0);
 place(sim,'a',-7);const c=sim.checkpoint(),officer=c.state.records.find(r=>r.vehicle.playerId==='a')!;officer.vehicle.velocity.z=6;sim.restore(c);
 ticks(sim,1);expect(sim.snapshot().pursuit!.progress).toBe(0);
 place(sim,'a',-7);ticks(sim,1);expect(sim.snapshot().pursuit!.progress).toBeCloseTo(1/180,10);
});
it('keeps the default practice objective opt-out and does not silently enable multiplayer pursuit',()=>{
 expect(simulation({mode:'practice',trafficCount:1,pursuit:undefined}).snapshot().pursuit).toBeDefined();
 expect(simulation({mode:'practice',trafficCount:0,pursuit:undefined}).snapshot().pursuit).toBeUndefined();
 expect(simulation({mode:'practice',trafficCount:1,pursuit:false}).snapshot().pursuit).toBeUndefined();
 expect(simulation({mode:'multiplayer',trafficCount:1,pursuit:undefined}).snapshot().pursuit).toBeUndefined();
});
it.each(['disconnected','wrecked','departed'] as const)('removes %s officers from eligibility while personal progress decays',condition=>{
 const{sim}=fixture();ticks(sim,120);
 if(condition==='disconnected')sim.setConnection('a','reconnecting');
 if(condition==='departed')sim.removePlayer('a');
 if(condition==='wrecked'){const c=sim.checkpoint(),r=c.state.records.find(r=>r.vehicle.playerId==='a')!;r.vehicle.status='wrecked';r.vehicle.health=0;r.vehicle.respawnAtTick=10000;sim.restore(c);}
 ticks(sim,100);expect(sim.snapshot().pursuit!.state).not.toBe('complete');expect(sim.snapshot().pursuit!.winnerPlayerId).toBeNull();
 if(condition==='disconnected'){sim.setConnection('a','connected');ticks(sim,179);expect(sim.snapshot().phase).toBe('playing');ticks(sim,1);expect(sim.snapshot().pursuit!.winnerPlayerId).toBe('a');}
});
it('expires the round without inventing a winner and resets pursuit state on rematch and start',()=>{
 const{sim,suspectId}=fixture('multiplayer');ticks(sim,30);const ending=sim.checkpoint();ending.state.phaseEnd=ending.tick+1;sim.restore(ending);ticks(sim,1);
 expect(sim.snapshot()).toMatchObject({phase:'results',pursuit:{winnerPlayerId:null}});expect(sim.drainEvents().find(e=>e.kind==='round-ended')).toMatchObject({payload:{reason:'timeout',winnerPlayerId:null}});
 expect(sim.rematch('a')).toBe(true);expect(sim.snapshot().pursuit).toMatchObject({suspectId,state:'chasing',progress:0,elapsedTicks:0,winnerPlayerId:null});expect(sim.snapshot().vehicles.find(v=>v.entityId===suspectId)!.status).toBe('active');
 expect(sim.startRound('a')).toBe(true);expect(sim.snapshot().pursuit!.contenders!.every(c=>c.progress===0)).toBe(true);
 ticks(sim,180);expect(sim.snapshot().phase).toBe('playing');expect(sim.snapshot().pursuit!.winnerPlayerId).toBeNull();
});
it('preserves independent contenders, the eventual winner and events through checkpoint replay',()=>{
 const{sim}=fixture('multiplayer');ticks(sim,90);place(sim,'b',5);ticks(sim,20);const c=sim.checkpoint();sim.drainEvents();const run=()=>{ticks(sim,120);return{state:sim.snapshot(),events:sim.drainEvents()};};
 const first=run();sim.restore(c);expect(run()).toEqual(first);expect(first.state.pursuit!.winnerPlayerId).toBe('a');
});
it('does not declare an arrest victory merely because the suspect was shot and wrecked',()=>{
 const{sim,suspectId}=fixture('multiplayer');const c=sim.checkpoint(),suspect=c.state.records.find(r=>r.vehicle.entityId===suspectId)!;suspect.vehicle.status='active';suspect.vehicle.health=10;suspect.vehicle.respawnAtTick=null;
 const officer=c.state.records.find(r=>r.vehicle.playerId==='a')!;officer.vehicle.pose={x:0,z:-20,yaw:0};sim.restore(c);
 sim.step(new Map([[officer.vehicle.entityId,{actions:{...neutralActions(),fire:true},sessionEpoch:'test',sourceCommandSequence:0}]]));ticks(sim,30);
 expect(sim.snapshot().vehicles.find(v=>v.entityId===suspectId)!.status).toBe('wrecked');expect(sim.snapshot().phase).toBe('playing');expect(sim.snapshot().pursuit!.winnerPlayerId).toBeNull();
});
