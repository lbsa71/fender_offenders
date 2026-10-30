import { dispatchFixture, expect, test } from './fixtures';

test('dispatch five presents the real replicated helicopter and its air-dropped bombs',async({page},info)=>{
 test.setTimeout(60000);
 const captureLive=async()=>{
  // Test-only stress knob: artifact latency must not consume the firing window.
  const delay=Number(process.env.FENDER_E2E_CAPTURE_DELAY_MS??0);
  if(delay>0)await page.waitForTimeout(delay);
  await page.screenshot({path:info.outputPath('live-black-chopper.png')});
 };
 await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await dispatchFixture(page,4);
 await page.getByLabel('Your vehicle',{exact:true}).selectOption('patrol');
 await expect(page.getByRole('region',{name:'Campaign dispatch briefing'})).toContainText('black chopper');
 await page.getByRole('button',{name:'START DISPATCH'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.helicopterVisible),{timeout:20000}).toBe(true);
 const helper=await page.evaluate(()=>(window as any).__FENDER_DEBUG__.snapshot.helicopter);
 expect(helper).toMatchObject({dispatchIndex:4,health:60});
 await page.waitForFunction(id=>(window as any).__FENDER_DEBUG__?.events.some((event:any)=>event.kind==='grenade-thrown'&&event.payload.grenade.ownerEntityId===id),helper.entityId,{timeout:10000});
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.helicopterHealth)).toBeGreaterThan(0);
 const began=await page.evaluate(()=>{const s=(window as any).__FENDER_DEBUG__.snapshot;return{tick:s.serverTick,outcomes:s.campaign.outcomes};});
 await page.keyboard.down('Space');
 // Artifact capture cannot delay real input through a time-limited attack.
 try{await captureLive();await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__.snapshot.helicopter?.phase),{timeout:12000}).toBe('downed');}finally{await page.keyboard.up('Space');}
 const down=await page.evaluate(()=>{const s=(window as any).__FENDER_DEBUG__.snapshot;return{tick:s.helicopter.startedAtTick,health:s.local.vehicle.health,phase:s.phase,outcomes:s.campaign.outcomes};});
 expect(down.tick-began.tick,'Normal forward guns should finish the first attack, without waiting for another pass').toBeLessThan(540);
 expect(down.health).toBeGreaterThan(0);expect(down.phase).toBe('playing');expect(down.outcomes).toEqual(began.outcomes);
 await page.screenshot({path:info.outputPath('player-shoots-down-chopper.png')});
});
