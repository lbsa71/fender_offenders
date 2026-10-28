import {afterEach,expect,it} from 'vitest';
import {matchMaker} from '@colyseus/core';
import {createOnlineSession} from '@fender/net-client';
import {districtMap} from '@fender/content';
import {helicopterHeightAt} from '@fender/contracts';
import type {Simulation} from '@fender/sim';
import {createGameServer} from '../../apps/server/src/index';
import {disposeTestRooms} from '../support/rooms';

let server:Awaited<ReturnType<typeof createGameServer>>|undefined;
const peers:ReturnType<typeof createOnlineSession>[]=[];
afterEach(async()=>{await Promise.all(peers.splice(0).map(peer=>peer.dispose()));await disposeTestRooms();await server?.gracefullyShutdown(false);server=undefined;});
const until=async(check:()=>boolean)=>{const end=performance.now()+5000;while(!check()){if(performance.now()>end)throw Error('Helicopter peer snapshot timed out');await new Promise(resolve=>setTimeout(resolve,10));}};

it('shares the descending intercept and retained course with real late-joining and restored peers',async()=>{
 server=await createGameServer(2805,'127.0.0.1');
 const roomId=crypto.randomUUID(),host=createOnlineSession('http://127.0.0.1:2805',districtMap);peers.push(host);
 await host.connect({roomId,nickname:'Air patrol',debugDispatch:5});
 const sim=(matchMaker.getLocalRoomById(roomId) as unknown as {sim:Simulation}).sim;
 expect(sim.startRound(host.getIdentity().playerId)).toBe(true);
 for(let tick=0;tick<690;tick++)sim.step(new Map());
 await until(()=>host.getSnapshot()?.helicopter?.phase==='attack');
 const air=host.getSnapshot()!.helicopter!;
 expect(air.fromHeight).toBeDefined();expect(air.toHeight).toBeDefined();
 expect(helicopterHeightAt(air,host.getSnapshot()!.serverTick)).toBeLessThan(11);
 const saved=sim.checkpoint();sim.restore(saved);
 const backup=createOnlineSession('http://127.0.0.1:2805',districtMap);peers.push(backup);await backup.connect({roomId,nickname:'Air backup'});
 expect(backup.getSnapshot()!.helicopter).toMatchObject({entityId:air.entityId,phase:'attack',health:60});
 expect(backup.getSnapshot()!.helicopter!.fromHeight).toBeDefined();expect(backup.getSnapshot()!.helicopter!.toHeight).toBeDefined();
 expect(helicopterHeightAt(backup.getSnapshot()!.helicopter!,backup.getSnapshot()!.serverTick)).toBeLessThan(11);
 expect(backup.sampleFrame()!.helicopter).toEqual(backup.getSnapshot()!.helicopter);
});
