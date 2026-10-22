import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto('http://127.0.0.1:5174/preview.html');await page.waitForFunction(()=>!!(window as any).artFixture?.stats().activeMeshes);
  const result=await page.evaluate(()=>{
    const f=(window as any).artFixture,hero=f.frame.vehicles.find((v:any)=>v.entityId==='hero');
    hero.pose.yaw=0;f.renderer.render(f.frame,0);const straight=f.projectVehicle('hero');
    hero.pose.yaw=.6;f.renderer.render(f.frame,0);const right=f.projectVehicle('hero');
    return{straight,right,straightDx:straight.nose.x-straight.center.x,rightDx:right.nose.x-right.center.x};
  });
  console.log(JSON.stringify(result,null,2));
  assert.ok(result.straight.nose.y<result.straight.center.y,'rear camera must show +Z forward toward screen top');
  assert.ok(result.rightDx>result.straightDx+10,'positive right steering must turn vehicle nose toward screen right');
}finally{await browser.close();}
