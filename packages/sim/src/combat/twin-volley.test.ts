import { afterEach,beforeAll,expect,it } from 'vitest';
import { neutralActions,type CollisionMap,type GameEvent,type ProjectileState } from '@fender/contracts';
import { createSimulation,type Simulation } from '../core/simulation.js';
import { DEFAULT_GAMEPLAY_CONFIG } from '../core/config.js';
import { initPhysics } from '../physics/rapier.js';
const map=():CollisionMap=>({id:'volley-arena',revision:'volley-1',bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},colliders:[],surfaces:[],spawns:[{id:'a',pose:{x:0,z:-40,yaw:0},clearanceRadius:5},{id:'b',pose:{x:0,z:40,yaw:0},clearanceRadius:5}],laneNodes:[],laneEdges:[]});
const sims:Simulation[]=[];
function setup(target:{x:number;z:number}|null=null,fixture=map(),damage=10){
 const sim=createSimulation(fixture,{trafficCount:0,config:{...DEFAULT_GAMEPLAY_CONFIG,weapon:{...DEFAULT_GAMEPLAY_CONFIG.weapon,damage}}});sims.push(sim);
 const car=sim.addPlayer({playerId:'a',nickname:'a',sessionEpoch:'test'});if(target)sim.addPlayer({playerId:'b',nickname:'b'});
 const c=sim.checkpoint();c.state.records[0]!.vehicle.pose={x:0,z:0,yaw:0};for(const r of c.state.records)r.vehicle.protectedUntilTick=0;
 if(target)c.state.records[1]!.vehicle.pose={...target,yaw:0};sim.restore(c);
 const step=(sequence=0,fire=true)=>sim.step(new Map([[car.entityId,{actions:{...neutralActions(),fire},sessionEpoch:'test',sourceCommandSequence:sequence}]]));
 return{sim,car,step};
}
const shots=(events:GameEvent[])=>events.filter((event):event is Extract<GameEvent,{kind:'shot'}>=>event.kind==='shot');
beforeAll(initPhysics);afterEach(()=>sims.splice(0).forEach(sim=>sim.dispose()));
it('spawns two real projectiles from the left and right tips ahead of the car for one shot event',()=>{
 const {sim,step}=setup();step();const projectiles=sim.snapshot().projectiles;
 expect(projectiles).toHaveLength(2);const shot=shots(sim.drainEvents())[0]!;
 expect(shot.payload.origins).toEqual([{x:-.63,z:2.45,yaw:0},{x:.63,z:2.45,yaw:0}]);
 expect(shot.payload.origin).toEqual(shot.payload.origins![0]);expect(shot.payload.projectileIds).toEqual(projectiles.map(p=>p.entityId));
 expect(new Set(projectiles.map(p=>p.entityId)).size).toBe(2);expect(new Set(projectiles.map(p=>p.volleyId)).size).toBe(1);
 for(const [i,p]of projectiles.entries()){expect(p).toMatchObject({barrelIndex:i,damage:5,sourceShotOrdinal:1,volleyId:shot.payload.volleyId});expect(p.pose.x-p.velocity.x/60).toBeCloseTo(shot.payload.origins![i]!.x,10);expect(p.pose.z-p.velocity.z/60).toBeCloseTo(2.45,10);}
});
it('keeps one volley every twelve ticks, two independent half-damage hits, and owner immunity',()=>{
 const {sim,step}=setup({x:0,z:20});step();for(let i=1;i<25;i++)step(i,false);
 const events=sim.drainEvents(),hits=events.filter(e=>e.kind==='hit');expect(hits).toHaveLength(2);expect(hits.map(e=>e.payload.damage)).toEqual([5,5]);
 expect(sim.authority('b')!.vehicle.health).toBe(90);expect(sim.authority('a')!.vehicle.health).toBe(100);expect(shots(events)).toHaveLength(1);
 const held=setup();for(let i=0;i<36;i++)held.step(i);expect(shots(held.sim.drainEvents()).map(e=>e.serverTick)).toEqual([1,13,25]);
});
it('applies room weapon overrides proportionally across both barrels',()=>{
 const {sim,step}=setup({x:0,z:20},map(),12);step();for(let i=0;i<25;i++)sim.step(new Map());expect(sim.authority('b')!.vehicle.health).toBe(88);
});
it('sweeps both center-to-muzzle paths so a close wall cannot be skipped',()=>{
 const fixture=map();fixture.colliders.push({id:'close',shape:'box',pose:{x:0,z:2.3,yaw:0},halfExtents:{x:4,y:2,z:.025},layer:'world-solid',surface:'asphalt'});
 const {sim,step}=setup({x:0,z:20},fixture);step();expect(sim.snapshot().projectiles).toHaveLength(0);
 const events=sim.drainEvents();expect(events.filter(e=>e.kind==='projectile-impact')).toHaveLength(2);expect(sim.authority('b')!.vehicle.health).toBe(100);
});
it('lets one barrel hit while the other is occluded without doubling damage',()=>{
 const fixture=map();fixture.colliders.push({id:'left-only',shape:'box',pose:{x:-.63,z:2.3,yaw:0},halfExtents:{x:.13,y:2,z:.025},layer:'world-solid',surface:'asphalt'});
 const {sim,step}=setup({x:0,z:20},fixture);step();for(let i=0;i<25;i++)sim.step(new Map());
 expect(sim.authority('b')!.vehicle.health).toBe(95);const events=sim.drainEvents();expect(events.filter(e=>e.kind==='hit')).toHaveLength(1);expect(events.filter(e=>e.kind==='projectile-impact')).toHaveLength(1);
});
it('resolves a point-blank vehicle between the center and muzzle instead of spawning through it',()=>{
 const {sim,step}=setup({x:0,z:4.4});step();expect(sim.authority('b')!.vehicle.health).toBe(90);expect(sim.snapshot().projectiles).toHaveLength(0);
});
it('still treats a protected point-blank car as an obstruction for both muzzle paths',()=>{
 const {sim,step}=setup({x:0,z:4.4}),c=sim.checkpoint();c.state.records[1]!.vehicle.protectedUntilTick=120;sim.restore(c);step();
 expect(sim.authority('b')!.vehicle.health).toBe(100);expect(sim.snapshot().projectiles).toHaveLength(0);expect(sim.drainEvents().filter(e=>e.kind==='hit')).toHaveLength(0);
});
it('lets both point-blank cars fire their lethal volley before resolving either impact',()=>{
 const {sim,car}=setup({x:0,z:4.4}),c=sim.checkpoint();for(const record of c.state.records)record.vehicle.health=10;c.state.records[1]!.vehicle.pose.yaw=Math.PI;sim.restore(c);
 const other=c.state.records[1]!.vehicle.entityId;
 sim.step(new Map([car.entityId,other].map(entityId=>[entityId,{actions:{...neutralActions(),fire:true},sessionEpoch:'test',sourceCommandSequence:0}])));
 expect(sim.authority('a')!.vehicle.status).toBe('wrecked');expect(sim.authority('b')!.vehicle.status).toBe('wrecked');expect(shots(sim.drainEvents())).toHaveLength(2);
});
it('does not broaden the aim cone to make both offset barrels hit a near miss',()=>{
 const {sim,step}=setup({x:1.8,z:30});step();for(let i=0;i<30;i++)sim.step(new Map());
 expect(sim.authority('b')!.vehicle.health).toBe(95);
});
it('keeps both muzzle offsets attached to a rotated car',()=>{
 const {sim,step}=setup(),c=sim.checkpoint();c.state.records[0]!.vehicle.pose.yaw=Math.PI/2;sim.restore(c);step();const origins=shots(sim.drainEvents())[0]!.payload.origins!;
 expect(origins[0]!.x).toBeCloseTo(2.45,10);expect(origins[0]!.z).toBeCloseTo(.63,10);expect(origins[1]!.x).toBeCloseTo(2.45,10);expect(origins[1]!.z).toBeCloseTo(-.63,10);
});
it('reserves both projectile slots atomically at the bounded projectile cap',()=>{
 const {sim,car,step}=setup(),c=sim.checkpoint();c.state.projectiles=Array.from({length:255},(_,i):ProjectileState=>({entityId:`existing-${i}`,ownerEntityId:car.entityId,pose:{x:-90,z:-90,yaw:0},velocity:{x:0,z:0,yawRate:0},bornTick:0,expiresTick:1000,sourceCommandSequence:-1,sourceShotOrdinal:i}));sim.restore(c);step();
 expect(shots(sim.drainEvents())).toHaveLength(0);expect(sim.snapshot().projectiles).toHaveLength(255);
});
it('replays paired identities, muzzle poses and split damage exactly from a checkpoint',()=>{
 const {sim,step}=setup({x:0,z:20}),c=sim.checkpoint();const run=()=>{for(let i=0;i<36;i++)step(i);return{state:sim.snapshot(),events:sim.drainEvents()};};
 const first=run();sim.restore(c);expect(run()).toEqual(first);
});
it('does not reuse a volley ID when a held command survives a wreck and respawn',()=>{
 const {sim,step}=setup();step();const first=shots(sim.drainEvents())[0]!.payload.volleyId;
 const c=sim.checkpoint(),record=c.state.records[0]!;record.vehicle.status='wrecked';record.vehicle.health=0;record.vehicle.respawnAtTick=2;sim.restore(c);sim.step(new Map());step();
 expect(shots(sim.drainEvents())[0]!.payload.volleyId).not.toBe(first);
});
