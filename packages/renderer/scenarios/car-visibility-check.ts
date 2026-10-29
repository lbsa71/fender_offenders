import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const output=resolve(process.argv[2]??'work/car-visibility');await mkdir(output,{recursive:true});
const server=await createServer({configFile:false,root:resolve('packages/renderer/scenarios'),cacheDir:resolve('work/car-visibility-cache'),server:{host:'127.0.0.1',port:5287,strictPort:true,fs:{allow:[process.cwd()]}}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--force_high_performance_gpu']});
try{
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/GL_INVALID|uniform buffer.*too small|Program object expected|too many errors|Error compiling effect/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript('window.__name=fn=>fn');await page.goto('http://127.0.0.1:5287/');await page.waitForFunction(()=>Boolean((window as any).fixture));
 const evidence=await page.evaluate(async()=>{
  const f=(window as any).fixture;f.pause();f.frame.props=structuredClone(f.authoredProps);f.frame.serverTick=1000;
  const gl=document.querySelector('canvas')!.getContext('webgl2')!,codes:unknown[]=[];let frames=0;
  const step=async()=>{f.step(1/60);frames++;for(let i=0;i<10;i++){const code=gl.getError();if(code===gl.NO_ERROR)break;codes.push({frame:frames,body:f.frame.vehicles[0].bodyAssetId,code,lights:f.renderer.getStats().headlightLights,theme:f.renderer.getStats().environmentTheme});}await new Promise(r=>requestAnimationFrame(r));};
  for(const body of ['db5','gangster','patrol']){
   f.frame.vehicles[0].bodyAssetId=body;f.renderer.setGaragePreview(body);for(let i=0;i<24;i++)await step();
   f.renderer.setGaragePreview(null);
   for(let i=0;i<90;i++){
    f.renderer.setDispatch(['loose-change','stamp-duty','green-light','paper-trail'][Math.floor(i/5)%4]);
    f.frame.vehicles[1].status=i%6<3?'active':'respawning';f.renderer.setSettings({quality:i%8<4?'medium':'low'});await step();
   }
  }
  // Regression route: first oil dispatch, warning -> live slick -> expiry,
  // both scenes, all body/material families, and every graphics preset.
  let oilFrames=0;
  for(const body of ['patrol','interceptor','roadster','army','ambulance','fire-chief','db5','gangster']){
   f.frame.vehicles[0].bodyAssetId=body;f.frame.vehicles[1].bodyAssetId='fire-chief';f.frame.vehicles[1].status='active';
   f.renderer.setDispatch('false-alarm');f.renderer.setGaragePreview(body);for(let i=0;i<12;i++)await step();f.renderer.setGaragePreview(null);
   for(let i=0;i<90;i++){
    f.frame.serverTick=1100+i;f.frame.vehicles[0].pose.z=-43+i*.12;f.frame.cameraTarget.z=f.frame.vehicles[0].pose.z;
    f.frame.gadgets=Array.from({length:8},(_,j)=>({entityId:`oil-${j}`,ownerEntityId:j%2?'hero':'peer',kind:'oil',pose:{x:j%2?4:-4,z:-43+j*2,yaw:0},bornTick:1100,activeAtTick:1120,expiresTick:1170}));
    f.renderer.setSettings({quality:['low','medium','high'][Math.floor(i/30)]});await step();if(f.renderer.getStats().oilSlicks>0)oilFrames++;
   }
  }
  f.frame.gadgets=[];f.frame.vehicles[0].pose.z=-43;f.frame.cameraTarget.z=-40;
  f.renderer.setDispatch('stamp-duty');f.frame.vehicles[0].bodyAssetId='gangster';f.frame.vehicles[1].status='active';
  for(let i=0;i<40;i++)await step();
  // Count actual coachwork pixels without accepting its still-visible shadow/marker.
  const visibility=[];f.renderer.setSettings({quality:'low'});f.gameScene.shadowsEnabled=false;
  const sample=()=>{const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
  for(const body of ['db5','gangster','patrol']){
   f.frame.vehicles[0].bodyAssetId=body;for(let i=0;i<12;i++)await step();
   const root=f.gameScene.getTransformNodeByName('vehicle-hero');
   const parts=root.getChildMeshes().filter((m:any)=>m.sourceMesh&&!m.name.includes('charred'));
   f.gameScene.render();const shown=sample();for(const part of parts)part.isVisible=false;f.gameScene.render();const hidden=sample();
   let pixels=0;for(let i=0;i<shown.length;i+=4)if(Math.abs(shown[i]-hidden[i])+Math.abs(shown[i+1]-hidden[i+1])+Math.abs(shown[i+2]-hidden[i+2])>35)pixels++;
   visibility.push({body,pixels});await step();
  }
  return{frames,oilFrames,codes,visibility,stats:f.renderer.getStats()};
 });
 await page.screenshot({path:resolve(output,'car.png')});await writeFile(resolve(output,'evidence.json'),JSON.stringify({evidence,errors},null,2));
 assert.deepEqual(errors,[],'scene/light/model transitions must not generate WebGL errors');assert.deepEqual(evidence.codes,[],'every rendered frame must have a clean WebGL context');
 assert.ok(evidence.oilFrames>=8*60,'all eight bodies must render through actual oil warning and active phases');
 for(const car of evidence.visibility)assert.ok(car.pixels>100,`${car.body} coachwork must render, independently of its shadow/marker: ${car.pixels} pixels`);
 console.log(JSON.stringify(evidence));
}finally{await browser.close();await server.close();}
