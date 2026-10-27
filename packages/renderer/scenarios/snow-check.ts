import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import assert from 'node:assert/strict';

const output=resolve(process.argv[2]??'work/snow-native');await mkdir(output,{recursive:true});
const server=process.env.RENDER_SCENARIO_URL?null:await createServer({configFile:false,root:resolve('packages/renderer/scenarios'),cacheDir:resolve('work/snow-vite-cache'),server:{host:'127.0.0.1',port:0,strictPort:true,fs:{allow:[process.cwd()]}}});
await server?.listen();const url=process.env.RENDER_SCENARIO_URL??`http://127.0.0.1:${(server!.httpServer!.address() as AddressInfo).port}/`;
const browser=await chromium.launch(existsSync(chromium.executablePath())?{}:{executablePath:process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|compile|uniform/i.test(m.text()))errors.push(m.text());});await page.addInitScript('window.__name=(fn)=>fn');await page.goto(url);await page.waitForFunction(()=>Boolean((window as any).fixture));
 await page.evaluate(()=>{const f=(window as any).fixture;f.pause();f.renderer.setSettings({muted:true,quality:'medium',reducedShake:false});f.frame.props=structuredClone(f.authoredProps);});
 const overview=async(dispatch:string)=>page.evaluate(async dispatch=>{
  const f=(window as any).fixture,s=f.gameScene;f.renderer.setDispatch(dispatch);f.step(0);s.fogEnabled=false;s.shadowsEnabled=false;s.clearColor.set(.04,.05,.07,1);s.ambientColor.set(.1,.1,.1);s.imageProcessingConfiguration.exposure=1;
  for(const light of s.lights){light.diffuse.set(1,1,1);light.intensity=light.groundColor?.8:1;if(light.groundColor)light.groundColor.set(.6,.6,.6);}
  const camera=s.activeCamera;camera.maxZ=1400;camera.position.set(0,410,-315);camera.setTarget(camera.position.clone().set(0,0,0));
  for(let i=0;i<35;i++){s.render();await new Promise(requestAnimationFrame);}await s.whenReadyAsync();s.render();
  const gl=document.querySelector('canvas')!.getContext('webgl2')!,pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let white=0;
  for(let i=0;i<pixels.length;i+=4){const r=pixels[i]!,g=pixels[i+1]!,b=pixels[i+2]!;if(Math.min(r,g,b)>175&&Math.max(r,g,b)-Math.min(r,g,b)<45)white++;}
  return {white,stats:f.renderer.getStats(),materials:s.materials.length,meshes:s.meshes.length,textures:s.textures.length,lights:s.lights.length};
 },dispatch);
 const dry=await overview('loose-change');await page.screenshot({path:join(output,'dry-overview.png')});const snow=await overview('paper-trail');await page.screenshot({path:join(output,'snow-overview.png')});
 await writeFile(join(output,'coverage.json'),JSON.stringify({dry,snow,errors},null,2));console.log(JSON.stringify({dryWhite:dry.white,snowWhite:snow.white,stats:snow.stats}));
 assert.ok(snow.white>dry.white+20000,'Snow must visibly cover roads, roofs, ground and trees under the same lighting, not just change the sky');
 const contrast=await page.evaluate(async moduleUrl=>{
  const {MeshBuilder}=await import(moduleUrl),s=(window as any).fixture.gameScene;
  const road=s.materials.find((m:any)=>m.name==='#4d6268false'),ground=s.materials.find((m:any)=>m.name==='#8ba079false');
  const probes=[road,ground].map((material:any,i:number)=>{const mesh=MeshBuilder.CreateBox('snow-material-probe',{width:8,height:.2,depth:8},s);mesh.position.set(i?8:-8,5,0);mesh.material=material;return mesh;});
  for(let i=0;i<15;i++){s.render();await new Promise(requestAnimationFrame);}const gl=document.querySelector('canvas')!.getContext('webgl2')!,m=s.getTransformMatrix().m;
  const colors=probes.map((probe:any)=>{const p=probe.position,x=p.x*m[0]+p.y*m[4]+p.z*m[8]+m[12],y=p.x*m[1]+p.y*m[5]+p.z*m[9]+m[13],w=p.x*m[3]+p.y*m[7]+p.z*m[11]+m[15];const pixels=new Uint8Array(36);gl.readPixels(Math.round((x/w*.5+.5)*gl.drawingBufferWidth)-1,Math.round((y/w*.5+.5)*gl.drawingBufferHeight)-1,3,3,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return [0,1,2].map(c=>Array.from({length:9},(_,i)=>pixels[i*4+c]!).reduce((a,b)=>a+b,0)/9);});for(const p of probes)p.dispose();return{road:colors[0]!,ground:colors[1]!};
 },'/@fs/'+resolve('packages/renderer/src/primitives.ts').replaceAll('\\','/'));
 await writeFile(join(output,'road-contrast.json'),JSON.stringify(contrast,null,2));
 assert.ok(contrast.road[2]!>contrast.road[0]!+10&&contrast.ground.reduce((a,b)=>a+b,0)>contrast.road.reduce((a,b)=>a+b,0)+50,'Blue packed-snow roads must remain distinct from fresh white snow after all world materials compile');
 const brightness=(rgb:number[])=>rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;
 assert.ok(brightness(contrast.ground)-brightness(contrast.road)>=65,'Packed-snow lanes must be at least 65 brightness levels darker than pavement snow at the native driving exposure');
 const banks=await page.evaluate(async()=>{const f=(window as any).fixture;f.frame.brokenSnowbanks=[];f.step(.016);const before=f.renderer.getStats();f.frame.brokenSnowbanks=['snowbank-x-0--40-1'];f.step(.016);const after=f.renderer.getStats();return{before:before.snowbanks,after:after.snowbanks,chunks:after.snowChunks,caps:after.snowCaps};});
 assert.equal(banks.before,280);assert.equal(banks.after,279);assert.ok(banks.chunks>0&&banks.chunks<=96);assert.equal(banks.caps,2);
 await page.screenshot({path:join(output,'snowbank-burst.png')});
 assert.equal(snow.stats.snowActive,true);assert.ok(snow.stats.snowCoveredMaterials>=15);assert.equal(snow.stats.waterFrozen,true);
 const lifecycle=await page.evaluate(async()=>{
  const f=(window as any).fixture,s=f.gameScene;f.renderer.setDispatch('paper-trail');f.frame.cameraTarget={x:4,z:-40,yaw:0};const car=f.frame.vehicles[0];car.pose={x:4,z:-41,yaw:0};car.velocity={x:0,z:16,yawRate:0};car.discontinuityId++;f.audioLog.length=0;
  for(let i=0;i<8;i++){car.pose.z+=.6;f.frame.cameraTarget={...car.pose};f.step(.05);await new Promise(requestAnimationFrame);}
  const active=f.renderer.getStats(),time=active.waterTime;for(let i=0;i<5;i++)f.step(.1);const frozenTime=f.renderer.getStats().waterTime;
  const before={materials:s.materials.length,meshes:s.meshes.length,textures:s.textures.length,lights:s.lights.length};
  f.renderer.setSettings({reducedShake:true});f.step(.1);const reduced=f.renderer.getStats();f.renderer.setSettings({reducedShake:false,quality:'low'});f.step(.1);const low=f.renderer.getStats();
  f.renderer.setSettings({quality:'medium'});for(let n=0;n<12;n++){f.renderer.setDispatch('green-light');f.step(.02);f.renderer.setDispatch('paper-trail');f.step(.02);}const after={materials:s.materials.length,meshes:s.meshes.length,textures:s.textures.length,lights:s.lights.length};
  f.renderer.setGaragePreview('patrol');f.step(.05);const garage=f.renderer.getStats();f.renderer.setGaragePreview(null);f.renderer.setDispatch('green-light');f.step(.05);const thaw=f.renderer.getStats();
  return{active,time,frozenTime,before,after,reduced,low,garage,thaw,splashSounds:f.audioLog.filter((c:any)=>c.kind==='splash').length};
 });
 await page.screenshot({path:join(output,'thawed-driving.png')});
 assert.equal(lifecycle.active.waterSplashDrops,0);assert.equal(lifecycle.splashSounds,0);assert.equal(lifecycle.frozenTime,lifecycle.time);assert.equal(lifecycle.active.waterRipples,false);assert.equal(lifecycle.active.waterReflectionPasses,0);
 assert.ok(lifecycle.active.snowflakes>0&&lifecycle.active.snowflakes<=128);assert.ok(lifecycle.low.snowflakes>0&&lifecycle.low.snowflakes<=64);assert.equal(lifecycle.reduced.snowflakes,0);assert.equal(lifecycle.garage.snowflakes,0);assert.deepEqual(lifecycle.after,lifecycle.before);assert.equal(lifecycle.thaw.snowActive,false);assert.equal(lifecycle.thaw.waterFrozen,false);assert.equal(lifecycle.thaw.snowflakes,0);assert.equal(lifecycle.thaw.waterRipples,true);
 await page.evaluate(()=>{const f=(window as any).fixture;f.gameScene.fogEnabled=true;f.renderer.setSettings({quality:'medium',reducedShake:false});f.renderer.setDispatch('paper-trail');for(let i=0;i<20;i++)f.step(.05);});await page.screenshot({path:join(output,'snow-driving.png')});await page.evaluate(()=>{const f=(window as any).fixture;f.frame.brokenSnowbanks=[];f.step(.016);f.frame.brokenSnowbanks=['snowbank-x-0--40-1'];f.step(.016);});await page.screenshot({path:join(output,'snow-driving-burst.png')});
 const disposal=await page.evaluate(()=>{const f=(window as any).fixture;f.renderer.dispose();return{snow:f.renderer.getStats().snowflakes,meshes:f.gameScene.meshes.length,systems:f.gameScene.particleSystems.length};});assert.deepEqual(disposal,{snow:0,meshes:0,systems:0});assert.deepEqual(errors,[]);
 await writeFile(join(output,'report.json'),JSON.stringify({dry,snow,lifecycle,disposal,errors},null,2));console.log('Snow coverage, frozen water, bounded snowfall, accessibility, thaw and cleanup passed.');
}finally{await browser.close();await server?.close();}
