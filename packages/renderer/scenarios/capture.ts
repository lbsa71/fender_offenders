import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('work',{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5184');await page.waitForFunction(()=>!!(window as any).fixture?.gameScene.getTransformNodeByName('body-hero'));await page.getByRole('button').click();
 await page.evaluate(()=>{const f=(window as any).fixture;f.pause();f.frame.vehicles[0].bodyAssetId='patrol';f.step();});
 const closeUp=async()=>page.evaluate(()=>{const f=(window as any).fixture,h=f.frame.vehicles[0],c=f.gameScene.activeCamera;c.position.set(-h.pose.x+8,7,h.pose.z-11);c.setTarget(c.position.constructor.FromArray([-h.pose.x,1.1,h.pose.z]));f.gameScene.render();});
 await page.waitForTimeout(350);await closeUp();await page.screenshot({path:'work/cartoon-neutral.png'});
 await page.evaluate(()=>{const f=(window as any).fixture;f.frame.vehicles[0].velocity={x:0,z:22,yawRate:1.5};for(let i=0;i<90;i++)f.step();});await page.waitForTimeout(350);await closeUp();await page.screenshot({path:'work/cartoon-turn.png'});
 await page.evaluate(()=>{const f=(window as any).fixture,h=f.frame.vehicles[0];h.velocity={x:0,z:0,yawRate:0};for(let i=0;i<180;i++)f.step();h.pose.z=-21;h.velocity={x:0,z:22,yawRate:0};h.discontinuityId++;f.step();h.pose.z=-19;f.step(.05);});await page.waitForTimeout(350);await closeUp();await page.screenshot({path:'work/cartoon-bump-compress.png'});
 await page.evaluate(()=>{const f=(window as any).fixture;for(let i=0;i<8;i++)f.step();});await page.waitForTimeout(350);await closeUp();await page.screenshot({path:'work/cartoon-bump-rebound.png'});
 const stats=await page.evaluate(()=>{const f=(window as any).fixture;f.renderer.setGaragePreview('ambulance');f.step();const a=f.renderer.getStats().garageAngle;for(let i=0;i<60;i++)f.step();const b=f.renderer.getStats().garageAngle;f.renderer.setSettings({reducedShake:true});for(let i=0;i<60;i++)f.step();return{a,b,afterReduced:f.renderer.getStats().garageAngle,stats:f.renderer.getStats(),cues:f.cues};});
 assert(stats.b>stats.a);assert.equal(stats.afterReduced,stats.b);await page.evaluate(async()=>{const f=(window as any).fixture;for(let i=0;i<25;i++){f.step();await new Promise(r=>setTimeout(r,40));}});await page.screenshot({path:'work/cartoon-garage.png'});assert.deepEqual(errors,[]);console.log(JSON.stringify(stats));
}finally{await browser.close();}
