/** Run the preview server first: pnpm exec tsx tools/assets/preview-server.ts */
import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('work',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors:string[]=[];page.on('pageerror',(e)=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5174/preview.html');
  await page.waitForFunction(()=>!!(window as any).artFixture?.stats().activeMeshes);
  await page.waitForTimeout(1500);
  const report=await page.evaluate(()=>{
    const fixture=(window as any).artFixture,renderer=fixture.renderer,frame=fixture.frame;
    const original=[...frame.vehicles];const before=renderer.getStats();
    for(let i=0;i<12;i++){
      frame.vehicles=[];renderer.render(frame,1/60);
      frame.vehicles=original;renderer.render(frame,1/60);
    }
    const after=renderer.getStats();
    const event={eventId:'dedupe-fixture',matchId:'fixture',serverTick:300,kind:'shot',payload:{shooterId:'hero',projectileId:'fixture-shot',sessionEpoch:'fixture',sourceCommandSequence:1,sourceShotOrdinal:1,origin:{x:4,z:-43,yaw:0}}};
    renderer.present([event]);const first=renderer.getStats().particles;
    renderer.present([event,event]);const repeated=renderer.getStats().particles;
    return{before,after,first,repeated};
  });
  assert.equal(report.before.totalMeshes,report.after.totalMeshes,'car remove/recreate leaked meshes');
  assert.equal(report.first,report.repeated,'duplicate event created extra particles');
  assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:'work/art-fixture-final.png',timeout:45000});
  await writeFile('work/art-report.json',JSON.stringify({browser:'Edge Chromium, headless',viewport:'1440x1000@1',map:'sunset-borough-1',quality:'high',...report,errors},null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
