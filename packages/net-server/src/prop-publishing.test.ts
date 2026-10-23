import { afterAll,beforeAll,expect,it } from 'vitest';
import { Client,type Room } from '@colyseus/sdk';
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
 await until(()=>packets.some(packet=>packet.reset==='resync')&&packets.some(packet=>packet.propsPatch===true));const first=packets.find(packet=>packet.reset==='resync')!;
 expect(first.props!.length).toBeGreaterThan(100);expect(first.propsPatch).not.toBe(true);
 const patch=packets.find(packet=>packet.propsPatch===true)!;
 expect(patch).toBeDefined();expect(patch.props?.filter(tuple=>tuple[10]===0)??[]).toHaveLength(0);
 room.send('resync');await until(()=>packets.filter(packet=>packet.reset==='resync').length>=2);
 expect(packets.filter(packet=>packet.reset==='resync').at(-1)!.props!.length).toBe(first.props!.length);
 // Input queue correction does not invalidate an ordered prop baseline.
 for(let batch=0;batch<8;batch++)room.send('input',{commands:Array.from({length:4},(_,i)=>({sessionEpoch:first.e,sequence:batch*4+i,clientTick:batch*4+i,actions:neutralActions()}))});
 await until(()=>packets.some(packet=>packet.reset==='input-backlog'));
 expect(packets.find(packet=>packet.reset==='input-backlog')!.propsPatch).toBe(true);
});
