import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';
import {Client,type Room} from '@colyseus/sdk';
import {matchMaker,type Server} from '@colyseus/core';
import {createGameServer} from '../../../apps/server/src/index';
import {districtMap} from '@fender/content';
import {GAMEPLAY_REVISION,PROTOCOL_VERSION,unpackSnapshot,type WireSnapshot,type WorldSnapshot} from '@fender/contracts';
const endpoint='ws://127.0.0.1:2684';
const options={nickname:'Officer',protocolVersion:PROTOCOL_VERSION,mapRevision:districtMap.revision,gameplayRevision:GAMEPLAY_REVISION};
const pause=(ms:number)=>new Promise<void>((resolve)=>setTimeout(resolve,ms));
async function until(predicate:()=>boolean,why:string,timeout=5000){const end=performance.now()+timeout;while(!predicate()){if(performance.now()>end)throw new Error(`Timed out: ${why}`);await pause(10);}}
interface Peer{room:Room;state:WorldSnapshot|null;probes:string[]}
const peers:Peer[]=[];
async function peer(roomId?:string){
  const sdk=new Client(endpoint),room=roomId?await sdk.joinById(roomId,options):await sdk.create('district',options);
  room.reconnection.minUptime=0;room.reconnection.minDelay=200;room.reconnection.maxDelay=250;room.reconnection.maxEnqueuedMessages=0;
  const p:Peer={room,state:null,probes:[]};peers.push(p);
  room.onMessage('snapshot',(wire:WireSnapshot)=>p.state=unpackSnapshot(wire));
  room.onMessage('events',()=>{});room.onMessage('pong',()=>{});
  room.onMessage('latency-probe',(probe:{nonce:string})=>p.probes.push(probe.nonce));
  room.send('resync');await until(()=>p.state!==null,'initial snapshot');return p;
}
const ping=(observer:Peer,player:Peer)=>(observer.state?.scores.find((s)=>s.playerId===player.room.sessionId) as unknown as {pingMs?:number|null}|undefined)?.pingMs;
let server:Server;
beforeAll(async()=>{server=await createGameServer(2684);},15000);
afterEach(async()=>{await Promise.allSettled(peers.splice(0).map((p)=>p.room.connection.isOpen?p.room.leave(true):Promise.resolve()));});
afterAll(async()=>{await server?.gracefullyShutdown(false);});
describe('server-measured per-player latency over real SDK sockets',()=>{
  it('publishes unavailable before echo and exposes each measured player to both clients',async()=>{
    const a=await peer(),b=await peer(a.room.roomId);
    await until(()=>b.state!.scores.length===2,'two score rows');
    expect(ping(a,a)).toBeNull();expect(ping(b,a)).toBeNull();expect(ping(b,b)).toBeNull();
    await until(()=>a.probes.length>0&&b.probes.length>0,'server probes both connected clients');
    await pause(90);a.room.send('latency-pong',{nonce:a.probes.at(-1)});
    await pause(50);b.room.send('latency-pong',{nonce:b.probes.at(-1)});
    await until(()=>typeof ping(a,a)==='number'&&typeof ping(a,b)==='number'&&typeof ping(b,a)==='number'&&typeof ping(b,b)==='number','all clients see both server RTTs');
    expect(ping(a,a)).toBe(ping(b,a));expect(ping(a,b)).toBe(ping(b,b));
    expect(ping(b,a)).toBeGreaterThanOrEqual(70);expect(ping(a,b)).toBeGreaterThanOrEqual(110);
    expect(Number.isInteger(ping(a,a))).toBe(true);
  });
  it('rejects another connection nonce, bad and duplicate replies and expires old samples',async()=>{
    const a=await peer(),b=await peer(a.room.roomId);
    await until(()=>a.probes.length>0&&b.probes.length>0,'initial probes');
    const old=a.probes.at(-1)!;
    b.room.send('latency-pong',{nonce:old});a.room.send('latency-pong',{nonce:'not-current'});a.room.send('latency-pong',{nonce:4});
    await pause(90);expect(ping(b,a)).toBeNull();expect(ping(a,b)).toBeNull();
    a.room.send('latency-pong',{nonce:old});await until(()=>typeof ping(b,a)==='number','valid reply accepted');const measured=ping(b,a);
    a.room.send('latency-pong',{nonce:old});
    await pause(80);expect(ping(b,a)).toBe(measured);
    await until(()=>ping(b,a)===null,'stale measurement becomes unavailable',4500);
  });
  it('measures a 1300ms delayed echo without replacing the outstanding nonce',async()=>{
    const a=await peer(),b=await peer(a.room.roomId);
    await until(()=>a.probes.length>0,'initial probe');const nonce=a.probes[0]!;
    await pause(1300);a.room.send('latency-pong',{nonce});
    await until(()=>typeof ping(b,a)==='number','1300ms echo must still measure the original outstanding nonce',1000);
    expect(ping(b,a)).toBeGreaterThanOrEqual(1250);expect(ping(b,a)).toBeLessThan(3000);
  });
  it('replaces an unanswered nonce only after five seconds and rejects its expired echo',async()=>{
    const a=await peer(),b=await peer(a.room.roomId);
    await until(()=>a.probes.length>0,'first outstanding probe');const old=a.probes[0]!,seenAt=performance.now();
    await until(()=>a.probes.at(-1)!==old,'five-second probe expiry replacement',6500);
    expect(performance.now()-seenAt).toBeGreaterThanOrEqual(4800);
    a.room.send('latency-pong',{nonce:old});await pause(80);expect(ping(b,a)).toBeNull();
    a.room.send('latency-pong',{nonce:a.probes.at(-1)});await until(()=>typeof ping(b,a)==='number','replacement probe accepts current echo');
  });
  it('clears latency on disconnect/reconnect and removes a departed row',async()=>{
    const a=await peer(),b=await peer(a.room.roomId);
    await until(()=>a.probes.length>0,'first probe');const old=a.probes.at(-1)!;
    a.room.send('latency-pong',{nonce:old});await until(()=>typeof ping(b,a)==='number','first RTT');
    const originalEpoch=a.state!.sessionEpoch;
    const client=matchMaker.getLocalRoomById(a.room.roomId).clients.find((c)=>c.sessionId===a.room.sessionId)!;
    (client.ref as unknown as {terminate():void}).terminate();
    await until(()=>b.state!.scores.find((s)=>s.playerId===a.room.sessionId)?.connection==='reconnecting','drop observed');expect(ping(b,a)).toBeNull();
    await until(()=>a.state!.sessionEpoch!==originalEpoch,'new connection epoch');expect(ping(b,a)).toBeNull();
    a.room.send('latency-pong',{nonce:old});await pause(80);expect(ping(b,a)).toBeNull();
    await a.room.leave(true);await until(()=>!b.state!.scores.some((s)=>s.playerId===a.room.sessionId),'departed score removed');
  });
});
