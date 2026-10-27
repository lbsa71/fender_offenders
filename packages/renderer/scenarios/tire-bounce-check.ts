import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const output=resolve(process.argv[2]??'work/tire-bounce');await mkdir(output,{recursive:true});
const server=process.env.RENDER_SCENARIO_URL?null:await createServer({configFile:false,root:resolve('packages/renderer/scenarios'),cacheDir:resolve('work/tire-bounce-vite-cache'),server:{host:'127.0.0.1',port:5286,strictPort:true,fs:{allow:[process.cwd()]}}});await server?.listen();
const browser=await chromium.launch({headless:true,...(existsSync(chromium.executablePath())?{}:{executablePath:process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|compile|uniform/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript('window.__name=(fn)=>fn');await page.goto(process.env.RENDER_SCENARIO_URL??'http://127.0.0.1:5286/');await page.waitForFunction(()=>Boolean((window as any).fixture?.renderer.getStats().wreckPhysicsReady));
 const launch=await page.evaluate(async()=>{
  const f=(window as any).fixture;f.pause();f.renderer.setSettings({quality:'medium',masterVolume:0,reducedShake:false,reducedFlash:true});
  const hero=f.frame.vehicles[0];f.frame.vehicles=[hero];hero.pose={x:4,z:-43,yaw:0};hero.velocity={x:0,z:0,yawRate:0};hero.protectedUntilTick=0;hero.status='active';hero.health=100;hero.discontinuityId++;f.frame.cameraTarget={...hero.pose};
  for(let i=0;i<20;i++){f.step(1/60);await new Promise(r=>requestAnimationFrame(r));}await f.gameScene.whenReadyAsync();
  f.renderer.present([{kind:'wreck',matchId:'tire-proof',eventId:'tire-proof-1',serverTick:600,payload:{vehicleId:hero.entityId,creditedPlayerId:null,position:{...hero.pose},bodyAssetId:hero.bodyAssetId,discontinuityId:hero.discontinuityId}}]);hero.status='wrecked';hero.health=0;
  f.tires=f.gameScene.transformNodes.filter((n:any)=>n.metadata?.wreckRole==='wheel'&&n.isEnabled());f.start=f.tires.map((n:any)=>n.position.clone());f.step(1/60);
  const kicks=f.tires.map((n:any,i:number)=>({x:(n.position.x-f.start[i].x)*60,y:(n.position.y-f.start[i].y)*60,z:(n.position.z-f.start[i].z)*60}));
  f.steps=1;f.previous=f.tires.map((n:any)=>n.position.y);f.falling=[false,false,false,false];f.floor=[null,null,null,null];f.rebound=[0,0,0,0];
  f.advance=(until:number)=>{while(f.steps<until){f.step(1/60);f.steps++;f.tires.forEach((n:any,i:number)=>{const y=n.position.y,dy=y-f.previous[i];if(dy<-.002)f.falling[i]=true;if(f.falling[i]&&f.previous[i]<.8&&dy>.002&&f.floor[i]===null)f.floor[i]=f.previous[i];if(f.floor[i]!==null)f.rebound[i]=Math.max(f.rebound[i],y-f.floor[i]);f.previous[i]=y;});}};
  return{tires:f.tires.length,kicks,bodies:f.renderer.getStats().wreckBodies};
 });
 assert.equal(launch.tires,4);const speeds=launch.kicks.map((v:any)=>Math.hypot(v.x,v.z));assert.ok(Math.max(...speeds)>7&&Math.max(...speeds)-Math.min(...speeds)>2,'tires must launch with distinctly different forces');
 await page.evaluate(()=>(window as any).fixture.advance(30));await page.screenshot({path:join(output,'tires-airborne.png')});
 const visiblePixels=await page.evaluate(()=>{
  const f=(window as any).fixture,gl=document.querySelector('canvas')!.getContext('webgl2')!,pixels=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  f.gameScene.render();const shown=pixels();for(const tire of f.tires)tire.setEnabled(false);f.gameScene.render();const hidden=pixels();for(const tire of f.tires)tire.setEnabled(true);f.gameScene.render();let changed=0;for(let i=0;i<shown.length;i+=4)if(Math.abs(shown[i]!-hidden[i]!)+Math.abs(shown[i+1]!-hidden[i+1]!)+Math.abs(shown[i+2]!-hidden[i+2]!)>25)changed++;return changed;
 });assert.ok(visiblePixels>40,'airborne rubber tires must be visible from the driving camera');
 await page.evaluate(()=>(window as any).fixture.advance(105));await page.screenshot({path:join(output,'tires-bouncing.png')});
 const lifecycle=await page.evaluate(()=>{
  const f=(window as any).fixture;f.advance(135);const rebound=[...f.rebound];f.advance(160);const expired=f.renderer.getStats();
  const hero=f.frame.vehicles[0];hero.status='active';hero.health=100;hero.discontinuityId++;f.step(0);f.renderer.setSettings({reducedShake:true});f.renderer.present([{kind:'wreck',matchId:'tire-proof',eventId:'tire-proof-2',serverTick:800,payload:{vehicleId:hero.entityId,creditedPlayerId:null,position:{...hero.pose},bodyAssetId:hero.bodyAssetId,discontinuityId:hero.discontinuityId}}]);f.step(1/60);const reduced=f.renderer.getStats();f.renderer.setGaragePreview('patrol');f.step(0);const garage=f.renderer.getStats();f.renderer.dispose();return{rebound,expired:{wheels:expired.wreckWheels,bodies:expired.wreckBodies},reduced:{wheels:reduced.wreckWheels,bodies:reduced.wreckBodies},garageBodies:garage.wreckBodies,remainingMeshes:f.gameScene.meshes.length};
 });
 assert.ok(lifecycle.rebound.some((height:number)=>height>.18),'the renderer must show an actual tire rebound');assert.deepEqual(lifecycle.expired,{wheels:0,bodies:0});assert.deepEqual(lifecycle.reduced,{wheels:0,bodies:0});assert.equal(lifecycle.garageBodies,0);assert.equal(lifecycle.remainingMeshes,0);assert.deepEqual(errors,[]);
 const report={launch,speeds,visiblePixels,lifecycle,errors};await writeFile(join(output,'evidence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await server?.close();}
