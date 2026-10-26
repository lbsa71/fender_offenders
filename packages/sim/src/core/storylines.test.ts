import {afterEach,beforeAll,expect,it} from 'vitest';
import {createSimulation,type Simulation} from './simulation';
import {initPhysics} from '../physics/rapier';
import {STORYLINES,getCampaignTarget,packSnapshot,unpackSnapshot,type CollisionMap} from '@fender/contracts';

const map:CollisionMap={id:'story-arena',revision:'story-arena-1',bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},colliders:[],surfaces:[],spawns:[{id:'unit',pose:{x:-40,z:-30,yaw:0},clearanceRadius:5}],laneNodes:[{id:'south',x:0,z:-80},{id:'north',x:0,z:80}],laneEdges:[{from:'south',to:'north',speedLimit:.01},{from:'north',to:'south',speedLimit:.01}]};
const sims:Simulation[]=[];
function simulation(campaignId:string){const sim=createSimulation(map,{mode:'practice',campaign:true,pursuit:true,trafficCount:0,campaignId});sims.push(sim);sim.addPlayer({playerId:'officer',nickname:'Story patrol'});return sim;}
function steps(sim:Simulation,n:number){for(let i=0;i<n;i++)sim.step(new Map());}
function arrest(sim:Simulation){
 const c=sim.checkpoint(),target=c.state.records.find(r=>r.vehicle.entityId===c.state.pursuit!.suspectId)!,officer=c.state.records.find(r=>r.vehicle.playerId==='officer')!;
 target.vehicle.pose={x:0,z:0,yaw:0};target.vehicle.velocity={x:0,z:0,yawRate:0};target.vehicle.protectedUntilTick=0;target.traffic=undefined;target.bossAi=undefined;
 officer.vehicle.pose={x:-5,z:0,yaw:0};officer.vehicle.velocity={x:0,z:0,yawRate:0};officer.vehicle.protectedUntilTick=0;
 sim.restore(c);steps(sim,180);expect(sim.snapshot().phase).toBe('results');
}
beforeAll(initPhysics);afterEach(()=>sims.splice(0).forEach(sim=>sim.dispose()));

it.each(STORYLINES)('runs exactly ten dispatches of $title with matching targets and retained case identity',story=>{
 const sim=simulation(story.id);
 expect(sim.snapshot().campaign?.campaignId,'Selected case must belong to the room, rather than always using Green Light').toBe(story.id);
 for(let stage=0;stage<10;stage++){
  const state=sim.snapshot();expect(state.campaign).toMatchObject({campaignId:story.id,dispatchIndex:stage,status:'active'});
  expect(state.vehicles.find(v=>v.entityId===state.pursuit!.suspectId)?.bodyAssetId).toBe(getCampaignTarget(story.dispatches[stage]!.targetId).vehicleBodyId);
  expect(sim.startRound('officer')).toBe(true);steps(sim,180);arrest(sim);
  const earned=sim.snapshot().campaign!;expect(earned.outcomes).toHaveLength(stage+1);expect(earned.outcomes.at(-1)).toMatchObject({dispatchIndex:stage,outcome:'arrested',callsign:'Story patrol'});
  expect(earned.status).toBe(stage===9?'complete':'active');expect(unpackSnapshot(packSnapshot(sim.snapshot())).campaign).toEqual(earned);
  const checkpoint=sim.checkpoint();sim.restore(checkpoint);expect(sim.snapshot().campaign).toEqual(earned);
  if(stage<9){expect(sim.rematch('officer')).toBe(true);expect(sim.rematch('officer')).toBe(false);}
 }
 expect(sim.rematch('officer')).toBe(true);expect(sim.snapshot().campaign).toMatchObject({campaignId:story.id,dispatchIndex:0,status:'active',outcomes:[]});
});

it('rejects unknown case configuration instead of silently mixing unrelated story content',()=>{
 expect(()=>simulation('missing-story')).toThrow(/storyline|campaign/i);
});

it('admits a different case only after completion and cannot process the same restart twice',()=>{
 const sim=simulation(STORYLINES[0]!.id),next=STORYLINES[1]!.id;
 expect(sim.rematch('officer',next)).toBe(false);
 const c=sim.checkpoint();c.state.phase='results';c.state.campaign={campaignId:STORYLINES[0]!.id,dispatchIndex:9,status:'complete',outcomes:Array.from({length:10},(_,dispatchIndex)=>({dispatchIndex,outcome:'arrested',playerId:'officer',callsign:'Story patrol',elapsedTicks:180}))};
 sim.restore(c);
 expect(sim.rematch('officer','unknown')).toBe(false);
 expect(sim.snapshot().campaign?.status).toBe('complete');
 expect(sim.rematch('officer',next)).toBe(true);
 expect(sim.snapshot().campaign).toMatchObject({campaignId:next,dispatchIndex:0,status:'active',outcomes:[]});
 expect(sim.rematch('officer',STORYLINES[2]!.id)).toBe(false);
});
