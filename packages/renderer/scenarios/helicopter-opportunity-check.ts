import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import type {AddressInfo} from 'node:net';
import assert from 'node:assert/strict';

const output=resolve(process.argv[2]??'work/helicopter-opportunities');await mkdir(output,{recursive:true});
const server=process.env.RENDER_SCENARIO_URL?null:await createServer({configFile:false,root:resolve('packages/renderer/scenarios'),server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd()]}}});
await server?.listen();
const browser=await chromium.launch(existsSync(chromium.executablePath())?{}:{executablePath:process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
try{
 const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript('window.__name=(fn)=>fn');
 await page.goto(process.env.RENDER_SCENARIO_URL??`http://127.0.0.1:${(server!.httpServer!.address() as AddressInfo).port}/`);
 await page.waitForFunction(()=>(window as any).fixture?.renderer.getStats().helicopterModelStatus==='ready');
 await page.evaluate(()=>{const f=(window as any).fixture;f.pause();f.frame.props=structuredClone(f.authoredProps);f.frame.vehicles=f.frame.vehicles.slice(0,1);f.renderer.setDispatch('stamp-duty');f.renderer.setSettings({muted:true,quality:'low',reducedFlash:true});});
 const reports=[];
 for(const [name,width,height,heading,distance] of [
  ['north',960,640,0,.75],['east',960,640,Math.PI/2,.75],['south',960,640,Math.PI,.75],['west',960,640,-Math.PI/2,.75],
  ['portrait',390,844,0,.75],['wide-camera',960,640,0,1.6],
 ] as const){
  await page.setViewportSize({width,height});
  const report=await page.evaluate(async({mission,contracts,heading,distance,name})=>{
   const {newHelicopter,stepHelicopter}=await import(mission),{helicopterPoseAt}=await import(contracts);
   const f=(window as any).fixture,s=f.gameScene,officer=f.frame.vehicles[0];f.renderer.resize();f.renderer.setSettings({cameraDistance:distance});
   officer.discontinuityId++;officer.pose={x:-Math.sin(heading)*60,z:-Math.cos(heading)*60,yaw:heading};officer.velocity={x:Math.sin(heading)*12,z:Math.cos(heading)*12,yawRate:0};officer.protectedUntilTick=0;
   f.frame.cameraTarget=officer.pose;f.frame.helicopter=undefined;
   for(let i=0;i<20;i++){f.step(.1);await new Promise(requestAnimationFrame);}await s.whenReadyAsync();
   const air=newHelicopter(4,0,`framing-${name}`)!;air.state.endsAtTick=0;let streak=0,longest=0,body:any=null,marker:any=null;
   const project=(p:any)=>{const m=s.getTransformMatrix().m,x=p.x*m[0]+p.y*m[4]+p.z*m[8]+m[12],y=p.x*m[1]+p.y*m[5]+p.z*m[9]+m[13],w=p.x*m[3]+p.y*m[7]+p.z*m[11]+m[15];return{x:x/w*.5+.5,y:.5-y/w*.5,front:w>0};};
   const inside=(p:any)=>p.front&&p.x>=.04&&p.x<=.96&&p.y>=.04&&p.y<=.96;
   for(let tick=0;tick<1100;tick++){
    if(tick){officer.pose.x+=officer.velocity.x/60;officer.pose.z+=officer.velocity.z/60;}
    stepHelicopter(air,[officer],tick,{minX:-200,maxX:200,minZ:-200,maxZ:200});
    if(tick%6)continue;
    f.frame.serverTick=tick;f.frame.helicopter=air.state;f.frame.cameraTarget=officer.pose;f.step(.1);await new Promise(requestAnimationFrame);
    const pose=helicopterPoseAt(air.state,tick),dx=pose.x-officer.pose.x,dz=pose.z-officer.pose.z;
    const ahead=dx*Math.sin(heading)+dz*Math.cos(heading),side=Math.abs(dx*Math.cos(heading)-dz*Math.sin(heading));
    body=project(s.getTransformNodeByName('black-chopper').position);marker=project(s.getMeshByName('chopper-ground-marker').position);
    const possible=air.state.phase==='attack'&&ahead>=5&&ahead<=30&&side<=2.5&&inside(body)&&inside(marker);
    streak=possible?streak+6:0;longest=Math.max(longest,streak);
    if(streak>=120||air.state.phase==='depart')break;
   }
   return{name,heading,distance,seconds:longest/60,body,marker,stats:f.renderer.getStats()};
  },{mission:'/@fs/'+resolve('packages/sim/src/missions/helicopter.ts').replaceAll('\\','/'),contracts:'/@fs/'+resolve('packages/contracts/src/index.ts').replaceAll('\\','/'),heading,distance,name});
  reports.push(report);await page.screenshot({path:join(output,`${name}.png`)});
  await writeFile(join(output,'evidence.json'),JSON.stringify({reports,errors},null,2));
  assert.ok(report.seconds>=2,`${name}: the aircraft and its shootable ground marker must share a two-second window in the actual camera (${report.seconds}s)`);
 }
 const impact=await page.evaluate(async contracts=>{
  const {helicopterPoseAt}=await import(contracts),f=(window as any).fixture,state=f.frame.helicopter;state.fromHeight=state.toHeight=8;f.step(0);
  f.renderer.present([{kind:'hit',matchId:'low-pass-hit',eventId:'height-proof',serverTick:f.frame.serverTick,payload:{projectileId:'hit-proof',targetId:state.entityId,damage:5,position:helicopterPoseAt(state,f.frame.serverTick)}}]);f.step(.001);
  return f.gameScene.meshes.filter((m:any)=>m.name.startsWith('pooled-impact-ring-')&&m.isVisible).map((m:any)=>m.position.y);
 },'/@fs/'+resolve('packages/contracts/src/index.ts').replaceAll('\\','/'));
 assert.ok(impact.length>0);assert.ok(impact.every((y:number)=>Math.abs(y-8)<.1),`Hit feedback must stay on the low aircraft, got ${impact}`);
 await writeFile(join(output,'evidence.json'),JSON.stringify({reports,impactHeights:impact,errors},null,2));
 assert.deepEqual(errors,[]);console.log(JSON.stringify(reports.map(({name,seconds,body,marker})=>({name,seconds,body,marker}))));
}finally{await browser.close();await server?.close();}
