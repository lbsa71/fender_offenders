import {dispatchFixture,expect,test} from './fixtures';
import type {Page} from '@playwright/test';
import {createServer} from 'vite';
import {resolve} from 'node:path';
const fixtureUrl=`/@fs/${process.cwd().replaceAll('\\','/')}/packages/ui/dev/index.html`;
async function exposure(page:Page,tick:number,options:{paused?:boolean;protected?:boolean;reducedFlash?:boolean;phase?:string;victim?:string}={}){
 await page.evaluate(({tick,options})=>{
  const {ui,snapshot}= (window as any).fixture;
  const vehicle={entityId:'unit',playerId:'you',bodyAssetId:'patrol',pose:{x:0,z:0,yaw:0},velocity:{x:0,z:0,yawRate:0},health:100,status:'active',protectedUntilTick:options.protected?9999:0,respawnAtTick:null,sirenOn:false,discontinuityId:0};
  if(options.reducedFlash!==undefined)ui.setSettings({reducedFlash:options.reducedFlash});
  ui.update({localPlayerId:'you',snapshot:{...snapshot,serverTick:tick,phase:options.phase??'playing',paused:options.paused??false,vehicles:[vehicle],local:{vehicle,driver:{},lastConsumedSequence:0},gadgets:[{entityId:'smog',ownerEntityId:'boss',kind:'smog',pose:{x:0,z:0,yaw:0},bornTick:0,activeAtTick:60,expiresTick:450,exposures:[{vehicleId:options.victim??'unit',bornTick:100,expiresTick:310}]}]}});
 },{tick,options});
}
test('smog envelopes the car, fades to white for 2.5 seconds and clears without blocking menus',async({page},info)=>{
 await page.goto(fixtureUrl);await page.getByRole('button',{name:'HIT THE STREETS'}).click();
 await exposure(page,112);const veil=page.locator('[data-smog-screen]'),white=veil.locator('[data-smog-white]');
 await expect(veil).toBeVisible();await expect(veil).toHaveAttribute('data-phase','fog');
 await expect(white).toHaveCSS('opacity','0');
 await exposure(page,130);const partial=await white.evaluate(n=>Number(getComputedStyle(n).opacity));expect(partial).toBeGreaterThan(0);expect(partial).toBeLessThan(1);
 await exposure(page,136);await expect(white).toHaveCSS('opacity','1');await expect(veil).toHaveAttribute('data-phase','whiteout');
 await page.keyboard.down('w');expect(await page.evaluate(()=>(window as any).fixture.input.sample().throttle)).toBe(1);await page.keyboard.up('w');
 await page.screenshot({path:info.outputPath('smog-whiteout.png')});
 await page.keyboard.press('Escape');await expect(veil).toBeHidden();await expect(page.getByRole('heading',{name:'Taking a breather?'})).toBeVisible();
 await page.keyboard.press('Escape');await expect(white).toHaveCSS('opacity','1');
 await exposure(page,285);await expect(white).toHaveCSS('opacity','1');
 await exposure(page,298);expect(await white.evaluate(n=>Number(getComputedStyle(n).opacity))).toBeLessThan(1);
 await exposure(page,310);await expect(veil).toBeHidden();
});
test('a real suspect smog cloud warns, envelopes the officer and clears after the room-owned exposure',async({page},info)=>{
 await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await dispatchFixture(page,7);
 await expect(page.locator('[data-tutorial-lesson]')).toContainText('smog');await page.getByRole('button',{name:'START DISPATCH'}).click();
 await page.waitForFunction(()=>(window as any).__FENDER_DEBUG__?.snapshot?.phase==='playing');
 const room=new URL(page.url()).searchParams.get('room')!,port=Number(process.env.FENDER_E2E_SERVER_PORT??2867)+1000;
 expect((await page.request.post(`http://127.0.0.1:${port}/room/${room}/gadget/7`)).ok()).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__.stats.renderer.smogClouds)).toBeGreaterThan(0);
 const veil=page.locator('[data-smog-screen]');await expect(veil).toHaveAttribute('data-phase','whiteout');await expect(veil.locator('[data-smog-white]')).toHaveCSS('opacity','1');
 const exposure=await page.evaluate(()=>{const s=(window as any).__FENDER_DEBUG__.snapshot;return s.gadgets.flatMap((g:any)=>g.exposures??[]).find((e:any)=>e.vehicleId===s.local.vehicle.entityId);});expect(exposure.expiresTick-exposure.bornTick).toBe(210);
 await page.screenshot({path:info.outputPath('live-suspect-whiteout.png')});await expect(veil).toBeHidden({timeout:8000});
});
test('smog respects the exposed officer, protection, results and reduced flashes',async({page},info)=>{
 await page.goto(fixtureUrl);await page.getByRole('button',{name:'HIT THE STREETS'}).click();
 const veil=page.locator('[data-smog-screen]');
 await exposure(page,150,{victim:'backup'});await expect(veil).toBeHidden();
 await exposure(page,150,{protected:true});await expect(veil).toBeHidden();
 await exposure(page,150,{phase:'results'});await expect(veil).toBeHidden();
 await page.keyboard.press('Escape');
 await exposure(page,150,{reducedFlash:true});await expect(veil).toBeVisible();
 await expect(veil.locator('[data-smog-white]')).toHaveCSS('opacity','1');
 const color=await veil.locator('[data-smog-white]').evaluate(n=>getComputedStyle(n).backgroundColor);expect(color).not.toBe('rgb(255, 255, 255)');
 await page.screenshot({path:info.outputPath('smog-reduced-flashes.png')});
});
test('native smog has visible warning billows, envelopes the car and reuses its bounded buffers',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Keep native shader modules out of the app server's dependency optimizer.
 // Other entrypoints or dev servers must not invalidate this scene's chunks.
 const preview=await createServer({configFile:false,root:resolve('packages/renderer/scenarios'),cacheDir:resolve('work/smog-e2e-vite-cache'),server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd()]}}});
 await preview.listen();
 try{
 await page.goto(preview.resolvedUrls!.local[0]!);
 await page.waitForFunction(()=>Boolean((window as any).fixture?.gameScene?.getTransformNodeByName('body-hero')));
 await page.evaluate(async()=>{
  const f=(window as any).fixture;f.pause();f.renderer.setSettings({quality:'low',muted:true});
  f.frame.vehicles[0].pose={x:4,z:-44,yaw:0};f.frame.vehicles[1].pose={x:4,z:-31,yaw:0};f.frame.vehicles[1].playerId=null;
  f.frame.cameraTarget={x:4,z:-44,yaw:0};
  f.frame.gadgets=[{entityId:'smog',ownerEntityId:f.frame.vehicles[1].entityId,kind:'smog',pose:{x:4,z:-44,yaw:0},bornTick:100,activeAtTick:160,expiresTick:550,exposures:[{vehicleId:f.frame.vehicles[0].entityId,bornTick:190,expiresTick:400}]}];f.frame.serverTick=120;
  f.step(0);await f.gameScene.whenReadyAsync();
  for(let i=0;i<12;i++){f.step(0);await new Promise(requestAnimationFrame);}
 });
 for(const [name,tick,reduced] of [['warning',120,false],['engulfed',200,false],['reduced',210,true]] as const){
  const metrics=await page.evaluate(({tick,reduced})=>{const f=(window as any).fixture;f.frame.serverTick=tick;f.renderer.setSettings({reducedShake:reduced,reducedFlash:reduced});f.step(0);return {stats:f.renderer.getStats(),gl:f.gameScene.getEngine()._gl.getError()};},{tick,reduced});
  expect(metrics.gl).toBe(0);expect(metrics.stats.smogClouds).toBe(1);expect(metrics.stats.smogPuffs).toBe(name==='warning'?12:20);
  await page.screenshot({path:info.outputPath(`smog-${name}.png`)});
 }
 const expired=await page.evaluate(()=>{const f=(window as any).fixture,before=f.gameScene.meshes.length;f.frame.serverTick=550;f.step(0);return {before,after:f.gameScene.meshes.length,stats:f.renderer.getStats()};});
 expect(expired.before).toBe(expired.after);expect(expired.stats.smogPuffs).toBe(0);expect(errors).toEqual([]);
 }finally{await preview.close();}
});
