import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors:string[]=[],warnings:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().includes('on an instanced mesh has no effect'))warnings.push(m.text());});await page.addInitScript('window.__name=(fn)=>fn');
 await page.goto('http://127.0.0.1:5184');await page.waitForFunction(()=>!!(window as any).fixture?.gameScene.getTransformNodeByName('body-hero')&&(window as any).fixture.renderer.getStats().wreckPhysicsReady);
 const report=await page.evaluate(()=>{
  const f=(window as any).fixture;f.pause();f.audioLog.length=0;const hero=f.frame.vehicles[0],peer=f.frame.vehicles[1],issues:string[]=[];let ordinal=0;
  const event=(id='hero',legacy=false)=>{const v=id==='hero'?hero:peer;return{kind:'wreck',eventId:`wreck-check-${++ordinal}`,serverTick:600+ordinal,matchId:'wreck-check',payload:{vehicleId:id,creditedPlayerId:null,...(legacy?{}:{position:{...v.pose},bodyAssetId:v.bodyAssetId,discontinuityId:v.discontinuityId})}};};
  const parts=(id:string)=>{const root=f.gameScene.getTransformNodeByName(`vehicle-${id}`);return{intact:root.getChildMeshes().filter((m:any)=>m.sourceMesh?.metadata?.role&&m.isVisible).length,charred:root.getChildMeshes().filter((m:any)=>m.sourceMesh?.metadata?.wreckPart&&m.isVisible).length};};
  const snapshot=()=>f.renderer.getStats();const sounds=()=>f.audioLog.filter((a:any)=>a.kind==='wreck').length;
  hero.protectedUntilTick=0;hero.status='active';hero.health=100;f.step();const wreck=event();f.renderer.present([wreck]);f.step(.1);const burst=snapshot();
  const assembly=f.gameScene.meshes.filter((m:any)=>m.name.startsWith('assembly-patrol:armed-')&&m.metadata?.componentId).length;
  if(burst.wreckWheels!==4||burst.wreckPieces!==assembly||burst.wreckBodies!==assembly||burst.wreckPanels!==assembly-4||burst.wreckFireballs<6||burst.wreckRings!==2)issues.push('confirmed wreck lacks the complete physical car assembly and staged explosion');
  if(parts('hero').intact!==0||parts('hero').charred<1)issues.push('intact car was not replaced with charred chassis');
  f.renderer.present([wreck,{...wreck,eventId:'same-life-other-id'}]);f.step();if(sounds()!==1)issues.push('duplicate wreck replayed sound');
  peer.status='wrecked';peer.health=0;f.step();if(parts('peer').intact!==0||parts('peer').charred<1||snapshot().wreckSequences!==1)issues.push('late join wreck snapshot failed to show chassis without explosion');
  for(let i=0;i<155;i++)f.step(1/60);if(snapshot().wreckSequences!==0||snapshot().wreckWheels!==0||snapshot().wreckSmoke!==0||snapshot().wreckBodies!==0)issues.push('wreck debris outlived pre-respawn cleanup');
  hero.discontinuityId++;hero.status='active';f.step();const before=sounds();f.renderer.present([{...wreck,eventId:'delayed-old-life'}]);f.step();if(snapshot().wreckSequences!==0||sounds()!==before||parts('hero').intact===0)issues.push('delayed wreck destroyed a respawned life');
  f.renderer.present([event('hero',true)]);f.step();if(snapshot().wreckSequences!==0||sounds()!==before)issues.push('legacy wreck accepted while snapshot active');
  hero.status='wrecked';hero.health=0;f.step();f.renderer.present([event('hero',true)]);f.step();if(snapshot().wreckWheels!==4||sounds()!==before+1)issues.push('legacy wreck while confirmed snapshot wrecked was ignored');
  hero.status='respawning';f.step();if(snapshot().wreckSequences!==0||snapshot().wreckBodies!==0)issues.push('respawning snapshot did not clear debris');hero.status='active';hero.discontinuityId++;hero.health=100;f.step();if(parts('hero').intact===0||parts('hero').charred!==0)issues.push('respawn did not restore intact body');
  f.renderer.present([event('peer')]);f.step();f.frame.vehicles=[hero];f.step();if(snapshot().wreckSequences!==0)issues.push('leaving entity left flying wreck parts');
  f.renderer.present([event()]);f.step();f.renderer.setGaragePreview('patrol');f.step();if(snapshot().wreckSequences!==0||snapshot().wreckBodies!==0)issues.push('garage entry retained wreck sequence');f.renderer.setGaragePreview(null);hero.discontinuityId++;hero.status='active';f.step();
  f.renderer.setSettings({reducedShake:true,reducedFlash:true});f.renderer.present([event()]);f.step();const reduced=snapshot();if(reduced.wreckWheels!==0||reduced.wreckPanels!==0||reduced.wreckRings!==0||reduced.wreckBodies!==0||reduced.wreckFireballs>4)issues.push('motion/flash reduction retained flying parts or large flash');
  f.renderer.dispose();if(f.gameScene.meshes.length!==0)issues.push('renderer disposal leaked wreck meshes');
  return{issues,burst,reduced,sounds:sounds()};
 });console.log(JSON.stringify(report));assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.deepEqual(report.issues,[]);
}finally{await browser.close();}
