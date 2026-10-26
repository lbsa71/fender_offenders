import { afterEach, beforeAll, expect, it } from 'vitest';
import { getBossTactics, neutralActions, type CollisionMap } from '@fender/contracts';
import { createSimulation, type Simulation } from '../core/simulation.js';
import { initPhysics } from '../physics/rapier.js';
import { newBossAi, stepBossAi } from './boss-ai.js';
import { driveVehicle, newDriver } from '../vehicles/controller.js';
const arena=():CollisionMap=>({id:'boss-arena',revision:'boss-1',bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},colliders:[],surfaces:[],spawns:[{id:'a',pose:{x:-40,z:-30,yaw:0},clearanceRadius:5},{id:'b',pose:{x:40,z:30,yaw:0},clearanceRadius:5}],laneNodes:[{id:'south',x:0,z:-100},{id:'north',x:0,z:100}],laneEdges:[{from:'south',to:'north',speedLimit:.01},{from:'north',to:'south',speedLimit:.01}]});
const sims:Simulation[]=[];
function fixture(stage=1,map=arena()){
 const sim=createSimulation(map,{mode:'practice',trafficCount:0,pursuit:true,campaign:true});sims.push(sim);sim.addPlayer({playerId:'officer',nickname:'Officer',bodyAssetId:'patrol'});
 const c=sim.checkpoint(),target=c.state.records.find(r=>r.traffic?.suspect)!;c.state.phase='playing';c.state.phaseEnd=10000;c.state.campaign!.dispatchIndex=stage;
 target.vehicle.pose={x:0,z:0,yaw:0};target.vehicle.velocity={x:0,z:0,yawRate:0};target.vehicle.protectedUntilTick=0;
 const officer=c.state.records.find(r=>r.vehicle.playerId==='officer')!;officer.vehicle.pose={x:0,z:20,yaw:0};officer.vehicle.velocity={x:0,z:0,yawRate:0};officer.vehicle.protectedUntilTick=0;sim.restore(c);
 return{sim,targetId:target.vehicle.entityId,officerId:officer.vehicle.entityId};
}
const ticks=(sim:Simulation,count:number)=>{for(let i=0;i<count;i++)sim.step(new Map());};
beforeAll(initPhysics);afterEach(()=>sims.splice(0).forEach(sim=>sim.dispose()));
it('the second campaign target fires a bounded forward burst and actually damages a connected officer',()=>{
 const{sim,targetId,officerId}=fixture();ticks(sim,180);const events=sim.drainEvents();expect(events.filter(e=>e.kind==='shot'&&e.payload.shooterId===targetId).length).toBeGreaterThan(0);
 const officer=sim.snapshot().vehicles.find(v=>v.entityId===officerId)!;expect(officer.health).toBeLessThan(100);expect(officer.health).toBe(86);expect(sim.snapshot().scores[0]!.score).toBe(0);expect(sim.snapshot().phase).toBe('playing');expect(sim.snapshot().campaign!.outcomes).toEqual([]);
});
it('the grenade ringleader visibly throws a fixed landing target, then detonates once with real damage',()=>{
 const{sim,targetId,officerId}=fixture(4);ticks(sim,100);const grenade=sim.snapshot().grenades?.[0];expect(grenade,'Hector must throw an authoritative visible grenade').toBeDefined();
 expect(grenade!.ownerEntityId).toBe(targetId);expect(grenade!.detonatesAtTick-grenade!.bornTick).toBeGreaterThanOrEqual(72);expect(grenade!.blastRadius).toBeLessThanOrEqual(7);expect(sim.snapshot().vehicles.find(v=>v.entityId===officerId)!.health).toBe(100);
 ticks(sim,100);expect(sim.snapshot().vehicles.find(v=>v.entityId===officerId)!.health).toBeLessThan(100);const events=sim.drainEvents();expect(events.filter(e=>e.kind==='grenade-exploded')).toHaveLength(1);expect(sim.snapshot().grenades).toEqual([]);
});
it('produces four distinct real-controller ringleader trajectories under a closing pursuit, including brake checks and different serpentine rhythms',()=>{
 const{sim,targetId,officerId}=fixture();const snapshot=sim.snapshot(),source=snapshot.vehicles.find(v=>v.entityId===targetId)!,officer=structuredClone(snapshot.vehicles.find(v=>v.entityId===officerId)!);
 const paths=[1,4,7,9].map(stage=>{
  const vehicle=structuredClone(source),runtime=newBossAi(0),driver=newDriver(),steers:number[]=[],speeds:number[]=[];vehicle.velocity.z=12;
  for(let tick=1;tick<=240;tick++){
   const fx=Math.sin(vehicle.pose.yaw),fz=Math.cos(vehicle.pose.yaw);
   officer.pose={x:vehicle.pose.x-fx*14+fz*4,z:vehicle.pose.z-fz*14-fx*4,yaw:vehicle.pose.yaw};
   officer.velocity={x:vehicle.velocity.x+fx*6,z:vehicle.velocity.z+fz*6,yawRate:0};
   const decision=stepBossAi(vehicle,{...neutralActions(),throttle:.65},[officer],runtime,getBossTactics(stage),tick,20,()=>false);steers.push(decision.actions.steer);driveVehicle(vehicle,driver,decision.actions,arena(),[]);speeds.push(Math.hypot(vehicle.velocity.x,vehicle.velocity.z));
  }
  return{vehicle,steers,speeds};
 });
 expect(Math.min(...paths[0]!.speeds.slice(0,90)),'Mabel must perform a real brake check').toBeLessThan(2);
 const signatures=paths.map(path=>[path.vehicle.pose.x,path.vehicle.pose.z,path.vehicle.pose.yaw].map(n=>Math.round(n*10)).join(','));expect(new Set(signatures).size).toBe(4);
 const changes=(steers:number[])=>steers.reduce((count,value,index)=>index&&value*steers[index-1]!<0?count+1:count,0);
 expect(changes(paths[2]!.steers)).toBeGreaterThan(changes(paths[1]!.steers));
 expect(Math.max(...paths[2]!.steers.map(Math.abs))).toBeGreaterThan(Math.max(...paths[1]!.steers.map(Math.abs)));
});
it('allows a matched-speed front cutoff to finish an arrest during the suspect breakaway',()=>{
 const{sim,targetId,officerId}=fixture(1),c=sim.checkpoint(),boss=c.state.records.find(r=>r.vehicle.entityId===targetId)!,officer=c.state.records.find(r=>r.vehicle.entityId===officerId)!;
 const speed=getBossTactics(1).cruiseSpeed;
 boss.vehicle.velocity={x:0,z:speed,yawRate:0};officer.vehicle.pose={x:0,z:5,yaw:0};officer.vehicle.velocity={x:0,z:speed,yawRate:0};
 boss.bossAi=newBossAi(c.tick);boss.bossAi.breakawayUntilTick=c.tick+60;boss.bossAi.nextBrakeCheckTick=c.tick+420;
 c.state.contenderTicks=[['officer',179]];sim.restore(c);ticks(sim,1);
 expect(sim.snapshot()).toMatchObject({phase:'results',pursuit:{state:'complete',winnerPlayerId:'officer'}});
 expect(sim.snapshot().campaign!.outcomes).toMatchObject([{outcome:'arrested',playerId:'officer'}]);
});
it('uses deterministic target ties, visible windup, bounded bursts and a recovery gap',()=>{
 const{sim,targetId,officerId}=fixture();const source=sim.snapshot().vehicles.find(v=>v.entityId===targetId)!,officer=sim.snapshot().vehicles.find(v=>v.entityId===officerId)!,second={...structuredClone(officer),entityId:'aaa-officer',playerId:'second'};
 const runtime=newBossAi(0),tactics=getBossTactics(1),base=neutralActions(),fireTicks:number[]=[];
 for(let tick=1;tick<=tactics.windupTicks+tactics.burstIntervalTicks+tactics.burstRecoveryTicks;tick++){const result=stepBossAi(source,base,[officer,second],runtime,tactics,tick,.01,()=>false);if(result.fire)fireTicks.push(tick);}
 expect(runtime.targetId).toBe('aaa-officer');expect(fireTicks).toHaveLength(2);expect(fireTicks[0]).toBeGreaterThanOrEqual(tactics.windupTicks);expect(fireTicks[1]!-fireTicks[0]!).toBe(tactics.burstIntervalTicks);expect(runtime.nextAttackTick).toBeGreaterThan(fireTicks[1]!);
});
it.each(['lobby','countdown','results','protected-officer','protected-boss','disconnected','wrecked','respawning','out-of-range','occluded','civilian'] as const)('does not attack in the forbidden %s context',context=>{
 const authored=arena();if(context==='occluded')authored.colliders.push({id:'cover',shape:'box',pose:{x:0,z:10,yaw:0},halfExtents:{x:20,y:3,z:.2},layer:'world-solid',surface:'asphalt'});
 const{sim,targetId,officerId}=fixture(9,authored),c=sim.checkpoint(),boss=c.state.records.find(r=>r.vehicle.entityId===targetId)!,officer=c.state.records.find(r=>r.vehicle.entityId===officerId)!;
 if(context==='lobby'||context==='countdown'||context==='results'){c.state.phase=context;c.state.phaseEnd=null;}
 if(context==='protected-officer')officer.vehicle.protectedUntilTick=9999;
 if(context==='protected-boss')boss.vehicle.protectedUntilTick=9999;
 if(context==='disconnected')c.state.scores[0]!.connection='reconnecting';
 if(context==='wrecked'||context==='respawning'){boss.vehicle.status=context;boss.vehicle.respawnAtTick=9999;}
 if(context==='out-of-range')officer.vehicle.pose.z=100;
 if(context==='civilian'){const civilian=structuredClone(officer);civilian.vehicle.playerId=null;civilian.vehicle.entityId='civilian';civilian.vehicle.pose.z=20;c.state.records.push(civilian);officer.vehicle.pose.z=100;}
 sim.restore(c);ticks(sim,180);expect(sim.drainEvents().filter(e=>e.kind==='shot'||e.kind==='grenade-thrown')).toEqual([]);expect(sim.snapshot().vehicles.find(v=>v.entityId===officerId)!.health).toBe(100);
});
function thrown(sim:Simulation){for(let tick=0;tick<180&&!sim.snapshot().grenades?.length;tick++)sim.step(new Map());const grenade=sim.snapshot().grenades?.[0];expect(grenade,'An armed grenadier must create a visible warning before blast tests').toBeDefined();return grenade!;}
it('locks a grenade landing point at throw, applies bounded distance falloff, and excludes owner and civilians',()=>{
 const{sim,targetId,officerId}=fixture(4),grenade=thrown(sim),c=sim.checkpoint(),officer=c.state.records.find(r=>r.vehicle.entityId===officerId)!,owner=c.state.records.find(r=>r.vehicle.entityId===targetId)!;
 officer.vehicle.pose={...grenade.target,x:grenade.target.x+grenade.blastRadius/2};owner.vehicle.pose={...grenade.target};owner.vehicle.velocity={x:0,z:0,yawRate:0};
 const civilian=structuredClone(officer);civilian.vehicle.playerId=null;civilian.vehicle.entityId='innocent';civilian.vehicle.pose.x=grenade.target.x-grenade.blastRadius/2;c.state.records.push(civilian);const health=owner.vehicle.health;sim.restore(c);
 expect(sim.snapshot().grenades![0]!.target).toEqual(grenade.target);ticks(sim,grenade.detonatesAtTick-c.tick);
 expect(sim.snapshot().vehicles.find(v=>v.entityId===officerId)!.health).toBe(100-Math.round(grenade.damage/2));expect(sim.snapshot().vehicles.find(v=>v.entityId===targetId)!.health).toBe(health);expect(sim.snapshot().vehicles.find(v=>v.entityId==='innocent')!.health).toBe(100);expect(sim.drainEvents().filter(e=>e.kind==='grenade-exploded')).toHaveLength(1);
});
it.each(['cover','shield','disconnect','dodge'] as const)('blocks a grenade blast using %s at detonation rather than trusting the throw-time target',context=>{
 const authored=arena();if(context==='cover')authored.colliders.push({id:'blast-cover',shape:'box',pose:{x:0,z:22,yaw:0},halfExtents:{x:10,y:3,z:.1},layer:'world-solid',surface:'asphalt'});
 const{sim,officerId}=fixture(4,authored),grenade=thrown(sim),c=sim.checkpoint(),officer=c.state.records.find(r=>r.vehicle.entityId===officerId)!;
 if(context==='cover')officer.vehicle.pose.z=24;
 if(context==='shield')officer.vehicle.protectedUntilTick=9999;
 if(context==='disconnect')c.state.scores[0]!.connection='reconnecting';
 if(context==='dodge')officer.vehicle.pose.x=grenade.target.x+grenade.blastRadius+2;
 sim.restore(c);ticks(sim,grenade.detonatesAtTick-c.tick);
 expect(sim.snapshot().vehicles.find(v=>v.entityId===officerId)!.health).toBe(100);expect(sim.drainEvents().filter(e=>e.kind==='grenade-exploded')).toHaveLength(1);
});
it('an AI projectile can wreck an officer without receiving points or resolving the campaign',()=>{
 const{sim,officerId}=fixture(),c=sim.checkpoint();c.state.records.find(r=>r.vehicle.entityId===officerId)!.vehicle.health=3;sim.restore(c);ticks(sim,180);
 expect(sim.snapshot().vehicles.find(v=>v.entityId===officerId)!.status).toBe('wrecked');expect(sim.snapshot().scores[0]!.score).toBe(0);expect(sim.snapshot().campaign!.outcomes).toEqual([]);expect(sim.snapshot().phase).toBe('playing');expect(sim.drainEvents().find(e=>e.kind==='wreck')).toMatchObject({payload:{creditedPlayerId:null}});
});
it('checkpoints visible grenades and attack scheduling so replay preserves damage, events and brain state',()=>{
 const{sim}=fixture(4);thrown(sim);ticks(sim,15);const c=sim.checkpoint();sim.drainEvents();const run=()=>{ticks(sim,100);return{snapshot:sim.snapshot(),checkpoint:sim.checkpoint(),events:sim.drainEvents()};};const first=run();sim.restore(c);expect(run()).toEqual(first);expect(first.events.filter(e=>e.kind==='grenade-exploded')).toHaveLength(1);
});
it.each(['arrest','timeout','wreck'] as const)('clears all grenade hazards on %s and starts the next briefing with a fresh brain',condition=>{
 const{sim,targetId,officerId}=fixture(4);thrown(sim);const c=sim.checkpoint();
 if(condition==='timeout')c.state.phaseEnd=c.tick+1;
 else{const officer=c.state.records.find(r=>r.vehicle.entityId===officerId)!,boss=c.state.records.find(r=>r.vehicle.entityId===targetId)!;boss.vehicle.pose={x:0,z:0,yaw:0};boss.vehicle.velocity={x:0,z:0,yawRate:0};officer.vehicle.pose=condition==='wreck'?{x:0,z:-5.5,yaw:0}:{x:-5,z:0,yaw:0};officer.vehicle.velocity={x:0,z:0,yawRate:0};if(condition==='wreck')boss.vehicle.health=5;else c.state.contenderTicks=[['officer',179]];}
 sim.restore(c);sim.step(condition==='wreck'?new Map([[officerId,{actions:{...neutralActions(),fire:true},sessionEpoch:'test',sourceCommandSequence:0}]]):new Map());expect(sim.snapshot().phase).toBe('results');expect(sim.snapshot().grenades).toEqual([]);sim.drainEvents();ticks(sim,180);expect(sim.drainEvents().filter(e=>e.kind==='grenade-exploded')).toEqual([]);expect(sim.rematch('officer')).toBe(true);expect(sim.snapshot().grenades).toEqual([]);expect(sim.checkpoint().state.records.find(r=>r.vehicle.entityId===targetId)!.bossAi).toBeUndefined();
});
it('the Chairman actually alternates forward gun bursts and grenades without changing player weapon damage',()=>{
 const{sim,targetId}=fixture(9);ticks(sim,260);const events=sim.drainEvents(),shots=events.filter(e=>e.kind==='shot'&&e.payload.shooterId===targetId);expect(shots).toHaveLength(5);expect(events.filter(e=>e.kind==='grenade-thrown')).toHaveLength(1);expect(sim.snapshot().scores[0]!.score).toBe(0);
});
it('keeps AI muzzles and bullets aligned with the car and uses civilians as harmless projectile obstructions',()=>{
 const{sim,targetId,officerId}=fixture(),c=sim.checkpoint(),civilian=structuredClone(c.state.records.find(r=>r.vehicle.entityId===officerId)!);civilian.vehicle.playerId=null;civilian.vehicle.entityId='civilian-blocker';civilian.vehicle.pose.z=10;c.state.records.push(civilian);sim.restore(c);
 let shot:ReturnType<Simulation['drainEvents']>[number]|undefined;
 for(let tick=0;tick<180&&!shot;tick++){sim.step(new Map());shot=sim.drainEvents().find(e=>e.kind==='shot'&&e.payload.shooterId===targetId);}
 expect(shot?.kind).toBe('shot');if(shot?.kind!=='shot')throw new Error('Missing AI shot');const boss=sim.snapshot().vehicles.find(v=>v.entityId===targetId)!;
 for(const origin of shot.payload.origins!){expect(origin.yaw).toBe(boss.pose.yaw);expect((origin.x-boss.pose.x)*Math.sin(boss.pose.yaw)+(origin.z-boss.pose.z)*Math.cos(boss.pose.yaw)).toBeCloseTo(2.45,8);}
 ticks(sim,30);expect(sim.snapshot().vehicles.find(v=>v.entityId===officerId)!.health).toBe(100);expect(sim.snapshot().vehicles.find(v=>v.entityId==='civilian-blocker')!.health).toBe(100);
});
it('caps authoritative grenade allocation and resumes throwing when a slot is available',()=>{
 const{sim,targetId}=fixture(4),grenade=thrown(sim),c=sim.checkpoint();c.state.grenades=Array.from({length:8},(_,i)=>({...structuredClone(grenade),entityId:`pool-${i}`,detonatesAtTick:9999}));const ai=c.state.records.find(r=>r.vehicle.entityId===targetId)!.bossAi!;ai.attackKind='grenade';ai.windupUntilTick=c.tick+1;ai.nextGrenadeTick=0;sim.restore(c);ticks(sim,1);
 expect(sim.snapshot().grenades).toHaveLength(8);expect(sim.drainEvents().filter(e=>e.kind==='grenade-thrown')).toEqual([]);
 const available=sim.checkpoint();available.state.grenades!.pop();const brain=available.state.records.find(r=>r.vehicle.entityId===targetId)!.bossAi!;brain.attackKind='grenade';brain.windupUntilTick=available.tick+1;brain.nextGrenadeTick=0;sim.restore(available);ticks(sim,1);expect(sim.snapshot().grenades).toHaveLength(8);expect(sim.drainEvents().filter(e=>e.kind==='grenade-thrown')).toHaveLength(1);
});
