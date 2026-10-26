import { dispatchFixture, expect, test } from './fixtures';

test('dispatch five presents the real replicated helicopter and its air-dropped bombs',async({page},info)=>{
 await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await dispatchFixture(page,4);
 await expect(page.getByRole('region',{name:'Campaign dispatch briefing'})).toContainText('black chopper');
 await page.getByRole('button',{name:'START DISPATCH'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.helicopterVisible),{timeout:20000}).toBe(true);
 const helper=await page.evaluate(()=>(window as any).__FENDER_DEBUG__.snapshot.helicopter);
 expect(helper).toMatchObject({dispatchIndex:4,health:60});
 await page.waitForFunction(id=>(window as any).__FENDER_DEBUG__?.events.some((event:any)=>event.kind==='grenade-thrown'&&event.payload.grenade.ownerEntityId===id),helper.entityId,{timeout:10000});
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.helicopterHealth)).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('live-black-chopper.png')});
});
