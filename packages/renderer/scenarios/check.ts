import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('work',{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const errors:string[]=[],instanceWarnings:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.text().includes('Setting visibility on an instanced mesh'))instanceWarnings.push(message.text());});
 await page.goto('http://127.0.0.1:5184');await page.waitForFunction(()=>!!(window as any).fixture?.gameScene.getTransformNodeByName('body-hero'));
 const checks=await page.evaluate(()=>{
  const f=(window as any).fixture,issues:string[]=[];f.pause();f.cues.length=0;
  const hero=f.frame.vehicles[0],peer=f.frame.vehicles[1];hero.bodyAssetId='ambulance';f.step();
  if(!f.state().paint.includes('paint-ambulance'))issues.push('same-entity body selection did not rebuild the visual');
  peer.maxHealth=200;peer.health=100;f.step();if(Math.abs(f.state('peer').healthScale-.5)>.001)issues.push('health bar ignored authoritative maximum health');
  hero.velocity={x:0,z:20,yawRate:1.5};for(let i=0;i<90;i++)f.step();
  if(f.state().body.scaleY>.95||Math.abs(f.state().body.lean)<.2)issues.push('moving corner has no coachwork squash/heel');
  hero.velocity={x:0,z:0,yawRate:0};for(let i=0;i<180;i++)f.step();
  hero.pose.z=-21;hero.velocity={x:0,z:18,yawRate:0};hero.discontinuityId++;f.step();hero.pose.z=-19;f.step(.05);
  if(f.state().body.scaleY>.95)issues.push('hump crossing did not compress');
  const first=f.cues.filter((x:string)=>x==='boing').length;for(let i=0;i<30;i++)f.step();
  if(first!==1||f.cues.filter((x:string)=>x==='boing').length!==1)issues.push('hump did not produce exactly one novelty cue');
  if(typeof f.renderer.setGaragePreview!=='function')issues.push('garage preview API is missing');
  hero.protectedUntilTick=10000;f.step();peer.status='wrecked';f.step();
  if(!f.state().markerVisible)issues.push('protected car lost its independent status marker');
  return{issues,state:f.state(),cues:f.cues};
 });console.log(JSON.stringify(checks));assert.deepEqual(errors,[]);assert.deepEqual(checks.issues,[]);assert.equal(instanceWarnings.length,0,`instance visibility warnings: ${instanceWarnings.length}`);
}finally{await browser.close();}
