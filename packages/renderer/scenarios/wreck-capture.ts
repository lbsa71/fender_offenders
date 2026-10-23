import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const output=resolve(process.argv[2]??'work/wreck-proof');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors:string[]=[],warnings:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().includes('on an instanced mesh has no effect'))warnings.push(m.text());});await page.addInitScript('window.__name=(fn)=>fn');
 await page.goto('http://127.0.0.1:5184');await page.waitForFunction(()=>!!(window as any).fixture?.gameScene.getTransformNodeByName('body-hero'));await page.getByRole('button').click();
 await page.evaluate(async()=>{const f=(window as any).fixture;f.pause();f.frame.vehicles=[f.frame.vehicles[0]];const h=f.frame.vehicles[0];h.pose={x:4,z:-43,yaw:.18};h.bodyAssetId='interceptor';h.velocity={x:0,z:0,yawRate:0};h.discontinuityId++;h.health=100;h.status='active';h.protectedUntilTick=0;f.ordinal=0;f.event=()=>({kind:'wreck',matchId:'wreck-capture',eventId:`wreck-capture-${++f.ordinal}`,serverTick:600+f.ordinal,payload:{vehicleId:'hero',creditedPlayerId:null,position:{...h.pose},bodyAssetId:h.bodyAssetId,discontinuityId:h.discontinuityId}});f.step();f.renderer.present([f.event()]);for(let i=0;i<75;i++){f.step(.04);await new Promise(r=>setTimeout(r,12));}h.discontinuityId++;h.health=100;h.status='active';f.step();for(let i=0;i<12;i++){f.step();await new Promise(r=>setTimeout(r,16));}});
 const camera=()=>page.evaluate(()=>{const f=(window as any).fixture,h=f.frame.vehicles[0],c=f.gameScene.activeCamera;c.position.set(-h.pose.x+12,10,h.pose.z-14);c.setTarget(c.position.constructor.FromArray([-h.pose.x,1.7,h.pose.z]));f.gameScene.render();});
 await camera();await page.screenshot({path:join(output,'wreck-00-intact.png')});
 await page.evaluate(()=>{const f=(window as any).fixture,h=f.frame.vehicles[0];f.renderer.present([f.event()]);h.status='wrecked';h.health=0;f.step(.06);f.step(.06);});await camera();await page.screenshot({path:join(output,'wreck-01-blast.png')});
 await page.evaluate(()=>{const f=(window as any).fixture;for(let i=0;i<5;i++)f.step(.096);});await camera();await page.screenshot({path:join(output,'wreck-02-parts-airborne.png')});
 await page.evaluate(()=>{const f=(window as any).fixture;for(let i=0;i<6;i++)f.step(.1);});await camera();await page.screenshot({path:join(output,'wreck-03-tumbling.png')});
 await page.evaluate(()=>{const f=(window as any).fixture;for(let i=0;i<10;i++)f.step(.1);});await camera();await page.screenshot({path:join(output,'wreck-04-bouncing.png')});
 await page.evaluate(()=>{const f=(window as any).fixture;for(let i=0;i<5;i++)f.step(.1);});await camera();await page.screenshot({path:join(output,'wreck-05-charred-chassis.png')});
 const finalStats=await page.evaluate(()=>{const f=(window as any).fixture;return f.renderer.getStats();});assert.equal(finalStats.wreckSequences,0);assert.equal(finalStats.wreckWheels,0);
 await page.evaluate(()=>{const f=(window as any).fixture,h=f.frame.vehicles[0];h.status='active';h.discontinuityId++;h.health=100;f.step();});await camera();await page.screenshot({path:join(output,'wreck-06-restored.png')});assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);console.log(JSON.stringify({output,finalStats}));
}finally{await browser.close();}
