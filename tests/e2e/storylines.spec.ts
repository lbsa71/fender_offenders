import {STORYLINES,getCampaignTarget,getVehicleProfile} from '@fender/contracts';
import {dispatchFixture,expect,test} from './fixtures';
const fixtureUrl=`/@fs/${process.cwd().replaceAll('\\','/')}/packages/ui/dev/campaign.html`;

test('shows all fifty case-specific suspects and short stories without adding a campaign dashboard',async({page},info)=>{
 await page.goto(fixtureUrl);await page.getByRole('button',{name:'HIT THE STREETS'}).click();
 for(const story of STORYLINES)for(const [stage,dispatch]of story.dispatches.entries()){
  await page.evaluate(({campaignId,stage})=>(window as any).campaignFixture.set({campaignId,stage}),{campaignId:story.id,stage});
  const target=getCampaignTarget(dispatch.targetId),briefing=page.getByRole('region',{name:'Campaign dispatch briefing'});
  await expect(briefing.locator('[data-campaign-series]')).toHaveText(story.title);
  await expect(briefing.locator('[data-campaign-name]')).toHaveText(target.name);
  await expect(briefing.locator('[data-campaign-briefing]')).toHaveText(dispatch.briefing.replace(' Arrest him or wreck the getaway car.',''));
  await expect(page.locator('[data-text="suspect-vehicle-name"]')).toHaveText(getVehicleProfile(target.vehicleBodyId).name);
  await expect(briefing.locator('.fo-campaign-portrait')).toHaveAttribute('aria-label',`${target.name}, “${target.alias}”, ${target.role}`);
  await expect(page.locator('.fo-campaign-tracker,.fo-campaign-casefile,.fo-garage-stats')).toHaveCount(0);
  if(stage===0){await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'START DISPATCH'})).toBeInViewport();await page.screenshot({path:info.outputPath(`${story.id}-phone.png`),animations:'disabled'});await page.setViewportSize({width:960,height:640});}
 }
});

test('shows only the current case ending and offers another case without a new selection screen',async({page})=>{
 await page.goto(fixtureUrl);await page.getByRole('button',{name:'HIT THE STREETS'}).click();
 for(const story of STORYLINES){
  await page.evaluate(campaignId=>(window as any).campaignFixture.set({campaignId,stage:9,phase:'results',complete:true,outcomes:Array.from({length:10},(_,dispatchIndex)=>({dispatchIndex,outcome:'arrested',playerId:'you',callsign:'Case closer',elapsedTicks:180}))}),story.id);
  await expect(page.locator('.fo-campaign-new-lead p')).toHaveText(story.dispatches[9]!.reveal);
  await expect(page.locator('.fo-results')).toContainText(story.title);
  await expect(page.getByRole('button',{name:'ANOTHER CASE'})).toBeInViewport();
  await page.getByRole('button',{name:'ANOTHER CASE'}).click();
  await expect(page.getByRole('button',{name:'START DISPATCH'})).toBeVisible();
  await expect(page.locator('[data-campaign-series]')).not.toHaveText(story.title);
 }
});

test('uses the selected case for live objectives, both car fittings and lighting across all five rooms',async({page},info)=>{
 test.setTimeout(90000);
 await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot?.campaign)).toBeDefined();
 const room=new URL(page.url()).searchParams.get('room')!,port=Number(process.env.FENDER_E2E_SERVER_PORT??2867)+1000;
 for(const [index,story]of STORYLINES.entries()){
  expect((await page.request.post(`http://127.0.0.1:${port}/room/${room}/story/${index}`)).ok()).toBe(true);
  await expect(page.locator('[data-campaign-series]')).toHaveText(story.title);
  await expect(page.locator('[data-campaign-name]')).toHaveText(getCampaignTarget(story.dispatches[0]!.targetId).name);
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.garageReady)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.garageArmed)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.garageSuspectArmed)).toBe(false);
  await page.screenshot({path:info.outputPath(`${story.id}-native.png`)});
  await page.getByRole('button',{name:'START DISPATCH'}).click();
  await expect(page.locator('[data-objective-title]')).toHaveText(`APPREHEND ${getCampaignTarget(story.dispatches[0]!.targetId).name.split(' ')[0]!.toUpperCase()}`);
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.environmentDispatchId)).toBe(story.dispatches[0]!.id);
  await page.keyboard.down('Space');await page.waitForTimeout(100);await page.keyboard.up('Space');
  expect(await page.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot.local.driver.shotOrdinal)).toBe(0);
  await dispatchFixture(page,2);
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.garageArmed)).toBe(true);
  await page.getByRole('button',{name:'START DISPATCH'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot.phase)).toBe('playing');
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.environmentTheme)).toBe('dusk');
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.environmentDispatchId)).toBe(story.dispatches[2]!.id);
 }
});
