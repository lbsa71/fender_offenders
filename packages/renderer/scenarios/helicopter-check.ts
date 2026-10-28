import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const output=resolve(process.argv[2]??'work/helicopter');await mkdir(output,{recursive:true});
const server=process.env.RENDER_SCENARIO_URL?null:await createServer({configFile:false,root:resolve('packages/renderer/scenarios'),cacheDir:resolve('work/helicopter-vite-cache'),server:{host:'127.0.0.1',port:5285,strictPort:true,fs:{allow:[process.cwd()]}}});await server?.listen();
const browser=await chromium.launch({headless:true,...(existsSync(chromium.executablePath())?{}:{executablePath:process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'})});
try{
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if((m.type()==='error'&&/shader|compile|uniform/i.test(m.text()))||/hierarchy is not valid|parent that is not in the container/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript('window.__name=(fn)=>fn');
 await page.goto(process.env.RENDER_SCENARIO_URL??'http://127.0.0.1:5285/');
 await page.waitForFunction(()=>Boolean((window as any).fixture));
 await page.waitForFunction(()=>(window as any).fixture.renderer.getStats().helicopterModelStatus!=='loading');
 const appearance=await page.evaluate(async()=>{
  const f=(window as any).fixture;f.pause();f.renderer.setSettings({quality:'medium',reducedFlash:true});f.renderer.setDispatch('stamp-duty');f.frame.props=structuredClone(f.authoredProps);f.frame.serverTick=500;
  f.frame.cameraTarget={x:4,z:-43,yaw:0};Object.assign(f.frame.vehicles[0].pose,f.frame.cameraTarget);
  f.frame.helicopter={entityId:'native-air',dispatchIndex:4,phase:'attack',health:60,from:{x:4,z:-51},to:{x:4,z:-51},yaw:Math.PI/2,startedAtTick:400,endsAtTick:1000};
  for(let i=0;i<35;i++){f.step(.05);await new Promise(r=>requestAnimationFrame(r));}await f.gameScene.whenReadyAsync();f.step(0);
  const gl=document.querySelector('canvas')!.getContext('webgl2')!;
  const sample=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  f.helicopterPixels=()=>{
   const root=f.gameScene.getTransformNodeByName('black-chopper'),marker=f.gameScene.getMeshByName('chopper-ground-marker');
   const health=f.gameScene.getMeshByName('chopper-health'),back=f.gameScene.getMeshByName('chopper-health-back');
   health.isVisible=false;back.isVisible=false;marker.isVisible=false;f.gameScene.render();const body=sample();
   root.setEnabled(false);marker.isVisible=false;f.gameScene.render();const hidden=sample();
   let bodyPixels=0;for(let i=0;i<body.length;i+=4)if(Math.abs(body[i]!-hidden[i]!)+Math.abs(body[i+1]!-hidden[i+1]!)+Math.abs(body[i+2]!-hidden[i+2]!)>35)bodyPixels++;
   f.step(0);return bodyPixels;
  };
  const root=f.gameScene.getTransformNodeByName('black-chopper'),shown=sample();
  const health=f.gameScene.getMeshByName('chopper-health');health.isVisible=false;f.gameScene.render();const noHealth=sample();let healthPixels=0;
  for(let i=0;i<shown.length;i+=4)if(shown[i+1]!>shown[i]!+20&&Math.abs(shown[i+1]!-noHealth[i+1]!)>25)healthPixels++;health.isVisible=true;
  const main=f.gameScene.getNodeByName('rotor_main'),tail=f.gameScene.getNodeByName('rotor_tail');
  const angles=[main.rotation.y,tail.rotation.x];f.frame.serverTick++;f.step(0);
  const rotorMoves=main.rotation.y!==angles[0]&&tail.rotation.x!==angles[1];
  const bodyPixels=f.helicopterPixels(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return{bodyPixels,healthPixels,rotorMoves,stats:f.renderer.getStats(),height:root.position.y,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 });
 await page.screenshot({path:join(output,'black-chopper-pass.png')});
 assert.equal(appearance.stats.helicopterModelStatus,'ready',appearance.stats.helicopterModelError??'GLB should load');
 assert.equal(appearance.stats.helicopterComponents,10);assert.ok(appearance.rotorMoves);
 assert.ok(appearance.stats.helicopterVisible&&appearance.bodyPixels>400&&appearance.height===18,'The actual driving renderer must show the authored aircraft above the district');
 assert.ok(appearance.healthPixels>15,'The helicopter health bar must be readable from the driving camera');
 const themes=[];
 for(const [theme,dispatch,quality,width,height] of [
  ['noon','loose-change','medium',960,640],['dusk','express-distress','medium',960,640],['night','green-light','medium',960,640],
  ['night','green-light','low',960,640],['noon','loose-change','medium',390,844],
 ] as const){
  await page.setViewportSize({width,height});
  const evidence=await page.evaluate(async({dispatch,quality})=>{
   const f=(window as any).fixture;f.renderer.setDispatch(dispatch);f.renderer.setSettings({quality});f.renderer.resize();
   for(let i=0;i<12;i++){f.step(1/60);await new Promise(r=>requestAnimationFrame(r));}
   return{bodyPixels:f.helicopterPixels(),stats:f.renderer.getStats()};
  },{dispatch,quality});
  assert.equal(evidence.stats.environmentTheme,theme);assert.ok(evidence.bodyPixels>400,`${theme}/${quality}/${width}: aircraft silhouette must remain visible`);
  await page.screenshot({path:join(output,`${theme}-${quality}-${width}.png`)});themes.push({theme,quality,width,height,...evidence});
 }
 await page.setViewportSize({width:960,height:640});
 const crash=await page.evaluate(()=>{
  const f=(window as any).fixture;f.renderer.resize();f.renderer.setDispatch('loose-change');
  const state=f.frame.helicopter;state.phase='downed';state.health=0;state.startedAtTick=500;state.endsAtTick=590;
  f.frame.serverTick=545;f.step(.05);const falling=f.gameScene.getTransformNodeByName('black-chopper').position.y;
  f.frame.serverTick=590;f.step(0);const down=f.renderer.getStats();
  const fragments=f.gameScene.transformNodes.filter((n:any)=>n.metadata?.helicopterFragment),before=fragments.map((n:any)=>n.position.clone());
  for(let i=0;i<18;i++){f.frame.serverTick++;f.step(1/60);}
  return{falling,down,moved:fragments.filter((n:any,i:number)=>n.position.subtract(before[i]).length()>.5).length};
 });
 assert.ok(crash.falling>0&&crash.falling<18);assert.equal(crash.down.helicopterVisible,false);assert.equal(crash.down.helicopterDebrisBodies,10);assert.ok(crash.down.grenadeBlasts>0);assert.ok(crash.moved>=8);
 await page.screenshot({path:join(output,'physical-breakup.png')});
 await page.emulateMedia({reducedMotion:'reduce'});
 const reduced=await page.evaluate(()=>{const f=(window as any).fixture;f.step(0);return f.renderer.getStats().helicopterDebrisBodies;});assert.equal(reduced,0);
 await page.emulateMedia({reducedMotion:'no-preference'});
 const lifecycle=await page.evaluate(()=>{
  const f=(window as any).fixture,state=f.frame.helicopter;state.phase='attack';f.step(.05);const stale=f.renderer.getStats().helicopterVisible;
  const counts=()=>f.gameScene.getEngine().scenes.map((s:any)=>[s.meshes.length,s.materials.length,s.textures.length,s.transformNodes.length]);
  f.renderer.setGaragePreview('patrol');f.step(.05);f.renderer.setGaragePreview(null);f.step(.05);const before=counts();let peak=0,garageBodies=0;
  for(let i=0;i<10;i++){
   Object.assign(state,{entityId:'native-air-'+i,phase:'downed',startedAtTick:500,endsAtTick:590});f.frame.serverTick=590;f.step(0);peak=Math.max(peak,f.renderer.getStats().helicopterDebrisBodies);
   f.renderer.setGaragePreview('patrol');f.step(.05);garageBodies=Math.max(garageBodies,f.renderer.getStats().helicopterDebrisBodies);f.renderer.setGaragePreview(null);f.step(.05);
  }
  const after=counts();state.entityId='expiry-air';f.step(0);for(let i=0;i<200;i++)f.step(1/60);const expired=f.renderer.getStats().helicopterDebrisBodies;
  f.renderer.dispose();return{stale,before,after,peak,garageBodies,expired,disposedMeshes:f.gameScene.meshes.length,disposedNodes:f.gameScene.transformNodes.length};
 });
 assert.equal(lifecycle.stale,false);assert.deepEqual(lifecycle.before,lifecycle.after);assert.equal(lifecycle.peak,10);assert.equal(lifecycle.garageBodies,0);assert.equal(lifecycle.expired,0);assert.equal(lifecycle.disposedMeshes,0);assert.equal(lifecycle.disposedNodes,0);assert.deepEqual(errors,[]);
 const evidence={browser:browser.version(),appearance,themes,crash,reduced,lifecycle,errors};
 await writeFile(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();await server?.close();}
