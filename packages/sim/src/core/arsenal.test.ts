import { afterEach, beforeAll, expect, it } from 'vitest';
import { getDispatchFeatures, neutralActions, type CollisionMap, type DriverActions } from '@fender/contracts';
import { createSimulation, predictVehicle, type Simulation } from './simulation';
import { initPhysics } from '../physics/rapier';
const map:CollisionMap={id:'arsenal',revision:'arsenal',bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},colliders:[],surfaces:[],spawns:[{id:'a',pose:{x:0,z:0,yaw:0},clearanceRadius:5}],laneNodes:[{id:'a',x:-80,z:80},{id:'b',x:80,z:80}],laneEdges:[{from:'a',to:'b',speedLimit:1}]};
const sims:Simulation[]=[];
function fixture(stage:number){const sim=createSimulation(map,{campaign:true,pursuit:true,trafficCount:0});sims.push(sim);sim.addPlayer({playerId:'a',nickname:'Procurement'});sim.addPlayer({playerId:'b',nickname:'Backup'});const c=sim.checkpoint();c.state.campaign!.dispatchIndex=stage;c.state.phase='playing';c.state.phaseEnd=10000;for(const r of c.state.records){r.vehicle.protectedUntilTick=0;r.vehicle.velocity={x:0,z:0,yawRate:0};r.vehicle.pose={x:r.vehicle.playerId==='a'?0:50,z:0,yaw:0};r.traffic=undefined;}sim.restore(c);return sim;}
function deploy(sim:Simulation,kind:string,sequence=0){const id=sim.snapshot('a').local!.vehicle.entityId;sim.step(new Map([[id,{actions:{...neutralActions(),deploy:kind} as DriverActions,sessionEpoch:'test',sourceCommandSequence:sequence}]]));}
beforeAll(initPhysics);afterEach(()=>sims.splice(0).forEach(sim=>sim.dispose()));
it.each([['bomb',4],['oil',7],['blades',8]] as const)('authoritatively rejects %s before its unlock and deploys it only after procurement',(kind,stage)=>{
 const locked=fixture(stage-1);deploy(locked,kind);expect(locked.snapshot().grenades).toEqual([]);expect(locked.snapshot().gadgets).toEqual([]);
 const sim=fixture(stage);deploy(sim,kind);const states=kind==='bomb'?sim.snapshot().grenades!:sim.snapshot().gadgets!;expect(states).toHaveLength(1);expect(states[0]!.ownerEntityId).toBe(sim.snapshot('a').local!.vehicle.entityId);
 const c=sim.checkpoint();expect(c.state.records.find(r=>r.vehicle.playerId==='a')!.driver).toHaveProperty('nextDeployTick',721);for(let i=0;i<10;i++)deploy(sim,kind,i+1);expect((kind==='bomb'?sim.snapshot().grenades!:sim.snapshot().gadgets!)).toHaveLength(1);sim.restore(c);expect(sim.checkpoint()).toEqual(c);
});
it.each(['bomb','oil','blades'])('rejects %s while protected or outside an active dispatch',kind=>{
 for(const phase of ['protected','countdown','results'] as const){const sim=fixture(9),c=sim.checkpoint();if(phase==='protected')c.state.records.find(r=>r.vehicle.playerId==='a')!.vehicle.protectedUntilTick=999;else c.state.phase=phase;sim.restore(c);deploy(sim,kind);expect(sim.snapshot().gadgets).toEqual([]);expect(sim.snapshot().grenades).toEqual([]);}
});
it('police bombs damage the suspect, spare backup and preserve normal credited wreck resolution',()=>{
 const sim=fixture(4);deploy(sim,'bomb');const c=sim.checkpoint(),g=c.state.grenades![0]!;expect(g).toBeDefined();
 const target=c.state.records.find(r=>r.vehicle.entityId===c.state.pursuit!.suspectId)!,backup=c.state.records.find(r=>r.vehicle.playerId==='b')!;target.vehicle.pose={...g.target};target.vehicle.health=1;backup.vehicle.pose={x:g.target.x+3,z:g.target.z,yaw:0};c.tick=g.detonatesAtTick-1;sim.restore(c);sim.step(new Map());
 expect(sim.snapshot().campaign!.outcomes[0]).toMatchObject({outcome:'wrecked',playerId:'a'});expect(sim.snapshot().vehicles.find(v=>v.playerId==='b')!.health).toBe(backup.vehicle.health);
});
it('police hubcap blades apply a single credited hit to the suspect and never hit backup',()=>{
 const sim=fixture(8);deploy(sim,'blades');const c=sim.checkpoint();expect(c.state.gadgets).toHaveLength(1);const g=c.state.gadgets![0]!.gadget;const target=c.state.records.find(r=>r.vehicle.entityId===c.state.pursuit!.suspectId)!,backup=c.state.records.find(r=>r.vehicle.playerId==='b')!;target.vehicle.pose={x:2.35,z:0,yaw:0};backup.vehicle.pose={x:-2.35,z:0,yaw:0};c.tick=g.activeAtTick-1;sim.restore(c);sim.step(new Map());expect(sim.snapshot().vehicles.find(v=>v.entityId===target.vehicle.entityId)!.health).toBe(target.vehicle.health-8);expect(sim.snapshot().vehicles.find(v=>v.playerId==='b')!.health).toBe(backup.vehicle.health);const after=sim.checkpoint();sim.step(new Map());expect(sim.snapshot().vehicles.find(v=>v.entityId===target.vehicle.entityId)!.health).toBe(target.vehicle.health-8);sim.restore(after);sim.step(new Map());expect(sim.snapshot().vehicles.find(v=>v.entityId===target.vehicle.entityId)!.health).toBe(target.vehicle.health-8);
});
it('delays police fire through dispatch two without suppressing suspect guns, with prediction matching unlock',()=>{
 for(const stage of [0,1,2]){const sim=fixture(stage),local=sim.snapshot('a').local!,actions={...neutralActions(),fire:true};sim.step(new Map([[local.vehicle.entityId,{actions,sessionEpoch:'test',sourceCommandSequence:0}]]));expect(sim.drainEvents().some(e=>e.kind==='shot')).toBe(stage>=2);const predicted=predictVehicle(map,local.vehicle,local.driver,actions,[],undefined,1,getDispatchFeatures(stage));expect(predicted.driver.shotOrdinal>0).toBe(stage>=2);}
});

