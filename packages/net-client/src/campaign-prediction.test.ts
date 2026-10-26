import { afterEach, expect, it, vi } from 'vitest';
import { CAMPAIGN_ID, GAMEPLAY_REVISION, neutralActions, packSnapshot, type CollisionMap, type VehicleState, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import { createOnlineSession } from './index.js';

const transport=vi.hoisted(()=>({handlers:new Map<string,(message:unknown)=>void>(),initial:null as unknown}));
vi.mock('@colyseus/sdk',()=>({Client:class{
 http={post:async()=>({data:{}})};
  async consumeSeatReservation(){return{roomId:'campaign-prediction',sessionId:'local',reconnection:{enqueuedMessages:[]},connection:{isOpen:true,reconnect(){},close(){}},onMessage(type:string,handler:(value:unknown)=>void){transport.handlers.set(type,handler);},onDrop(){},onReconnect(){},onLeave(){},onError(){},send(type:string){if(type==='resync')transport.handlers.get('snapshot')!({...transport.initial as WireSnapshot,reset:'resync'});},async leave(){return 4000;},removeAllListeners(){transport.handlers.clear();}};}
}}));
const map:CollisionMap={id:'prediction-arena',revision:'prediction-arena',bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},colliders:[],surfaces:[],spawns:[],laneNodes:[],laneEdges:[]};
function state(phase:WorldSnapshot['phase']='playing',campaign=true,tick=100):WorldSnapshot{
 const car=(id:string,x:number):VehicleState=>({entityId:id,playerId:id,bodyAssetId:'patrol',pose:{x,z:0,yaw:0},velocity:{x:0,z:20,yawRate:0},health:100,status:'active',protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0});
 const local=car('local',0);return{protocolVersion:1,mapRevision:map.revision,gameplayRevision:GAMEPLAY_REVISION,sessionEpoch:'epoch',serverTick:tick,matchId:'campaign-prediction',phase,phaseEndsAtTick:null,vehicles:[local,car('remote',30)],projectiles:[],scores:[],local:{vehicle:local,driver:{resolvedSteering:0,reverseHoldTicks:0,nextFireTick:0,shotOrdinal:0,nextRecoveryTick:0,lastDamageTick:null},lastConsumedSequence:-1},...(campaign?{campaign:{campaignId:CAMPAIGN_ID,dispatchIndex:0,status:'active' as const,outcomes:[]}}:{})};
}
const deliver=(snapshot:WorldSnapshot)=>transport.handlers.get('snapshot')!(packSnapshot(snapshot));
const submit=(session:ReturnType<typeof createOnlineSession>,sequence=0)=>session.submit({sessionEpoch:'epoch',sequence,clientTick:sequence,actions:{...neutralActions(),throttle:1}});
const localPose=(session:ReturnType<typeof createOnlineSession>)=>session.sampleFrame()!.vehicles.find(v=>v.entityId==='local')!.pose;
afterEach(()=>{vi.useRealTimers();transport.handlers.clear();});

