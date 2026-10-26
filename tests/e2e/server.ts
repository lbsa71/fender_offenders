/** Local browser harness only. This entrypoint is never imported into the production server. */
import { createServer } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index';
import type { Simulation } from '@fender/sim';
import { neutralActions } from '@fender/contracts';

const port=Number(process.env.PORT??2867),server=await createGameServer(port,'127.0.0.1');
const fixtures=createServer((req,res)=>{
 const route=/^\/room\/([A-Za-z0-9_-]{8,64})\/(stage|arrest|gadget|contact)\/(\d)$/.exec(req.url??'');
 if(req.method!=='POST'||!route){res.writeHead(404).end();return;}
 const room=matchMaker.getLocalRoomById(route[1]!) as unknown as {sim:Simulation}|undefined;
 if(!room){res.writeHead(404).end('Room missing');return;}
 const sim=room.sim,c=sim.checkpoint(),officer=c.state.records.find(r=>r.vehicle.playerId!==null);
 if(!officer||!c.state.campaign){res.writeHead(409).end();return;}
 if(route[2]==='stage'){
   const stage=Number(route[3]);c.state.phase='results';c.state.campaign.status='active';c.state.campaign.dispatchIndex=Math.max(0,stage-1);
   c.state.campaign.outcomes=Array.from({length:stage},(_,dispatchIndex)=>({dispatchIndex,outcome:'arrested',playerId:officer.vehicle.playerId!,callsign:'Fixture officer',elapsedTicks:180}));
   sim.restore(c);sim.rematch(officer.vehicle.playerId!);
 }else if(route[2]==='gadget'){
   const stage=Number(route[3]);if(stage!==5&&stage!==6){res.writeHead(400).end();return;}
   const suspect=c.state.records.find(r=>r.vehicle.entityId===c.state.pursuit?.suspectId)!;
   c.state.phase='playing';c.state.phaseEnd=c.tick+2000;c.state.campaign.dispatchIndex=stage;c.state.projectiles=[];c.state.grenades=[];c.state.gadgets=[];
   suspect.bossAi=undefined;suspect.vehicle.pose={x:0,z:-76,yaw:Math.PI/2};suspect.vehicle.velocity={x:3,z:0,yawRate:0};suspect.vehicle.protectedUntilTick=0;suspect.vehicle.discontinuityId++;
   officer.vehicle.pose={x:stage===5?-14:-3,z:stage===5?-76:-72.5,yaw:Math.PI/2};officer.vehicle.velocity={x:9,z:0,yawRate:0};officer.vehicle.protectedUntilTick=0;officer.vehicle.discontinuityId++;
   c.state.records=c.state.records.filter(r=>r===suspect||r.vehicle.playerId!==null);sim.restore(c);
 }else{
   const suspect=c.state.records.find(r=>r.vehicle.entityId===c.state.pursuit?.suspectId)!;
   suspect.traffic=undefined;suspect.vehicle.pose={x:0,z:-30,yaw:0};suspect.vehicle.velocity={x:0,z:0,yawRate:0};suspect.vehicle.protectedUntilTick=0;
   officer.vehicle.pose={x:5,z:-30,yaw:0};officer.vehicle.velocity={x:0,z:0,yawRate:0};officer.vehicle.protectedUntilTick=0;
   // Forced fixture placement is an explicit server intervention. A routine
   // snapshot must not replace the continuously driven local car.
   officer.vehicle.discontinuityId++;suspect.vehicle.discontinuityId++;
   if(route[2]==='contact'){
     c.state.records=[officer,suspect];officer.vehicle.pose={x:0,z:-30,yaw:0};suspect.vehicle.pose={x:0,z:-25.5,yaw:Math.PI};
     const step=sim.step.bind(sim);let sequence=0;
     sim.step=inputs=>step(new Map([...inputs,[suspect.vehicle.entityId,{actions:{...neutralActions(),throttle:.2},sessionEpoch:'bumper-fixture',sourceCommandSequence:sequence++}]]));
   }
   sim.restore(c);
 }
 res.writeHead(204).end();
});
fixtures.listen(port+1000,'127.0.0.1');
async function stop(){fixtures.close();await server.gracefullyShutdown(false);process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
