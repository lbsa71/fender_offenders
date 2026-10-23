import { afterAll,beforeAll,expect,it } from 'vitest';
import { Client,type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../../../apps/server/src/index.js';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION,PROTOCOL_VERSION,neutralActions,type WireSnapshot } from '@fender/contracts';
let server:Awaited<ReturnType<typeof createGameServer>>,room:Room|undefined;
beforeAll(async()=>{server=await createGameServer(2716);});
afterAll(async()=>{if(room){room.reconnection.enabled=false;await room.leave(true);}await server?.gracefullyShutdown(false);});
it('publishes a full join/resync baseline and sparse subsequent props over a real socket',async()=>{
 room=await new Client('http://127.0.0.1:2716').create('district',{nickname:'Delta',protocolVersion:PROTOCOL_VERSION,mapRevision:districtMap.revision,gameplayRevision:GAMEPLAY_REVISION});
 room.reconnection.enabled=false;const packets:WireSnapshot[]=[];
 room.onMessage('snapshot',(packet:WireSnapshot)=>packets.push(packet));room.onMessage('events',()=>{});room.onMessage('latency-probe',()=>{});room.send('resync');
 const until=async(test:()=>boolean)=>{const end=performance.now()+3000;while(!test()){if(performance.now()>end)throw new Error('snapshot timeout');await new Promise(resolve=>setTimeout(resolve,10));}};
 // Under CPU contention a clock-only resync can precede the explicit request.
 const explicitBaseline=(packet:WireSnapshot)=>packet.reset==='resync'&&!packet.propsPatch;
 await until(()=>packets.some(explicitBaseline)&&packets.some(packet=>packet.propsPatch===true));const first=packets.find(explicitBaseline)!;
 expect(first.props!.length).toBeGreaterThan(100);expect(first.propsPatch).not.toBe(true);
 const patch=packets.find(packet=>packet.propsPatch===true)!;
 expect(patch).toBeDefined();expect(patch.props?.filter(tuple=>tuple[10]===0)??[]).toHaveLength(0);
 // A server catch-up clamp resets the prediction clock, not the reliable prop stream.
 const beforeClockRecovery=packets.length;
 (matchMaker.getLocalRoomById(room.roomId) as unknown as {accumulator:number}).accumulator=500;
 await until(()=>packets.slice(beforeClockRecovery).some(packet=>packet.reset==='resync'));
 expect(packets.slice(beforeClockRecovery).find(packet=>packet.reset==='resync')!.propsPatch).toBe(true);
 const previousExplicitResyncs=packets.filter(explicitBaseline).length;
 room.send('resync');await until(()=>packets.filter(explicitBaseline).length>previousExplicitResyncs);
 expect(packets.filter(explicitBaseline).at(-1)!.props!.length).toBe(first.props!.length);
 // Input queue correction does not invalidate an ordered prop baseline.
 for(let batch=0;batch<8;batch++)room.send('input',{commands:Array.from({length:4},(_,i)=>({sessionEpoch:first.e,sequence:batch*4+i,clientTick:batch*4+i,actions:neutralActions()}))});
 await until(()=>packets.some(packet=>packet.reset==='input-backlog'));
 expect(packets.find(packet=>packet.reset==='input-backlog')!.propsPatch).toBe(true);
});
