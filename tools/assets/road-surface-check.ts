import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:5174/preview.html');await page.waitForFunction(()=>!!(window as any).artFixture?.stats().activeMeshes);
  const result=await page.evaluate(()=>[[-4,-106],[4,106],[-106,4],[106,-4]].map(([x,z])=>({x,z,material:(window as any).artFixture.sampleGroundAt(x,z)})));
  console.log(result);
  for(const p of result)assert.equal(p.material,'#4d6268false',`authored asphalt road at ${p.x},${p.z} must stay visible through outer grass/sidewalk dressing`);
}finally{await browser.close();}
