import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {CAMPAIGN_DISPATCHES} from '@fender/contracts';

const output=resolve(process.argv[2]??'work/pocket-native');await mkdir(output,{recursive:true});
const server=await createServer({configFile:false,root:resolve('packages/renderer/scenarios'),cacheDir:resolve('work/pocket-native-cache'),server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd()]}}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--force_high_performance_gpu']});
const errors:string[]=[],observations:unknown[]=[];
try{
  const page=await browser.newPage({viewport:{width:960,height:640}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(/GL_INVALID|uniform buffer.*too small|Program object expected|too many errors|Error compiling effect/i.test(message.text()))errors.push(message.text());});
  await page.addInitScript('window.__name=fn=>fn');await page.goto(server.resolvedUrls!.local[0]!);await page.waitForFunction(()=>Boolean((window as any).fixture));
  await page.evaluate(dispatch=>{
    const f=(window as any).fixture;f.pause();f.renderer.setSettings({quality:'medium',reducedFlash:true,reducedShake:true});f.renderer.setDispatch(dispatch);
    f.frame.props=structuredClone(f.authoredProps);f.frame.serverTick=1000;
    for(const car of f.frame.vehicles){car.bodyAssetId='bubble';car.health=70;car.maxHealth=70;}
    f.frame.vehicles[0].pose={x:4,z:-43,yaw:0};f.frame.vehicles[1].pose={x:4,z:60,yaw:0};f.frame.cameraTarget={x:4,z:-40,yaw:0};f.step(0);
  },CAMPAIGN_DISPATCHES[2]!.id);
  const geometry=async(id:string)=>page.evaluate(id=>{
    const f=(window as any).fixture;f.step(1/60);const root=f.gameScene.getTransformNodeByName(`vehicle-${id}`);
    const parts=root?.getChildMeshes().filter((mesh:any)=>mesh.sourceMesh&&mesh.isVisible&&!mesh.name.includes('charred'))??[];
    return {triangles:parts.reduce((sum:number,mesh:any)=>sum+mesh.sourceMesh.getTotalIndices()/3,0),parts:parts.length};
  },id);
  await expect.poll(async()=> (await geometry('hero')).triangles,{timeout:15000}).toBe(7392);
  observations.push({near:await geometry('hero')});await page.screenshot({path:resolve(output,'noon-driving.png')});
  await expect.poll(async()=> (await geometry('peer')).triangles,{timeout:10000}).toBe(2620);
  observations.push({far:await geometry('peer')});
  await page.evaluate(()=>{const f=(window as any).fixture;f.frame.vehicles[1].pose.z=45;f.step(0);});
  expect((await geometry('peer')).triangles).toBe(2620);
  await page.evaluate(()=>{const f=(window as any).fixture;f.frame.vehicles[1].pose.z=25;f.step(0);});
  expect((await geometry('peer')).triangles).toBe(7392);
  await page.evaluate(()=>{const f=(window as any).fixture;f.renderer.setDispatch('loose-change');f.renderer.setGaragePreview('bubble');f.step(0);});
  await expect.poll(()=>page.evaluate(()=>{const f=(window as any).fixture;f.step(0);return f.renderer.getStats().garageModelStatus;})).toBe('ready');
  expect(await page.evaluate(()=>(window as any).fixture.renderer.getStats().garageArmed)).toBe(false);
  await page.screenshot({path:resolve(output,'briefing-unarmed.png')});
  await page.evaluate(dispatch=>{const f=(window as any).fixture;f.renderer.setDispatch(dispatch);f.renderer.setGaragePreview('bubble');f.step(0);},CAMPAIGN_DISPATCHES[2]!.id);
  expect(await page.evaluate(()=>(window as any).fixture.renderer.getStats().garageArmed)).toBe(true);
  await page.screenshot({path:resolve(output,'briefing-armed.png')});
  const visible=await page.evaluate(()=>{
    const f=(window as any).fixture;f.renderer.setGaragePreview(null);f.renderer.setSettings({quality:'low'});f.step(0);f.gameScene.shadowsEnabled=false;
    const root=f.gameScene.getTransformNodeByName('vehicle-hero'),parts=root.getChildMeshes().filter((mesh:any)=>mesh.sourceMesh&&mesh.isVisible&&!mesh.name.includes('charred'));
    const gl=document.querySelector('canvas')!.getContext('webgl2')!;
    const read=()=>{const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
    f.gameScene.render();const shown=read();for(const mesh of parts)mesh.isVisible=false;f.gameScene.render();const hidden=read();for(const mesh of parts)mesh.isVisible=true;
    let pixels=0;for(let i=0;i<shown.length;i+=4)if(Math.abs(shown[i]!-hidden[i]!)+Math.abs(shown[i+1]!-hidden[i+1]!)+Math.abs(shown[i+2]!-hidden[i+2]!)>35)pixels++;
    return{pixels,gl:gl.getError()};
  });
  expect(visible.pixels).toBeGreaterThan(100);expect(visible.gl).toBe(0);observations.push({visible});
  await page.evaluate(()=>{const f=(window as any).fixture;f.renderer.setSettings({quality:'medium'});f.renderer.setDispatch('green-light');for(let i=0;i<20;i++)f.step(1/60);});
  await page.screenshot({path:resolve(output,'night-driving.png')});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.renderer.getStats().wreckPhysicsReady)).toBe(true);
  await page.emulateMedia({reducedMotion:'no-preference'});
  const breakup=await page.evaluate(()=>{
    const f=(window as any).fixture,hero=f.frame.vehicles[0];f.renderer.setSettings({reducedShake:false});f.frame.vehicles=[hero];
    hero.status='active';hero.health=70;hero.velocity={x:0,z:0,yawRate:0};hero.discontinuityId++;f.step(1/60);
    f.renderer.present([{kind:'wreck',matchId:'pocket-proof',eventId:'pocket-wreck',serverTick:1000,payload:{vehicleId:hero.entityId,creditedPlayerId:null,position:{...hero.pose},bodyAssetId:'bubble',discontinuityId:hero.discontinuityId}}]);
    hero.status='wrecked';hero.health=0;
    const tires=f.gameScene.transformNodes.filter((node:any)=>node.metadata?.wreckRole==='wheel'&&node.isEnabled()),start=tires.map((node:any)=>node.position.clone());
    f.step(1/60);const kicks=tires.map((node:any,index:number)=>({x:(node.position.x-start[index].x)*60,y:(node.position.y-start[index].y)*60,z:(node.position.z-start[index].z)*60}));
    const stats=f.renderer.getStats();for(let i=0;i<29;i++)f.step(1/60);return{tires:tires.length,kicks,bodies:stats.wreckBodies};
  });
  expect(breakup.bodies).toBe(19);expect(breakup.tires).toBe(4);expect(breakup.kicks.every((kick:{y:number})=>kick.y>0)).toBe(true);
  expect(new Set(breakup.kicks.map((kick:{x:number;z:number})=>Math.hypot(kick.x,kick.z).toFixed(2))).size).toBe(4);
  observations.push({breakup});await page.screenshot({path:resolve(output,'physical-breakup.png')});
  const cleanup=await page.evaluate(()=>{const f=(window as any).fixture;for(let i=0;i<180;i++)f.step(1/60);const stats=f.renderer.getStats();f.renderer.dispose();return{bodies:stats.wreckBodies,wheels:stats.wreckWheels,disposed:f.gameScene.isDisposed,meshes:f.gameScene.meshes.length};});
  expect(cleanup).toEqual({bodies:0,wheels:0,disposed:true,meshes:0});observations.push({cleanup});
  expect(errors).toEqual([]);
}finally{
  await writeFile(resolve(output,'evidence.json'),JSON.stringify({observations,errors},null,2));await browser.close();await server.close();
}
