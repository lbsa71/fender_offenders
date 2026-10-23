import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const output='C:/Users/StefanAndersson/Documents/Codex/2026-10-22/if/outputs/suspect-objective';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors:string[]=[],warnings:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().includes('on an instanced mesh has no effect'))warnings.push(m.text());});await page.addInitScript('window.__name=(fn)=>fn');
 await page.goto('http://127.0.0.1:5184');await page.waitForFunction(()=>!!(window as any).fixture?.gameScene.getTransformNodeByName('body-hero'));
 const initial=await page.evaluate(()=>{
  const f=(window as any).fixture;f.pause();f.renderer.setSettings({reducedShake:true,reducedFlash:true,muted:true});f.frame.pursuit={state:'chasing',suspectId:'peer',progress:0,elapsedTicks:0};for(let i=0;i<80;i++)f.step();
  const issues:string[]=[],root=f.gameScene.getTransformNodeByName('wanted-objective-root'),point=f.renderer.getTargetIndicator?.();
  if(!root?.isEnabled())issues.push('persistent suspect world marker is missing');if(!point||point.offscreen)issues.push('onscreen suspect has no projected objective');
  if(root&&Math.hypot(root.position.x+f.frame.vehicles[1].pose.x,root.position.z-f.frame.vehicles[1].pose.z)>.001)issues.push('marker did not reflect targetX exactly once');
  return{issues,point};
 });console.log('initial',JSON.stringify(initial));assert.deepEqual(initial.issues,[]);
 // A DOM overlay makes the native projection visible without depending on app/UI ownership.
 await page.evaluate(()=>{const badge=document.createElement('div');badge.id='objective-proof';badge.style.cssText='position:fixed;z-index:100;color:#fff3b2;background:#38251e;border:2px solid #ffb43d;border-radius:12px;padding:10px 16px;font:900 16px system-ui;transform:translate(-50%,-50%);text-align:center;pointer-events:none;box-shadow:0 4px 15px #18282788';document.body.append(badge);(window as any).drawObjective=()=>{const p=(window as any).fixture.renderer.getTargetIndicator();badge.style.display=p?'block':'none';if(p){badge.style.left=`${p.x*100}%`;badge.style.top=`${p.y*100}%`;badge.innerHTML=`${p.offscreen?`<div style="transform:rotate(${p.angle}rad);font-size:26px;line-height:24px">↑</div>`:''}WANTED<br><small>${Math.round(p.distanceMeters)} m</small>`;}};});
 await page.evaluate(async()=>{const f=(window as any).fixture;for(let i=0;i<30;i++){f.step();await new Promise(r=>setTimeout(r,20));}(window as any).drawObjective();});await page.screenshot({path:output+'/onscreen.png'});
 const report:any[]=[];
 for(const [edge,x,z]of [['right',240,-40],['left',-240,-40],['top',4,240],['bottom',4,-300]] as const){
  const result=await page.evaluate(({x,z,edge})=>{const f=(window as any).fixture,v=f.frame.vehicles[1];v.pose={x,z,yaw:0};v.discontinuityId++;f.step();(window as any).drawObjective();const p=f.renderer.getTargetIndicator(),root=f.gameScene.getTransformNodeByName('wanted-objective-root');return{edge,p,root:{x:root.position.x,z:root.position.z}};},{x,z,edge});report.push(result);
  assert.equal(result.p.offscreen,true);assert.ok(result.p.x*1440>=83.99&&result.p.x*1440<=1356.01);assert.ok(result.p.y*900>=149.99&&result.p.y*900<=690.01);assert.equal(result.root.x,-x);assert.equal(result.root.z,z);
  if(edge==='left')assert.ok(result.p.x<.1);if(edge==='right')assert.ok(result.p.x>.9);if(edge==='top')assert.ok(result.p.y<.2);if(edge==='bottom')assert.ok(result.p.y>.7);
  await page.screenshot({path:output+'/'+edge+'.png'});
 }
 const lifecycle=await page.evaluate(()=>{
  const f=(window as any).fixture,issues:string[]=[],v=f.frame.vehicles[1],root=f.gameScene.getTransformNodeByName('wanted-objective-root');v.pose={x:-4,z:-30,yaw:0};v.status='wrecked';v.discontinuityId++;f.step();if(!f.renderer.getTargetIndicator()||!root.isEnabled())issues.push('wrecked suspect lost objective');
  const V=root.position.constructor,anchor=new V(-v.pose.x,5.6,v.pose.z),M=f.gameScene.getTransformMatrix().constructor;
  f.frame.cameraTarget={x:25,z:-18,yaw:0};f.step();const camera=f.gameScene.activeCamera,engine=f.gameScene.getEngine(),projected=V.Project(anchor,M.Identity(),f.gameScene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight())),p=f.renderer.getTargetIndicator();
  if(Math.hypot(p.x-projected.x/engine.getRenderWidth(),p.y-projected.y/engine.getRenderHeight())>.00001)issues.push('projection does not use current smoothed camera');
  f.frame.pursuit.state='complete';f.step();if(f.renderer.getTargetIndicator()||root.isEnabled())issues.push('complete objective remained');
  f.frame.pursuit.state='chasing';f.frame.pursuit.suspectId='missing';f.step();if(f.renderer.getTargetIndicator()||root.isEnabled())issues.push('missing target remained');
  f.frame.pursuit.suspectId='peer';f.step();f.renderer.setGaragePreview('patrol');if(f.renderer.getTargetIndicator()||root.isEnabled())issues.push('garage retained objective');f.step();f.renderer.setGaragePreview(null);f.step();if(!f.renderer.getTargetIndicator())issues.push('objective did not resume after garage');
  return{issues};
 });assert.deepEqual(lifecycle.issues,[]);
 await page.setViewportSize({width:960,height:640});const resized=await page.evaluate(()=>{const f=(window as any).fixture;f.renderer.resize();f.frame.vehicles[1].pose.x=240;f.step();(window as any).drawObjective();return f.renderer.getTargetIndicator();});assert.ok(resized.x*960<=876.01);assert.ok(resized.y*640<=430.01);await page.screenshot({path:output+'/resized.png'});
 await page.evaluate(()=>{const f=(window as any).fixture;f.renderer.dispose();if(f.renderer.getTargetIndicator()!==null)throw Error('disposed getter retained objective');});
 console.log(JSON.stringify({report,lifecycle,resized,errors,warnings}));assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
}finally{await browser.close();}
