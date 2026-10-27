import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import * as geometry from '../physics/geometry';
import {packSnapshot,unpackSnapshot,neutralActions} from '@fender/contracts';
import {districtMap} from '@fender/content';
import {createSimulation,type Simulation} from './simulation';
import {initPhysics} from '../physics/rapier';
const sims:Simulation[]=[];beforeAll(initPhysics);afterEach(()=>sims.splice(0).forEach(s=>s.dispose()));
const bank={id:'test-bank',x:9,z:-40,yaw:0,length:10,width:2,height:1.3};
function fixture(stage=8){const sim=createSimulation(districtMap,{campaign:true,pursuit:true,trafficCount:0,snowbanks:[bank]} as any);sims.push(sim);sim.addPlayer({playerId:'a',nickname:'Snowplough'});const c=sim.checkpoint();c.state.phase='playing';c.state.phaseEnd=10000;c.state.campaign!.dispatchIndex=stage;c.state.records=c.state.records.filter(r=>r.vehicle.playerId);const car=c.state.records[0]!;car.vehicle.pose={x:9,z:-43,yaw:0};car.vehicle.velocity={x:0,z:15,yawRate:0};car.vehicle.protectedUntilTick=0;sim.restore(c);return sim;}
it('breaks a curb bank once when a moving car drives through, retains it in checkpoints, and restores it on retry',()=>{const sim=fixture();sim.step(new Map());expect((sim.snapshot() as any).brokenSnowbanks).toEqual(['test-bank']);expect(unpackSnapshot(packSnapshot(sim.snapshot())).brokenSnowbanks).toEqual(['test-bank']);const saved=sim.checkpoint();sim.step(new Map());sim.restore(saved);expect((sim.snapshot() as any).brokenSnowbanks).toEqual(['test-bank']);const c=sim.checkpoint();c.state.phase='results';sim.restore(c);sim.rematch('a');expect((sim.snapshot() as any).brokenSnowbanks).toEqual([]);});
it('leaves banks intact for a stationary car or a car on the road, and has no banks in a dry dispatch',()=>{for(const [stage,x,speed] of [[8,9,0],[8,4,15],[7,9,15]]){const sim=fixture(stage),c=sim.checkpoint();c.state.records[0]!.vehicle.pose.x=x!;c.state.records[0]!.vehicle.velocity.z=speed!;sim.restore(c);sim.step(new Map());expect((sim.snapshot() as any).brokenSnowbanks??[]).toEqual([]);}});

it.each(['bullet','bomb'] as const)('breaks a winter bank with a %s without requiring car contact',weapon=>{const sim=fixture(),c=sim.checkpoint(),car=c.state.records[0]!;car.vehicle.pose={x:9,z:-49,yaw:0};car.vehicle.velocity={x:0,z:0,yawRate:0};if(weapon==='bomb')c.state.grenades=[{entityId:'snow-bomb',ownerEntityId:car.vehicle.entityId,origin:{...car.vehicle.pose},target:{x:bank.x,z:bank.z,yaw:0},bornTick:0,landsAtTick:0,detonatesAtTick:1,blastRadius:5,damage:20}];sim.restore(c);for(let i=0;i<8;i++)sim.step(weapon==='bullet'?new Map([[car.vehicle.entityId,{actions:{...neutralActions(),fire:true},sessionEpoch:'test',sourceCommandSequence:i}]]):new Map());expect(sim.snapshot().brokenSnowbanks).toEqual(['test-bank']);});

it('rejects invalid or unbounded snowbank definitions before allocating a world',()=>{for(const snowbanks of [[bank,bank],[{...bank,width:0}],[{...bank,x:NaN}],Array.from({length:321},(_,i)=>({...bank,id:String(i)}))])expect(()=>createSimulation(districtMap,{snowbanks})).toThrow('Invalid snowbank definitions');});

it('keeps exact collision work local instead of testing every distant snowbank on every tick',()=>{
 const distant=Array.from({length:280},(_,i)=>({...bank,id:`far-${i}`,x:150+i%10,z:130+Math.floor(i/10)}));
 const sim=createSimulation(districtMap,{campaign:true,pursuit:true,trafficCount:0,snowbanks:[bank,...distant]});sims.push(sim);sim.addPlayer({playerId:'a',nickname:'Snow budget'});
 const c=sim.checkpoint();c.state.phase='playing';c.state.phaseEnd=10000;c.state.campaign!.dispatchIndex=8;c.state.records=c.state.records.filter(r=>r.vehicle.playerId);const car=c.state.records[0]!;car.vehicle.pose={x:9,z:-43,yaw:0};car.vehicle.velocity={x:0,z:15,yawRate:0};sim.restore(c);
 const overlap=vi.spyOn(geometry,'overlap'),segment=vi.spyOn(geometry,'segmentPolygon');
 try{sim.step(new Map());expect(sim.snapshot().brokenSnowbanks).toEqual(['test-bank']);expect(overlap.mock.calls.length+segment.mock.calls.length,'A single nearby pile must not cause hundreds of exact polygon tests').toBeLessThan(32);}finally{overlap.mockRestore();segment.mockRestore();}
});

it('does not scan distant piles with exact ray tests while firing in snow',()=>{
 const snowbanks=Array.from({length:280},(_,i)=>({...bank,id:`far-${i}`,x:150+i%10,z:130+Math.floor(i/10)}));
 const sim=createSimulation(districtMap,{campaign:true,pursuit:true,trafficCount:0,snowbanks});sims.push(sim);sim.addPlayer({playerId:'a',nickname:'Snow patrol'});
 const c=sim.checkpoint();c.state.phase='playing';c.state.phaseEnd=10000;c.state.campaign!.dispatchIndex=8;c.state.records=c.state.records.filter(r=>r.vehicle.playerId);const car=c.state.records[0]!;car.vehicle.pose={x:0,z:-40,yaw:0};car.vehicle.protectedUntilTick=0;sim.restore(c);
 const segment=vi.spyOn(geometry,'segmentPolygon');
 try{sim.step(new Map([[car.vehicle.entityId,{actions:{...neutralActions(),fire:true},sessionEpoch:'test',sourceCommandSequence:0}]]));expect(sim.snapshot().projectiles).toHaveLength(2);expect(segment.mock.calls.length,'Ordinary gunfire must not perform hundreds of distant bank ray tests').toBeLessThan(32);}finally{segment.mockRestore();}
});

it('can finish a directly selected final dispatch and open another case without inventing earlier outcomes',()=>{const sim=createSimulation(districtMap,{campaign:true,pursuit:true,trafficCount:0});sims.push(sim);sim.addPlayer({playerId:'a',nickname:'Final inspector'});expect(sim.debugDispatch(10)).toBe(true);expect(sim.startRound('a')).toBe(true);const c=sim.checkpoint();c.state.phase='playing';c.state.phaseEnd=c.tick+10000;c.state.contenderTicks=[['a',179]];for(const r of c.state.records){r.traffic=undefined;r.bossAi=undefined;r.vehicle.pose={x:0,z:r.vehicle.playerId?5:0,yaw:0};r.vehicle.velocity={x:0,z:9,yawRate:0};r.vehicle.protectedUntilTick=0;}sim.restore(c);sim.step(new Map());expect(sim.snapshot()).toMatchObject({phase:'results',campaign:{status:'complete',dispatchIndex:9}});expect(sim.snapshot().campaign!.outcomes).toHaveLength(1);expect(sim.rematch('a')).toBe(true);expect(sim.snapshot().campaign).toMatchObject({dispatchIndex:0,outcomes:[]});});
