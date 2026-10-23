import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {Client,type Room as ClientRoom} from '@colyseus/sdk';
import {Server,matchMaker,type Client as ServerClient} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {districtMap,VEHICLE_BODIES} from '@fender/content';
import {GAMEPLAY_REVISION,PROTOCOL_VERSION,unpackSnapshot,type WireSnapshot,type WorldSnapshot} from '@fender/contracts';
import type {Simulation} from '@fender/sim';
import * as netServer from './index';

const physics=vi.hoisted(()=>({waiting:0,gate:Promise.resolve(),release:()=>{}}));
const chooseBody=vi.hoisted(()=>vi.fn((max:number)=>max-1));
vi.mock('node:crypto',async(importOriginal)=>({...await importOriginal<typeof import('node:crypto')>(),randomInt:chooseBody}));
vi.mock('@fender/sim',async(importOriginal)=>{
  const actual=await importOriginal<typeof import('@fender/sim')>();
  return{...actual,initPhysics:async()=>{physics.waiting++;await physics.gate;await actual.initPhysics();}};
});
const pause=(ms:number)=>new Promise<void>((r)=>setTimeout(r,ms));
async function until(test:()=>boolean,why:string,ms=2500){const end=performance.now()+ms;while(!test()){if(performance.now()>end)throw new Error(`Timed out: ${why}`);await pause(5);}}
const endpoint='ws://127.0.0.1:2708';
const options={nickname:'Capacity check',protocolVersion:PROTOCOL_VERSION,mapRevision:districtMap.revision,gameplayRevision:GAMEPLAY_REVISION};
const peers:ClientRoom[]=[];
const snapshots=new Map<string,WorldSnapshot>();
const instances=new Set<netServer.DrivingRoom>();
const lateLeaveErrors:unknown[]=[];
class TrackedRoom extends netServer.DrivingRoom{
  override async onCreate(options?:unknown){instances.add(this);await super.onCreate(options);}
}
class FastDropRoom extends TrackedRoom{
  override async onCreate(options?:unknown){const allow=this.allowReconnection.bind(this);this.allowReconnection=(client)=>allow(client,.2);await super.onCreate(options);}
  override onLeave(client:ServerClient){try{super.onLeave(client);}catch(error){lateLeaveErrors.push(error);}}
}
class ExpiringCreateRoom extends TrackedRoom{seatReservationTimeout=.05;}
let server:Server;
const previousLimit=process.env.MAX_ROOMS;
function holdPhysics(){physics.waiting=0;physics.gate=new Promise<void>((r)=>physics.release=r);}
async function create(name='district',extra:Record<string,unknown>={},roomId?:string){
  const sdk=new Client(endpoint),room=roomId?await sdk.joinById(roomId,{...options,...extra}):await sdk.create(name,{...options,...extra});peers.push(room);room.reconnection.enabled=false;
  room.onMessage('snapshot',(wire:WireSnapshot)=>{const previous=snapshots.get(room.sessionId);snapshots.set(room.sessionId,unpackSnapshot(wire,wire.m===previous?.matchId?previous?.props:undefined));});room.onMessage('events',()=>{});room.onMessage('latency-probe',({nonce}:{nonce:string})=>room.send('latency-pong',{nonce}));room.send('resync');await until(()=>snapshots.has(room.sessionId),'fully joined authoritative snapshot');return room;
}
beforeAll(async()=>{server=new Server({transport:new WebSocketTransport(),greet:false,gracefullyShutdown:false});server.define('district',TrackedRoom);server.define('fast-drop',FastDropRoom);server.define('expiring-create',ExpiringCreateRoom);await server.listen(2708,'127.0.0.1');},15000);
afterEach(async()=>{
  physics.release();physics.gate=Promise.resolve();
  await Promise.allSettled(peers.splice(0).map((p)=>p.connection.isOpen?p.leave(true):Promise.resolve()));
  await pause(100);
  for(const room of instances){room.setSimulationInterval();room.clock.clear();room.clock.stop();room.onDispose();}
  instances.clear();
  snapshots.clear();chooseBody.mockClear();lateLeaveErrors.length=0;
  if(previousLimit===undefined)delete process.env.MAX_ROOMS;else process.env.MAX_ROOMS=previousLimit;
});
afterAll(async()=>{await server?.gracefullyShutdown(false);});

