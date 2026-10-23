import { afterEach, expect, it, vi } from 'vitest';
import { CAMPAIGN_ID, GAMEPLAY_REVISION, packSnapshot, type CollisionMap, type GrenadeState, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import { createOnlineSession } from './index';

const transport=vi.hoisted(()=>({handlers:new Map<string,(message:unknown)=>void>(),initial:null as unknown}));
vi.mock('@colyseus/sdk',()=>({Client:class{
 async create(){return{roomId:'grenade-clock',sessionId:'local',reconnection:{enqueuedMessages:[]},connection:{isOpen:true,reconnect(){},close(){}},onMessage(type:string,handler:(value:unknown)=>void){transport.handlers.set(type,handler);},onDrop(){},onReconnect(){},onLeave(){},onError(){},send(type:string){if(type==='resync')transport.handlers.get('snapshot')!({...transport.initial as WireSnapshot,reset:'resync'});},async leave(){return 4000;},removeAllListeners(){transport.handlers.clear();}};}
}}));
const map:CollisionMap={id:'grenades',revision:'grenades',bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},colliders:[],surfaces:[],spawns:[],laneNodes:[],laneEdges:[]};
const grenade:GrenadeState={entityId:'grenade-1',ownerEntityId:'boss',origin:{x:4,z:0,yaw:0},target:{x:4,z:20,yaw:0},bornTick:60,landsAtTick:105,detonatesAtTick:150,blastRadius:6,damage:30};
const state=(tick=100,phase:WorldSnapshot['phase']='playing'):WorldSnapshot=>({protocolVersion:1,mapRevision:map.revision,gameplayRevision:GAMEPLAY_REVISION,sessionEpoch:'epoch',serverTick:tick,matchId:'grenade-clock',phase,phaseEndsAtTick:null,vehicles:[],projectiles:[],scores:[],local:null,grenades:[structuredClone(grenade)],campaign:{campaignId:CAMPAIGN_ID,dispatchIndex:4,status:'active',outcomes:[]}});
const sessions:ReturnType<typeof createOnlineSession>[]=[];
async function connect(snapshot=state()) { vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']}); transport.initial=packSnapshot(snapshot);const session=createOnlineSession('ws://grenade-clock',map);sessions.push(session);await session.connect({mode:'create',nickname:'Sgt. Sideways'});return session; }
afterEach(async()=>{await Promise.all(sessions.splice(0).map(session=>session.dispose()));vi.useRealTimers();transport.handlers.clear();});

it('reconstructs a late join grenade warning and clock from authority without a throw event',async()=>{
 const session=await connect(),frame=session.sampleFrame()!;
 expect(frame.grenades).toEqual([grenade]);expect(frame.serverTick).toBe(100);
 frame.grenades![0]!.target.x=99;expect(session.getSnapshot()!.grenades![0]!.target.x).toBe(4);
});
it('advances the grenade fuse clock monotonically across late snapshots and retires expired warnings',async()=>{
 const session=await connect();session.sampleFrame();vi.advanceTimersByTime(250);const first=session.sampleFrame()!;
 expect(first.serverTick).toBe(115);
 transport.handlers.get('snapshot')!(packSnapshot(state(103)));expect(session.sampleFrame()!.serverTick).toBeGreaterThanOrEqual(first.serverTick!);
 vi.advanceTimersByTime(1000);expect(session.sampleFrame()!.grenades).toEqual([]);
 expect(session.getSnapshot()!.grenades).toHaveLength(1);
});
it('removes a resolved grenade as soon as its authoritative roster clears',async()=>{
 const session=await connect();expect(session.sampleFrame()!.grenades).toHaveLength(1);
 transport.handlers.get('snapshot')!(packSnapshot({...state(103),grenades:[]}));expect(session.sampleFrame()!.grenades).toEqual([]);
});
it.each(['lobby','countdown','results'] as const)('does not render live grenade hazards or advance their clock during frozen %s',async phase=>{
 const session=await connect(state(100,phase));vi.advanceTimersByTime(500);const frame=session.sampleFrame()!;
 expect(frame.grenades).toEqual([]);expect(frame.serverTick).toBe(100);
});
