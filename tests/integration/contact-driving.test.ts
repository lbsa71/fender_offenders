import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { matchMaker } from '@colyseus/core';
import { districtMap } from '@fender/content';
import { neutralActions } from '@fender/contracts';
import { createOnlineSession } from '@fender/net-client';
import type { Simulation } from '@fender/sim';
import { createGameServer } from '../../apps/server/src/index';
import { createTcpProxy } from './tcp-proxy';
import { disposeTestRooms } from '../support/rooms';

let server:Awaited<ReturnType<typeof createGameServer>>;
const sessions:ReturnType<typeof createOnlineSession>[]=[];
beforeAll(async()=>{server=await createGameServer(2765);});
afterEach(async()=>{await Promise.all(sessions.splice(0).map(s=>s.dispose()));await disposeTestRooms();});
afterAll(async()=>{await server.gracefullyShutdown(false);});
async function until(check:()=>boolean){const end=Date.now()+6000;while(!check()){if(Date.now()>end)throw Error('Contact patrol timed out');await new Promise(r=>setTimeout(r,5));}}

it.each([{oneWayLatencyMs:60,jitterMs:20},{oneWayLatencyMs:160,jitterMs:40}])('finishes an arrest under bumper pressure without resetting local driving ($oneWayLatencyMs ms one way)',async profile=>{
  const proxy=await createTcpProxy(2766,2765,profile);
  const session=createOnlineSession(proxy.endpoint,districtMap);sessions.push(session);
  let inputTimer:ReturnType<typeof setInterval>|undefined,renderTimer:ReturnType<typeof setInterval>|undefined;
  try{
    await session.connect({roomId:crypto.randomUUID(),nickname:'Bumper paperwork',vehicleBodyId:'patrol'});
    const room=matchMaker.getLocalRoomById(session.getIdentity().roomId);
    const controlled=room as unknown as {sim:Simulation;publish(client:unknown,full?:boolean):void};
    room.setSimulationInterval(()=>undefined,10);
    const c=controlled.sim.checkpoint(),officer=c.state.records.find(r=>r.vehicle.playerId===session.getIdentity().playerId)!,suspect=c.state.records.find(r=>r.vehicle.entityId===c.state.pursuit!.suspectId)!;
    c.state.records=[officer,suspect];c.state.phase='playing';c.state.phaseEnd=c.tick+18000;
    for(const [record,z] of [[officer,-76],[suspect,-71.5]] as const){record.vehicle.pose={x:0,z,yaw:0};record.vehicle.velocity={x:0,z:0,yawRate:0};record.vehicle.protectedUntilTick=0;record.vehicle.discontinuityId++;}
    suspect.vehicle.pose.yaw=Math.PI;suspect.traffic=undefined;suspect.bossAi=undefined;controlled.sim.restore(c);
    // A scripted suspect keeps gentle bumper pressure on the officer. All
    // contact geometry, integration, room admission and player input stay real.
    const worldStep=controlled.sim.step.bind(controlled.sim);let suspectSequence=0;
    controlled.sim.step=inputs=>worldStep(new Map([...inputs,[suspect.vehicle.entityId,{actions:{...neutralActions(),throttle:.2},sessionEpoch:'contact-target',sourceCommandSequence:suspectSequence++}]]));
    for(const client of room.clients)controlled.publish(client,true);
    await until(()=>session.getSnapshot()?.phase==='playing');
    const initial=session.getStats().corrections,life=session.getSnapshot()!.local!.vehicle.discontinuityId;
    const frames:{z:number;life:number;corrections:number;contact:number;playing:boolean;at:number;velocity:number}[]=[];
    let sequence=0;
    inputTimer=setInterval(()=>session.submit({sessionEpoch:session.getSnapshot()!.sessionEpoch,sequence:sequence++,clientTick:sequence,actions:{...neutralActions(),throttle:.2}},performance.now()),1000/60);
    renderTimer=setInterval(()=>{const car=session.sampleFrame()!.vehicles.find(v=>v.playerId===session.getIdentity().playerId)!;frames.push({z:car.pose.z,life:car.discontinuityId,corrections:session.getStats().corrections,contact:session.getSnapshot()!.local!.contact?.revision??0,playing:session.getSnapshot()!.phase==='playing',at:performance.now(),velocity:car.velocity.z});},8);
    const stepping=room as unknown as {step():void};room.setSimulationInterval(()=>stepping.step(),1000/60);
    await until(()=>session.getSnapshot()?.phase==='results');
    const live=frames.filter(f=>f.life===life&&f.playing),backsteps=live.slice(1).map((f,i)=>live[i]!.z-f.z);
    const worst=backsteps.indexOf(Math.max(...backsteps));console.log('Contact step',JSON.stringify({profile,maxBackstep:Math.max(...backsteps),before:live[worst],after:live[worst+1]}));
    expect(session.getSnapshot()!.campaign!.outcomes[0]).toMatchObject({outcome:'arrested',playerId:session.getIdentity().playerId});
    expect(Math.max(...live.map(f=>f.contact)),'The run must include actual authoritative bumper corrections').toBeGreaterThan(3);
    expect(Math.max(...live.map(f=>f.corrections)),'Contact cannot reset the current local controller').toBe(initial);
    expect(new Set(frames.map(f=>f.life)).size,'Bumper contact cannot repeatedly change vehicle life').toBe(1);
    expect(Math.max(...backsteps),'Sustained contact must not repeatedly drag the local car back to an old server pose').toBeLessThan(.15);
  }finally{if(inputTimer)clearInterval(inputTimer);if(renderTimer)clearInterval(renderTimer);await session.dispose();await proxy.dispose();}
},12000);
