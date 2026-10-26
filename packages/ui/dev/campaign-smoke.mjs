import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {existsSync,mkdirSync} from 'node:fs';

// Inject authority snapshots; keep story, permissions and responsive controls real.
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:5188,strictPort:true}});
await server.listen();
const browser=await chromium.launch(existsSync(chromium.executablePath())?{}:{executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5188/packages/ui/dev/campaign.html');
 await page.getByRole('button',{name:'HIT THE STREETS'}).click();
 const set=options=>page.evaluate(options=>window.campaignFixture.set(options),options);
 const outcome=(dispatchIndex,method='arrested',playerId='you',callsign)=>({dispatchIndex,outcome:method,playerId,elapsedTicks:300,...(callsign?{callsign}:{})});
 const catalog=await page.evaluate(()=>({dispatches:window.campaignFixture.catalog.CAMPAIGN_DISPATCHES,targets:window.campaignFixture.catalog.CAMPAIGN_TARGETS}));
 const briefing=page.getByRole('region',{name:'Campaign dispatch briefing'}),results=page.locator('.fo-results'),lead=page.locator('.fo-campaign-new-lead p');
 await expect(briefing).toBeVisible();await expect(page.locator('.fo-garage')).toBeVisible();
 expect(await page.evaluate(()=>window.campaignFixture.ui.isMenuVisible())).toBe(true);
 expect(await page.evaluate(()=>document.activeElement?.getAttribute('data-action'))).toBe('campaign-start');
 await expect(page.locator('.fo-campaign-tracker,.fo-campaign-casefile,.fo-campaign-roster,.fo-garage-stats,[data-campaign-tactics]')).toHaveCount(0);
 await expect(briefing.locator('.fo-campaign-portrait svg')).toHaveCount(1);
 await expect(briefing).not.toContainText(catalog.dispatches[0].reveal);
 await page.keyboard.press('Enter');expect(await page.evaluate(()=>window.campaignFixture.starts)).toBe(1);
 await expect(briefing).toBeHidden();await expect(page.locator('.fo-garage')).toBeHidden();
 await set({stage:0,phase:'results',outcomes:[outcome(0)]});
 await expect(page.getByText('ARREST CERTIFIED',{exact:true})).toBeVisible();
 await expect(page.locator('.fo-result-outcome')).toContainText('✓ ARRESTED');
 await expect(page.locator('.fo-result-outcome')).toContainText('OFFICER ROOKIE');
 await expect(lead).toHaveText(catalog.dispatches[0].reveal);await expect(results).not.toContainText(catalog.dispatches[1].reveal);
 await set({stage:0,phase:'results',outcomes:[outcome(0)]});
 await expect(page.getByRole('button',{name:'NEXT BRIEFING'})).toBeVisible();
 await page.getByRole('button',{name:'NEXT BRIEFING'}).click();
 expect(await page.evaluate(()=>window.campaignFixture.options.stage)).toBe(1);
 await expect(briefing).toBeVisible();
 const before=await page.evaluate(()=>window.campaignFixture.ui.getVehicle());
 await page.getByRole('button',{name:'REASSIGN VEHICLE'}).focus();await page.evaluate(()=>window.campaignFixture.ui.navigate('confirm'));
 expect(await page.evaluate(()=>window.campaignFixture.ui.getVehicle())).not.toBe(before);
 await set({stage:1,phase:'results',outcomes:[outcome(0),outcome(1,'wrecked','backup')]});
 await expect(page.locator('.fo-result-outcome')).toHaveAttribute('data-outcome','wrecked');
 await expect(page.locator('.fo-result-outcome')).toContainText('✕ WRECKED');
 await expect(page.locator('.fo-result-outcome')).not.toContainText('✓');
 await expect(page.locator('.fo-result-outcome')).toContainText('PARKING MENACE');
 await expect(lead).toHaveText(catalog.dispatches[1].reveal);await expect(results).not.toContainText(catalog.dispatches[0].reveal);
 await expect(page.locator('.fo-toast')).toBeHidden();
 await set({stage:1,phase:'results',outcomes:[outcome(0),outcome(1,'arrested','departed','Former Officer')]});
 await expect(page.locator('.fo-result-outcome')).toContainText('FORMER OFFICER');
 await set({stage:1,phase:'results',outcomes:[outcome(0),outcome(1,'arrested','departed','<img src=x onerror=alert(1)>')]});
 await expect(results.locator('img')).toHaveCount(0);
 await set({mode:'online',canStart:false,stage:1,phase:'results',outcomes:[outcome(0),outcome(1)]});
 await expect(page.getByRole('button',{name:'RECONNECT TO CONTINUE'})).toBeDisabled();
 await set({stage:2,phase:'results',outcomes:[outcome(0),outcome(1)]});
 await expect(lead).toBeHidden();await page.getByRole('button',{name:'RETRY DISPATCH'}).click();
 expect(await page.evaluate(()=>window.campaignFixture.options.stage)).toBe(2);
 const complete=Array.from({length:10},(_,index)=>outcome(index,index%3===1?'wrecked':'arrested',index%2?'backup':'you'));
 await set({stage:9,phase:'results',complete:true,outcomes:complete});
 await expect(page.getByRole('heading',{name:'The racket is exposed.'})).toBeVisible();
 await expect(lead).toHaveText(catalog.dispatches[9].reveal);
 await expect(results).not.toContainText(catalog.dispatches[0].reveal);
 await expect(page.locator('.fo-campaign-boss,.fo-campaign-tracker,[data-results]')).toHaveCount(0);
 await page.getByRole('button',{name:'NEW CAMPAIGN'}).click();
 expect(await page.evaluate(()=>window.campaignFixture.options.stage)).toBe(0);
 for(const size of [{width:1440,height:900},{width:960,height:640},{width:740,height:740},{width:520,height:760},{width:390,height:844},{width:740,height:420}]){
  await page.setViewportSize(size);await set({stage:1,outcomes:[outcome(0)]});
  expect(await briefing.evaluate(panel=>{const box=panel.getBoundingClientRect(),portrait=panel.querySelector('.fo-campaign-portrait').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight&&panel.scrollWidth<=panel.clientWidth&&portrait.width>=96;})).toBe(true);
  await expect(page.getByRole('button',{name:'START DISPATCH'})).toBeInViewport();
  await page.getByRole('button',{name:'REASSIGN VEHICLE'}).click();
  expect(await page.evaluate(()=>{const a=document.querySelector('.fo-toast').getBoundingClientRect(),b=document.querySelector('.fo-campaign-briefing').getBoundingClientRect();return a.bottom<=b.top||a.top>=b.bottom||a.left>=b.right||a.right<=b.left;})).toBe(true);
  if(process.env.CAPTURE_UI){mkdirSync('work/quick-patrol',{recursive:true});await page.screenshot({path:`work/quick-patrol/briefing-fixture-${size.width}x${size.height}.png`});}
  await set({stage:9,phase:'results',complete:true,outcomes:complete});
  await expect(page.getByRole('button',{name:'NEW CAMPAIGN'})).toBeInViewport();
  expect(await results.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
 }
 for(let stage=0;stage<10;stage++){
  await set({stage,mode:'online'});const target=catalog.targets.find(t=>t.id===catalog.dispatches[stage].targetId);
  await expect(briefing.locator('[data-campaign-name]')).toHaveText(target.name);
  await expect(briefing.locator('[data-campaign-title]')).toHaveText(catalog.dispatches[stage].title.replace(/^\d+\s*·\s*/,''));
  const story=catalog.dispatches[stage].briefing.replace(' Arrest him or wreck the getaway car.','');
  await expect(briefing.locator('[data-campaign-briefing]')).toHaveText(story);
  expect((await briefing.innerText()).split(/\s+/).length).toBeLessThan(125);
  await expect(page.getByRole('img',{name:'Connected',exact:true})).toBeVisible();
  await expect(page.locator('.fo-scoreboard,.fo-campaign-roster,.fo-ping')).toHaveCount(0);
 }
 await set({stage:0,phase:'playing'});await expect(page.locator('[data-text="timer"]')).toHaveText('04:55');
 expect(errors).toEqual([]);
 console.log('Campaign UI GREEN: concise ten-target story, current earned clue, arrest/wreck credit, safe text, permissions, retry/next/finale, controller car choice and six responsive layouts; no statistics dashboard.');
}finally{await browser.close();await server.close();}
