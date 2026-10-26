import { disposeTestRooms } from '../support/rooms';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, unpackSnapshot, type GameEvent, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import type { Simulation } from '@fender/sim';

let server: Awaited<ReturnType<typeof createGameServer>>;
const rooms: Room[] = [];
async function until(check: () => boolean, message: string, timeout=7500) {
 const end=performance.now()+timeout;while(!check()){if(performance.now()>end)throw new Error(message);await new Promise(resolve=>setTimeout(resolve,15));}
}
async function peer(roomId?:string){
 const sdk=new Client('http://127.0.0.1:2722'),options={nickname:`Officer Muffin ${rooms.length+1}`,vehicleBodyId:'patrol',protocolVersion:PROTOCOL_VERSION,mapRevision:districtMap.revision,gameplayRevision:GAMEPLAY_REVISION};
 const room=roomId?await sdk.joinById(roomId,options):await sdk.create('district',options);rooms.push(room);room.reconnection.enabled=false;
 const states:WorldSnapshot[]=[],events:GameEvent[]=[];
 room.onMessage('snapshot',(wire:WireSnapshot)=>states.push(unpackSnapshot(wire,states.at(-1)?.props)));
 room.onMessage('events',(batch:GameEvent[])=>events.push(...batch));room.onMessage('latency-probe',({nonce}:{nonce:string})=>room.send('latency-pong',{nonce}));
 room.send('resync');await until(()=>states.length>0,'Initial boss encounter baseline');
 return{room,events,states,get state(){return states.at(-1)!;}};
}
function encounter(host:Awaited<ReturnType<typeof peer>>,stage=0){
 const sim=(matchMaker.getLocalRoomById(host.room.roomId) as unknown as {sim:Simulation}).sim;
 if(stage){const c=sim.checkpoint();c.state.phase='results';c.state.campaign!.dispatchIndex=stage-1;c.state.campaign!.outcomes=Array.from({length:stage},(_,dispatchIndex)=>({dispatchIndex,outcome:'arrested',playerId:host.room.sessionId,callsign:'Officer Muffin 1',elapsedTicks:180}));sim.restore(c);expect(sim.rematch(host.room.sessionId)).toBe(true);}
 const c=sim.checkpoint(),boss=c.state.records.find(record=>record.vehicle.entityId===c.state.pursuit!.suspectId)!;
 c.state.phase='playing';c.state.phaseEnd=c.tick+2000;c.state.records=c.state.records.filter(record=>record.vehicle.playerId!==null||record===boss);
 boss.vehicle.pose={x:0,z:-76,yaw:Math.PI/2};boss.vehicle.velocity={x:0,z:0,yawRate:0};boss.vehicle.protectedUntilTick=0;
 for(const record of c.state.records.filter(record=>record.vehicle.playerId!==null)){
  record.vehicle.pose=record.vehicle.playerId===host.room.sessionId?{x:25,z:-76,yaw:Math.PI/2}:{x:-70,z:76,yaw:0};
  record.vehicle.velocity={x:0,z:0,yawRate:0};record.vehicle.protectedUntilTick=0;
 }
 sim.restore(c);host.room.send('resync');return{sim,bossId:boss.vehicle.entityId};
}
beforeAll(async()=>{server=await createGameServer(2722);});
afterEach(async()=>{ await disposeTestRooms();await Promise.all(rooms.splice(0).map(room=>room.connection.isOpen?room.leave(true):Promise.resolve()));});
afterAll(async()=>{await server?.gracefullyShutdown(false);});

