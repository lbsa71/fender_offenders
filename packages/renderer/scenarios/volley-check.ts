import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors:string[]=[],warnings:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().includes('on an instanced mesh has no effect'))warnings.push(m.text());});await page.addInitScript('window.__name=(fn)=>fn');
 await page.goto('http://127.0.0.1:5184');await page.waitForFunction(()=>!!(window as any).fixture?.gameScene.getTransformNodeByName('body-hero'));
 const report=await page.evaluate(()=>{
  const f=(window as any).fixture;f.pause();const h=f.frame.vehicles[0],issues:string[]=[];h.protectedUntilTick=0;h.velocity={x:0,z:30,yawRate:1.2};for(let i=0;i<45;i++)f.step();f.audioLog.length=0;
  const origins=[{x:h.pose.x-.63,z:h.pose.z+2.45,yaw:.03},{x:h.pose.x+.63,z:h.pose.z+2.45,yaw:-.02}];
  const shot={kind:'shot',eventId:'volley-first',matchId:'volley-proof',serverTick:600,payload:{shooterId:'hero',projectileId:'left',projectileIds:['left','right'],origin:origins[0],origins,volleyId:'one-volley',sessionEpoch:'fixture',sourceCommandSequence:1,sourceShotOrdinal:0}};
  f.renderer.present([shot]);h.pose.z+=6;f.frame.cameraTarget={...h.pose};
  f.frame.projectiles=origins.map((o:any,i:number)=>({entityId:i?'right':'left',ownerEntityId:'hero',pose:{x:h.pose.x+(i?.63:-.63),z:h.pose.z+2.45,yaw:0},velocity:{x:0,z:70,yawRate:0},bornTick:600,expiresTick:720,sourceCommandSequence:1,sourceShotOrdinal:0,volleyId:'one-volley',barrelIndex:i,damage:5,presentationAgeSeconds:0}));
  const authority=JSON.stringify(f.frame.projectiles);f.step(1/60);
  const visible=(prefix:string)=>f.gameScene.meshes.filter((m:any)=>m.name.startsWith(prefix)&&m.isVisible),muzzles=visible('pooled-muzzle-core-'),body=f.gameScene.getTransformNodeByName('body-hero'),Vector=body.position.constructor;
  const expected=[-1,1].map(side=>Vector.TransformCoordinates(new Vector(side*.63,1.17,2.45),body.getWorldMatrix()));
  if(muzzles.length!==2)issues.push('volley did not flash exactly two actual barrels');for(let i=0;i<2;i++){const flash=muzzles[i],tip=expected[i];if(!flash||Math.hypot(flash.position.x-tip.x,flash.position.y-tip.y,flash.position.z-tip.z)>.002)issues.push(`barrel${i} flash did not follow current moving/deformed gun tip`);}
  const cores=visible('pooled-tracer-core-'),trails=visible('pooled-tracer-trail-');if(cores.length!==2||trails.length!==2)issues.push('two actual projectiles did not produce exactly two tracer pairs');
  for(const core of cores)if(core.position.z-core.scaling.z*1.7/2<h.pose.z+2.45-.0001)issues.push('fresh core begins behind current physical muzzle');for(const trail of trails)if(trail.position.z-trail.scaling.z/2<h.pose.z+2.45-.0001)issues.push('fresh trail begins behind current physical muzzle');
  if(JSON.stringify(f.frame.projectiles)!==authority)issues.push('renderer mutated supplied projectile poses');
  const firstMuzzles=muzzles.map((p:any)=>({x:p.position.x,y:p.position.y,z:p.position.z}));h.pose.z+=.5;f.step(1/60);const movingTips=[-1,1].map(side=>Vector.TransformCoordinates(new Vector(side*.63,1.17,2.45),body.getWorldMatrix()));for(let i=0;i<2;i++)if(Math.hypot(muzzles[i].position.x-movingTips[i].x,muzzles[i].position.y-movingTips[i].y,muzzles[i].position.z-movingTips[i].z)>.002)issues.push('active muzzle flash detached from moving body during its lifetime');
  f.renderer.present([{...shot,eventId:'same-volley-other-envelope'}]);f.step(1/60);if(f.audioLog.filter((x:any)=>x.kind==='shot').length!==1)issues.push('volley replay produced a second shot cue');if(visible('pooled-muzzle-core-').length!==2)issues.push('volley replay produced four muzzle flashes');
  const fallback=[{x:10,z:-25,yaw:.1},{x:11.26,z:-25,yaw:-.1}];f.renderer.present([{...shot,eventId:'unknown-shooter',matchId:'fallback-proof',payload:{...shot.payload,shooterId:'not-drawn',origin:fallback[0],origins:fallback,volleyId:'fallback'}}]);f.step(.01);const fallbackCores=visible('pooled-muzzle-core-');for(let i=0;i<2;i++)if(!fallbackCores[i]||Math.hypot(fallbackCores[i].position.x+fallback[i].x,fallbackCores[i].position.z-fallback[i].z)>.001)issues.push('authority muzzle fallback added a second lateral offset');
  return{issues,expected:expected.map(p=>({x:p.x,y:p.y,z:p.z})),firstMuzzles,stats:f.renderer.getStats()};
 });console.log(JSON.stringify(report));assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);assert.deepEqual(report.issues,[]);
}finally{await browser.close();}
