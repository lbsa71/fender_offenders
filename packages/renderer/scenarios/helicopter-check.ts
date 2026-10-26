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
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|compile|uniform/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript('window.__name=(fn)=>fn');await page.goto(process.env.RENDER_SCENARIO_URL??'http://127.0.0.1:5285/');await page.waitForFunction(()=>Boolean((window as any).fixture));
 const appearance=await page.evaluate(async()=>{
  const f=(window as any).fixture;f.pause();f.renderer.setSettings({quality:'medium',reducedFlash:true});f.renderer.setDispatch('stamp-duty');f.frame.props=structuredClone(f.authoredProps);f.frame.serverTick=500;
  f.frame.cameraTarget={x:4,z:-43,yaw:0};Object.assign(f.frame.vehicles[0].pose,f.frame.cameraTarget);
  f.frame.helicopter={entityId:'native-air',dispatchIndex:4,phase:'attack',health:60,from:{x:4,z:-51},to:{x:4,z:-51},yaw:Math.PI/2,startedAtTick:400,endsAtTick:1000};
  for(let i=0;i<35;i++){f.step(.05);await new Promise(r=>requestAnimationFrame(r));}await f.gameScene.whenReadyAsync();f.step(0);
  const gl=document.querySelector('canvas')!.getContext('webgl2')!,sample=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const root=f.gameScene.getTransformNodeByName('black-chopper'),marker=f.gameScene.getMeshByName('chopper-ground-marker'),shown=sample();
  const health=f.gameScene.getMeshByName('chopper-health');health.isVisible=false;f.gameScene.render();const noHealth=sample();let healthPixels=0;for(let i=0;i<shown.length;i+=4)if(shown[i+1]!>shown[i]!+20&&Math.abs(shown[i+1]!-noHealth[i+1]!)>25)healthPixels++;health.isVisible=true;
  root?.setEnabled(false);if(marker)marker.isVisible=false;f.gameScene.render();const hidden=sample();
  let pixels=0;for(let i=0;i<shown.length;i+=4)if(Math.abs(shown[i]!-hidden[i]!)+Math.abs(shown[i+1]!-hidden[i+1]!)+Math.abs(shown[i+2]!-hidden[i+2]!)>35)pixels++;
  f.step(0);return{pixels,healthPixels,visible:f.renderer.getStats().helicopterVisible??false,height:root?.position.y??0};
 });
 await page.screenshot({path:join(output,'black-chopper-pass.png')});await writeFile(join(output,'appearance.json'),JSON.stringify(appearance,null,2));console.log(JSON.stringify(appearance));
 assert.ok(appearance.visible&&appearance.pixels>400&&appearance.height===18,'The actual driving renderer must show the black helicopter above the district');
 assert.ok(appearance.healthPixels>15,'The helicopter health bar must be readable from the driving camera');
 const lifecycle=await page.evaluate(()=>{
  const f=(window as any).fixture,state=f.frame.helicopter;state.phase='downed';state.health=0;state.startedAtTick=500;state.endsAtTick=590;f.frame.serverTick=545;f.step(.05);const falling=f.gameScene.getTransformNodeByName('black-chopper').position.y;
  f.frame.serverTick=590;f.step(.05);const down=f.renderer.getStats();state.phase='attack';f.frame.serverTick=591;f.step(.05);const stale=f.renderer.getStats().helicopterVisible;
  const counts=()=>f.gameScene.getEngine().scenes.map((s:any)=>[s.meshes.length,s.materials.length,s.textures.length]);
  f.renderer.setGaragePreview('patrol');f.step(.05);f.renderer.setGaragePreview(null);f.step(.05);const before=counts();
  for(let i=0;i<10;i++){state.entityId='native-air-'+i;f.step(.05);f.renderer.setGaragePreview('patrol');f.step(.05);f.renderer.setGaragePreview(null);f.step(.05);}
  return{falling,down:down.helicopterVisible,crashBlasts:down.grenadeBlasts,stale,before,after:counts()};
 });
 assert.ok(lifecycle.falling>0&&lifecycle.falling<18);assert.equal(lifecycle.down,false);assert.equal(lifecycle.stale,false);assert.ok(lifecycle.crashBlasts>0);assert.deepEqual(lifecycle.before,lifecycle.after);assert.deepEqual(errors,[]);
 await writeFile(join(output,'lifecycle.json'),JSON.stringify({lifecycle,errors},null,2));
}finally{await browser.close();await server?.close();}