describe('room admission accounting and lifecycle diagnostics',()=>{
  it('assigns every multiplayer body from the shared catalog using the full random index range',async()=>{
    chooseBody.mockImplementationOnce(()=>0).mockImplementationOnce((max)=>max-1);
    const a=await create(),b=await create('district',{},a.roomId);
    await until(()=>snapshots.get(a.sessionId)!.scores.length===2,'both players published');
    for(const snapshot of [snapshots.get(a.sessionId)!,snapshots.get(b.sessionId)!])for(const car of snapshot.vehicles.filter((v)=>v.playerId!==null))expect(VEHICLE_BODIES).toContain(car.bodyAssetId);
    expect(snapshots.get(a.sessionId)!.local!.vehicle.bodyAssetId).toBe(VEHICLE_BODIES[0]);
    expect(snapshots.get(b.sessionId)!.local!.vehicle.bodyAssetId).toBe(VEHICLE_BODIES.at(-1));
    expect(chooseBody.mock.calls).toEqual([[VEHICLE_BODIES.length],[VEHICLE_BODIES.length]]);
  });
  it('uses a validated persistent invite code as the SDK room ID',async()=>{
    const room=await create('district',{inviteCode:'KeepLink1'});expect(room.roomId).toBe('KeepLink1');
  });
  it.each(['invalid!','x'.repeat(65),null,42])('rejects malformed inviteCode %s rather than ignoring it',async(inviteCode)=>{
    await expect(create('district',{inviteCode})).rejects.toThrow('Invalid invite code');
  });
  it('reserves at most two slots synchronously while cold physics initialization is pending',async()=>{
    process.env.MAX_ROOMS='2';holdPhysics();
    const all=Promise.allSettled([create(),create(),create()]);
    try{
      await until(()=>physics.waiting>=2,'two creations reach controlled physics barrier');
      expect(netServer.serverMetrics.rooms).toBe(2);
      physics.release();const results=await all;
      expect(results.filter((r)=>r.status==='fulfilled')).toHaveLength(2);
      expect(results.filter((r)=>r.status==='rejected')).toHaveLength(1);
    }finally{physics.release();await all;}
  });
  it('reports aggregate completed/creating and connected counts without player identities',async()=>{
    process.env.MAX_ROOMS='2';
    expect(netServer).toHaveProperty('getRoomMetrics');
    const metrics=Reflect.get(netServer,'getRoomMetrics') as()=>Record<string,number>;
    holdPhysics();const creation=create();
    try{
      await until(()=>physics.waiting>0,'pending admission');
      expect(metrics()).toEqual({maxRooms:2,registeredRooms:0,creatingRooms:1,connectedPlayers:0,reconnectingPlayers:0});
      physics.release();await creation;
      expect(metrics()).toEqual({maxRooms:2,registeredRooms:1,creatingRooms:0,connectedPlayers:1,reconnectingPlayers:0});
    }finally{physics.release();await creation;}
  });
  it('rejects a third real room, then reuses capacity after intentional leaves',async()=>{
    process.env.MAX_ROOMS='2';const a=await create(),b=await create();
    await expect(create()).rejects.toThrow('Dispatch capacity reached');expect(netServer.serverMetrics.rooms).toBe(2);
    await Promise.all([a.leave(true),b.leave(true)]);await until(()=>netServer.serverMetrics.rooms===0,'both empty rooms release capacity');
    await create();expect(netServer.serverMetrics.rooms).toBe(1);
  });
  it('retains an unexpected drop only until the public fixture reconnection timeout expires',async()=>{
    process.env.MAX_ROOMS='2';const peer=await create('fast-drop');
    const room=matchMaker.getLocalRoomById(peer.roomId) as netServer.DrivingRoom;
    const client=room.clients[0]!;(client.ref as unknown as {terminate():void}).terminate();
    await until(()=>room.clients.length===0,'socket dropped');expect(netServer.serverMetrics.rooms).toBe(1);
    await until(()=>netServer.serverMetrics.rooms===0,'abandoned reconnection releases slot',2000);
    await create();expect(netServer.serverMetrics.rooms).toBe(1);
  });
  it('allows delayed leave finalization after forced room disposal during reconnection',async()=>{
    const peer=await create('fast-drop'),room=matchMaker.getLocalRoomById(peer.roomId) as netServer.DrivingRoom;
    (room.clients[0]!.ref as unknown as {terminate():void}).terminate();
    await until(()=>netServer.getRoomMetrics().reconnectingPlayers===1,'drop is waiting for reconnection');
    await room.disconnect();await pause(300);
    expect(lateLeaveErrors).toEqual([]);expect(netServer.serverMetrics.rooms).toBe(0);
  });
  it('preserves the assigned body through authoritative respawn and reconnection',async()=>{
    const peer=await create(),room=matchMaker.getLocalRoomById(peer.roomId) as netServer.DrivingRoom;
    const before=snapshots.get(peer.sessionId)!,body=before.local!.vehicle.bodyAssetId;
    const sim=(room as unknown as {sim:Simulation}).sim,checkpoint=sim.checkpoint();
    // Respawn is gameplay: the campaign intentionally freezes vehicles in the lobby.
    checkpoint.state.phase='playing';checkpoint.state.phaseEnd=checkpoint.tick+900;
    const vehicle=checkpoint.state.records.find((r)=>r.vehicle.playerId===peer.sessionId)!.vehicle;
    vehicle.status='wrecked';vehicle.respawnAtTick=checkpoint.tick+1;vehicle.protectedUntilTick=0;sim.restore(checkpoint);
    await until(()=>snapshots.get(peer.sessionId)!.local!.vehicle.discontinuityId>before.local!.vehicle.discontinuityId,'authoritative respawn');
    expect(snapshots.get(peer.sessionId)!.local!.vehicle.bodyAssetId).toBe(body);
    peer.reconnection.enabled=true;peer.reconnection.minUptime=0;peer.reconnection.minDelay=10;peer.reconnection.maxDelay=10;
    const epoch=snapshots.get(peer.sessionId)!.sessionEpoch;(room.clients[0]!.ref as unknown as {terminate():void}).terminate();
    await until(()=>snapshots.get(peer.sessionId)!.sessionEpoch!==epoch,'reconnected input epoch');
    expect(snapshots.get(peer.sessionId)!.local!.vehicle.bodyAssetId).toBe(body);expect(chooseBody).toHaveBeenCalledTimes(1);
  });
  it('releases capacity and lets SDK cleanup finish even when simulation disposal throws',async()=>{
    process.env.MAX_ROOMS='1';const peer=await create();
    const room=matchMaker.getLocalRoomById(peer.roomId) as netServer.DrivingRoom;
    const sim=(room as unknown as {sim:Simulation}).sim,dispose=sim.dispose.bind(sim);
    const error=vi.spyOn(console,'error').mockImplementation(()=>{});
    sim.dispose=()=>{throw new Error('controlled disposal failure');};
    try{
      await peer.leave(true);await pause(100);
      expect(netServer.serverMetrics.rooms).toBe(0);
      await create();
    }finally{sim.dispose=dispose;dispose();room.setSimulationInterval();room.clock.clear();room.clock.stop();room.onDispose();error.mockRestore();}
  });
  it('does not resume creation after SDK disposes it while initialization is pending',async()=>{
    process.env.MAX_ROOMS='1';holdPhysics();const result=create('expiring-create').then(()=> 'created',()=> 'rejected');
    await until(()=>physics.waiting>0,'creation waiting for physics');await pause(100);physics.release();
    expect(await result).toBe('rejected');expect(netServer.serverMetrics.rooms).toBe(0);
  });
});