it.each([[1,'distant'],[1,'closing'],[4,'distant'],[4,'closing']] as const)('replicates dispatch %s driving under a %s pursuit through both real clients',async(stage,approach)=>{
 const host=await peer(),guest=await peer(host.room.roomId),{sim,bossId}=encounter(host,stage),c=sim.checkpoint();
 const boss=c.state.records.find(r=>r.vehicle.entityId===bossId)!,officer=c.state.records.find(r=>r.vehicle.playerId===host.room.sessionId)!;
 boss.vehicle.velocity={x:12,z:0,yawRate:0};delete boss.bossAi;
 officer.vehicle.pose={x:approach==='closing'?-14:-44,z:-76,yaw:Math.PI/2};officer.vehicle.velocity={x:18,z:0,yawRate:0};
 sim.restore(c);host.room.send('resync');guest.room.send('resync');
 await until(()=>host.states.some(s=>s.serverTick>=c.tick+45),'The live authority must publish 0.75 seconds of suspect driving');
 const sample=host.states.find(s=>s.serverTick>=c.tick+45)!,history=host.states.filter(s=>s.serverTick>=c.tick+30&&s.serverTick<=sample.serverTick).map(s=>s.vehicles.find(v=>v.entityId===bossId)!);
 expect(history.length).toBeGreaterThan(0);
 if(stage===1){const speed=Math.min(...history.map(v=>Math.hypot(v.velocity.x,v.velocity.z)));if(approach==='closing')expect(speed).toBeLessThan(2);else expect(speed).toBeGreaterThan(8);}
 else{const displacement=Math.max(...history.map(v=>Math.abs(v.pose.z+76)));if(approach==='closing')expect(displacement).toBeGreaterThan(1);else expect(displacement).toBeLessThan(.2);}
 await until(()=>guest.states.some(s=>s.serverTick===sample.serverTick),'Both observers must receive the same authoritative driving tick');
 expect(guest.states.find(s=>s.serverTick===sample.serverTick)!.vehicles.find(v=>v.entityId===bossId)).toEqual(sample.vehicles.find(v=>v.entityId===bossId));
});

it('the authoritative second target fires real shots, damages an officer and shares the attack with both clients',async()=>{
 const host=await peer(),guest=await peer(host.room.roomId),{bossId}=encounter(host,1);
 await until(()=>host.events.some(event=>event.kind==='shot'&&event.payload.shooterId===bossId),'Campaign target must shoot back');
 await until(()=>host.state.local!.vehicle.health<100,'Authoritative AI bullets damage the officer');
 const shot=host.events.find(event=>event.kind==='shot'&&event.payload.shooterId===bossId)!;
 await until(()=>guest.events.some(event=>event.eventId===shot.eventId),'Both observers see the same boss volley');
 expect(guest.events.find(event=>event.eventId===shot.eventId)).toEqual(shot);
 expect(host.state.campaign!.outcomes).toHaveLength(1);expect(host.state.scores.every(score=>score.score===0)).toBe(true);
});

it('Hector broadcasts a fixed grenade warning to peers and a late joiner, then explodes once with shared authority',async()=>{
 const host=await peer(),guest=await peer(host.room.roomId),{bossId}=encounter(host,4);
 await until(()=>Boolean(host.state.grenades?.length)&&Boolean(guest.state.grenades?.length),'Grenadier must publish a live landing/fuse warning');
 const grenade=host.state.grenades![0]!;expect(grenade.ownerEntityId).toBe(bossId);expect(grenade.detonatesAtTick-grenade.bornTick).toBeGreaterThanOrEqual(72);
 expect(guest.state.grenades!.find(g=>g.entityId===grenade.entityId)).toEqual(grenade);
 const late=await peer(host.room.roomId);expect(late.state.grenades!.find(g=>g.entityId===grenade.entityId)).toEqual(grenade);
 await until(()=>host.events.some(event=>event.kind==='grenade-exploded'&&event.payload.grenadeId===grenade.entityId)&&guest.events.some(event=>event.kind==='grenade-exploded'&&event.payload.grenadeId===grenade.entityId),'Both observers receive the explosion');
 expect(host.events.filter(event=>event.kind==='grenade-exploded'&&event.payload.grenadeId===grenade.entityId)).toHaveLength(1);
 expect(guest.events.filter(event=>event.kind==='grenade-exploded'&&event.payload.grenadeId===grenade.entityId)).toHaveLength(1);
 await until(()=>host.state.grenades!.every(g=>g.entityId!==grenade.entityId),'Resolved grenade is removed from authority');
 expect(host.state.local!.vehicle.health).toBeLessThan(100);expect(host.state.campaign!.dispatchIndex).toBe(4);expect(host.state.campaign!.outcomes).toHaveLength(4);
 expect(host.state.scores.every(score=>score.score===0)).toBe(true);
});