it.each(['lobby','countdown','results'] as const)('keeps campaign %s authority fixed before input acknowledgement and during pending-command replay',async phase=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});transport.initial=packSnapshot(state(phase));const session=createOnlineSession('ws://campaign-prediction',map);
 try{
  await session.connect({roomId: crypto.randomUUID(),nickname:'Frozen phase'});const authority=structuredClone(session.getSnapshot()!.local!.vehicle.pose);
  submit(session);expect(localPose(session),'Frozen authority must not predict newly submitted throttle').toEqual(authority);
  deliver(state(phase,true,103));vi.advanceTimersByTime(500);
  expect(localPose(session),'Frozen authority must not replay unacknowledged throttle').toEqual(authority);
 }finally{await session.dispose();}
});
it.each(['lobby','countdown','results'] as const)('clears existing prediction offsets when entering campaign %s',async phase=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});transport.initial=packSnapshot(state());const session=createOnlineSession('ws://campaign-prediction',map);
 try{
  await session.connect({roomId: crypto.randomUUID(),nickname:'Frozen correction'});submit(session);expect(localPose(session).z).toBeGreaterThan(0);
  const frozen=state(phase,true,103);frozen.local!.lastConsumedSequence=0;frozen.local!.vehicle.pose.z=-1;
  deliver(frozen);expect(localPose(session),'A completed or briefing world cannot retain a moving prediction offset').toEqual(frozen.local!.vehicle.pose);
  vi.advanceTimersByTime(250);expect(localPose(session)).toEqual(frozen.local!.vehicle.pose);
 }finally{await session.dispose();}
});
it.each(['lobby','countdown','results'] as const)('does not extrapolate stale authority velocity in a frozen campaign %s',async phase=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});transport.initial=packSnapshot(state(phase));const session=createOnlineSession('ws://campaign-prediction',map);
 try{await session.connect({roomId: crypto.randomUUID(),nickname:'Frozen remote'});vi.advanceTimersByTime(500);expect(session.sampleFrame()!.vehicles.find(v=>v.entityId==='remote')!.pose).toEqual({x:30,z:0,yaw:0});}finally{await session.dispose();}
});
it.each([{phase:'lobby' as const,campaign:false},{phase:'playing' as const,campaign:true}])('preserves ordinary prediction for $phase when campaign=$campaign',async scenario=>{
 transport.initial=packSnapshot(state(scenario.phase,scenario.campaign));const session=createOnlineSession('ws://campaign-prediction',map);
 try{await session.connect({roomId: crypto.randomUUID(),nickname:'Live prediction'});submit(session);expect(localPose(session).z).toBeGreaterThan(0);expect(session.getSnapshot()!.local!.vehicle.pose.z).toBe(0);}finally{await session.dispose();}
});
it('uses the snapshot clock for recoil cadence when a legacy local baseline omits the prediction tick',async()=>{
 const initial=state();initial.campaign!.dispatchIndex=1;initial.local!.driver.nextFireTick=104;
 transport.initial=packSnapshot(initial);const session=createOnlineSession('ws://campaign-prediction',map);
 try{
  await session.connect({roomId:crypto.randomUUID(),nickname:'Recoil clock'});
  const speed=()=>session.sampleFrame()!.vehicles.find(v=>v.entityId==='local')!.velocity.z;
  // Keep the cadence check inside the six-tick unconfirmed movement horizon.
  for(let sequence=0;sequence<3;sequence++)session.submit({sessionEpoch:'epoch',sequence,clientTick:sequence,actions:{...neutralActions(),fire:true}});
  expect(speed()).toBeGreaterThan(18);const before=speed();
  session.submit({sessionEpoch:'epoch',sequence:3,clientTick:3,actions:{...neutralActions(),fire:true}});
  expect(speed()).toBeLessThan(before-2.5);
 }finally{await session.dispose();}
});
it('allows noncampaign lobby driving without predicting a gun kick before play',async()=>{
 transport.initial=packSnapshot(state('lobby',false));const session=createOnlineSession('ws://campaign-prediction',map);
 try{
  await session.connect({roomId:crypto.randomUUID(),nickname:'Safe lobby gun'});
  session.submit({sessionEpoch:'epoch',sequence:0,clientTick:0,actions:{...neutralActions(),fire:true}});
  expect(session.sampleFrame()!.vehicles.find(v=>v.entityId==='local')!.velocity.z).toBeGreaterThan(19);
 }finally{await session.dispose();}
});
it('does not predict or replay gun recoil in the unarmed opening dispatch',async()=>{
 const initial=state();transport.initial=packSnapshot(initial);const session=createOnlineSession('ws://campaign-prediction',map);
 try{
  await session.connect({roomId:crypto.randomUUID(),nickname:'Unarmed rookie'});
  session.submit({sessionEpoch:'epoch',sequence:0,clientTick:0,actions:{...neutralActions(),fire:true}});
  expect(session.sampleFrame()!.vehicles.find(v=>v.entityId==='local')!.velocity.z).toBeGreaterThan(19);
  deliver({...initial,serverTick:101});
  expect(session.sampleFrame()!.vehicles.find(v=>v.entityId==='local')!.velocity.z).toBeGreaterThan(19);
 }finally{await session.dispose();}
});