it('shares an exact twelve-second cooldown across manual weapons and does not consume it on a blocked throw',()=>{
 const sim=fixture(9);deploy(sim,'bomb');const c=sim.checkpoint();c.tick=719;sim.restore(c);deploy(sim,'oil');expect(sim.snapshot().gadgets).toEqual([]);deploy(sim,'oil',1);expect(sim.snapshot().gadgets).toHaveLength(1);expect(sim.snapshot().gadgets![0]!.bornTick).toBe(721);expect(sim.snapshot('a').local!.driver.nextDeployTick).toBe(1441);
 const blocked=fixture(9),b=blocked.checkpoint();b.state.records.find(r=>r.vehicle.playerId==='a')!.vehicle.pose.z=90;blocked.restore(b);deploy(blocked,'bomb');expect(blocked.snapshot().grenades).toEqual([]);expect(blocked.snapshot('a').local!.driver.nextDeployTick).toBeUndefined();deploy(blocked,'blades',1);expect(blocked.snapshot().gadgets).toHaveLength(1);
});
it('rejects malformed deployment commands without consuming cooldown or creating hazards',()=>{
 const sim=fixture(9);deploy(sim,'laser');expect(sim.snapshot().gadgets).toEqual([]);expect(sim.snapshot().grenades).toEqual([]);expect(sim.snapshot('a').local!.driver.nextDeployTick).toBeUndefined();
});

it('cannot replay a consumed deployment sequence after its cooldown expires',()=>{
 const sim=fixture(9);deploy(sim,'bomb');const c=sim.checkpoint();c.tick=720;sim.restore(c);deploy(sim,'oil',0);expect(sim.snapshot().gadgets).toEqual([]);deploy(sim,'oil',1);expect(sim.snapshot().gadgets).toHaveLength(1);
});
