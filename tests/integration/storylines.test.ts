import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';
import {matchMaker} from '@colyseus/core';
import {createGameServer} from '../../apps/server/src/index';
import {createOnlineSession} from '@fender/net-client';
import {STORYLINES,getCampaignDispatch,getCampaignTarget} from '@fender/contracts';
import {districtMap} from '@fender/content';
import type {Simulation} from '@fender/sim';
import {disposeTestRooms} from '../support/rooms';

const wait=async(check:()=>boolean)=>{const end=Date.now()+6500;while(!check()){if(Date.now()>end)throw Error('Storyline room timed out');await new Promise(r=>setTimeout(r,10));}};
describe.each(STORYLINES)('$title room authority',story=>{
 const port=2781+STORYLINES.indexOf(story);
 let server:Awaited<ReturnType<typeof createGameServer>>;
 const sessions:ReturnType<typeof createOnlineSession>[]=[];
 const peer=()=>{const s=createOnlineSession(`http://127.0.0.1:${port}`,districtMap);sessions.push(s);return s;};
 beforeAll(async()=>{server=await createGameServer(port,'127.0.0.1',{campaignId:story.id});});
 afterEach(async()=>{await Promise.all(sessions.splice(0).map(s=>s.dispose()));await disposeTestRooms();});
 afterAll(async()=>{await server.gracefullyShutdown(false);});
 it('shares the chosen case with live backup and retains it after an empty-room return',async()=>{
  const host=peer(),code=crypto.randomUUID();await host.connect({roomId:code,nickname:'Case officer',vehicleBodyId:'patrol'});
  expect(host.getSnapshot()!.campaign?.campaignId).toBe(story.id);
  const state=host.getSnapshot()!;expect(state.vehicles.find(v=>v.entityId===state.pursuit!.suspectId)!.bodyAssetId).toBe(getCampaignTarget(getCampaignDispatch(state.campaign!).targetId).vehicleBodyId);
  host.request('start-round');await wait(()=>host.getSnapshot()?.phase==='playing');
  const live=structuredClone(host.getSnapshot()!),backup=peer();await backup.connect({roomId:code,nickname:'Live backup'});
  expect(backup.getSnapshot()!.campaign).toEqual(live.campaign);expect(backup.getSnapshot()!.phaseEndsAtTick).toBe(live.phaseEndsAtTick);
  await host.dispose();await backup.dispose();
  const returning=peer();await returning.connect({roomId:code,nickname:'Returning officer'});
  expect(returning.getSnapshot()!.campaign).toEqual(live.campaign);expect(returning.getSnapshot()!.matchId).toBe(live.matchId);
 },12000);
 it('opens another case after the ending and admits only one new-case transition',async()=>{
  const host=peer();await host.connect({roomId:crypto.randomUUID(),nickname:'Closing officer'});
  const room=matchMaker.getLocalRoomById(host.getIdentity().roomId) as unknown as {sim:Simulation};
  const c=room.sim.checkpoint();c.state.phase='results';c.state.campaign={campaignId:story.id,dispatchIndex:9,status:'complete',outcomes:Array.from({length:10},(_,dispatchIndex)=>({dispatchIndex,outcome:'arrested',playerId:host.getIdentity().playerId,callsign:'Closing officer',elapsedTicks:180}))};room.sim.restore(c);
  await wait(()=>host.getSnapshot()?.phase==='results');
  host.request('rematch');host.request('rematch');await wait(()=>host.getSnapshot()?.phase==='lobby');
  expect(STORYLINES.some(s=>s.id===host.getSnapshot()!.campaign!.campaignId)).toBe(true);
  expect(host.getSnapshot()!.campaign).toMatchObject({dispatchIndex:0,status:'active',outcomes:[]});
  expect(host.getSnapshot()!.campaign!.campaignId).not.toBe(story.id);
 });
});
