import { performance } from 'node:perf_hooks';
import { districtMap, districtProps } from '../content/src/index.js';
import { neutralActions, packSnapshot, type PropDefinition } from '@fender/contracts';
import { createSimulation, initPhysics } from './src/index.js';
import { getMessageBytes, Protocol } from '@colyseus/core';
import { createPropPublisher } from '../net-server/src/prop-publisher.js';
await initPhysics();
const authored=districtProps.length,fill:PropDefinition[]=Array.from({length:192-authored},(_,i)=>({entityId:`stress-${i}`,kind:'crate',position:{x:-120,y:.5,z:-120+i*.9}}));
function run(dynamic:boolean){
 const definitions=[...districtProps,...fill].map(p=>({...p,anchored:!dynamic}));
 const sim=createSimulation(districtMap,{mode:'practice',trafficCount:8,props:definitions});
 const players=Array.from({length:8},(_,i)=>sim.addPlayer({playerId:`p${i}`,nickname:`p${i}`,bodyAssetId:'patrol'}));
 const initialWire=packSnapshot(sim.snapshot()),initialBytes=Buffer.byteLength(JSON.stringify(initialWire)),initialEncodedBytes=getMessageBytes.raw(Protocol.ROOM_DATA,'snapshot',initialWire).byteLength,times:number[]=[];
 const publisher=createPropPublisher();publisher.filter(initialWire);let encodedFull=0,encodedDelta=0,packets=0,propTuples=0,quietPackets=0;
 try{
  for(let tick=0;tick<1200;tick++){
   const started=performance.now();sim.step(new Map(players.map((car,i)=>[car.entityId,{actions:{...neutralActions(),throttle:1,steer:Math.sin(tick/80+i)*.65},sessionEpoch:'bench',sourceCommandSequence:tick}])));const elapsed=performance.now()-started;
   sim.drainEvents();if(tick>=120)times.push(elapsed);
   if(tick%3===0){const full=packSnapshot(sim.snapshot()),delta=publisher.filter(full);if(tick>=120){encodedFull+=getMessageBytes.raw(Protocol.ROOM_DATA,'snapshot',full).byteLength;encodedDelta+=getMessageBytes.raw(Protocol.ROOM_DATA,'snapshot',delta).byteLength;packets++;propTuples+=delta.props?.length??0;if(!delta.props)quietPackets++;}}
  }
  times.sort((a,b)=>a-b);const bytes=Buffer.byteLength(JSON.stringify(packSnapshot(sim.snapshot())));
  return {scenario:dynamic?'all192dynamic':'all192initiallyfixed',authoredProps:authored,totalProps:192,players:8,traffic:8,meanStepMs:times.reduce((a,b)=>a+b)/times.length,p95StepMs:times[Math.floor(times.length*.95)],maxStepMs:times.at(-1),initialSnapshotBytes:initialBytes,initialMessagePackBytes:initialEncodedBytes,finalSnapshotBytes:bytes,averageFullMessagePackBytes:encodedFull/packets,averageDeltaMessagePackBytes:encodedDelta/packets,averageDeltaBytesPerSecondAt20Hz:encodedDelta/packets*20,averageChangedPropTuples:propTuples/packets,quietPropPackets:quietPackets,measuredPackets:packets};
 }finally{sim.dispose();}
}
console.log(JSON.stringify([run(false),run(true)],null,2));
