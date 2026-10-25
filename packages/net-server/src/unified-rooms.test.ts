import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, neutralActions, unpackSnapshot, type WorldSnapshot, type WireSnapshot } from '@fender/contracts';
import { DrivingRoom, getRoomMetrics, serverMetrics } from './index';

let now = 1000;
const instances = new Set<ClockRoom>(), peers: Room[] = [];
class ClockRoom extends DrivingRoom {
  wallNow() { return now; }
  async onCreate(options?: unknown) { instances.add(this); await super.onCreate(options); }
  sweep() { this.maintain(); }
}
let server: Server;
const options = { nickname: 'Room officer', protocolVersion: PROTOCOL_VERSION, gameplayRevision: GAMEPLAY_REVISION, mapRevision: districtMap.revision };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) { const end=performance.now()+2500; while(!check()){ if(performance.now()>end) throw new Error('Room observation timed out'); await sleep(10); } }
async function join(id?: string) {
  const client=new Client('ws://127.0.0.1:2732');
  const room=id?await client.joinById(id,options):await client.create('district',options);
  peers.push(room); room.reconnection.enabled=false;
  let state:WorldSnapshot|undefined; const warnings: unknown[]=[];
  room.onMessage('snapshot',(wire:WireSnapshot)=>{state=unpackSnapshot(wire,state?.props);});
  room.onMessage('events',()=>{}); room.onMessage('latency-probe',()=>{}); room.onMessage('idle-warning',message=>warnings.push(message)); room.onMessage('session-ended',()=>{});
  room.send('resync'); await until(()=>Boolean(state));
  return {room,get state(){return state!;},warnings,authority:matchMaker.getLocalRoomById(room.roomId) as ClockRoom};
}
beforeAll(async()=>{server=new Server({transport:new WebSocketTransport(),greet:false,gracefullyShutdown:false});server.define('district',ClockRoom);await server.listen(2732,'127.0.0.1');});
afterEach(async()=>{await Promise.allSettled(peers.splice(0).map(peer=>peer.connection.isOpen?peer.leave(true):Promise.resolve()));await Promise.allSettled([...instances].map(room=>room.disconnect()));instances.clear();delete process.env.MAX_ROOMS;now=1000;});
afterAll(async()=>{await server.gracefullyShutdown(false);});

it('pauses a lone officer, keeps snapshots alive, resumes on arrival and ignores menu input',async()=>{
  const a=await join();a.room.send('start-round');await until(()=>a.state.phase==='countdown');
  a.room.send('presence',{menuOpen:true,hidden:false});await sleep(100);
  expect(a.state).toMatchObject({paused:true}); const tick=a.state.serverTick;
  a.room.send('input',{commands:[{sessionEpoch:a.state.sessionEpoch,sequence:0,clientTick:0,actions:{...neutralActions(),fire:true,throttle:1}}]});
  await sleep(120);expect(a.state.serverTick).toBe(tick);
  const b=await join(a.room.roomId);await until(()=>a.state.paused===false);expect(b.state.phase).toBe('countdown');
  a.room.send('presence',{menuOpen:true,hidden:true});await sleep(80);expect(a.state.paused).toBe(false);
  await b.room.leave(true);await until(()=>a.state.paused===true);
});
it('retains an empty campaign for fifteen wall-clock minutes and freezes its countdown',async()=>{
  const a=await join();a.room.send('start-round');await until(()=>a.state.phase==='countdown');const id=a.room.roomId;
  await a.room.leave(true);await sleep(80);expect(serverMetrics.rooms).toBe(1);
  const tick=a.state.serverTick;now+=899_999;a.authority.sweep();
  const b=await join(id);expect(b.state.phase).toBe('countdown');expect(b.state.serverTick-tick).toBeLessThan(8);
  await b.room.leave(true);await sleep(40);now+=900_000;b.authority.sweep();await until(()=>serverMetrics.rooms===0);
});
it('evicts only the oldest empty room and protects pending seats',async()=>{
  process.env.MAX_ROOMS='2';const a=await join();await a.room.leave(true);await sleep(30);now+=100;
  const b=await join();await b.room.leave(true);await sleep(30);
  const pending=await matchMaker.joinById(a.room.roomId,options);
  const c=await join();expect(await matchMaker.getRoomById(b.room.roomId)).toBeUndefined();expect(await matchMaker.getRoomById(a.room.roomId)).toBeDefined();
  await expect(join()).rejects.toThrow('Dispatch capacity reached');
  const reserved=await new Client('ws://127.0.0.1:2732').consumeSeatReservation(pending);peers.push(reserved);reserved.onMessage('*',()=>{});
  expect(c.state.campaign?.dispatchIndex).toBe(0);
});
it('warns on inactivity, accepts deliberate activity, and closes intentionally at fifteen minutes',async()=>{
  const a=await join();now+=840_000;a.authority.sweep();await until(()=>a.warnings.length===1);
  a.room.send('activity');await sleep(40);now+=839_999;a.authority.sweep();await sleep(30);expect(a.room.connection.isOpen).toBe(true);
  now+=1;a.authority.sweep();await until(()=>a.warnings.length===2);
  a.room.send('ping',1);a.room.send('input',{commands:[{sessionEpoch:a.state.sessionEpoch,sequence:0,clientTick:0,actions:neutralActions()}]});await sleep(30);
  now+=60_000;a.authority.sweep();await until(()=>!a.room.connection.isOpen);expect(getRoomMetrics()).toMatchObject({connectedPlayers:0,reconnectingPlayers:0,emptyRooms:1});
});
