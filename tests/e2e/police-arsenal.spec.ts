import { dispatchFixture, expect, test } from './fixtures';
const fixtureUrl=`/@fs/${process.cwd().replaceAll('\\','/')}/packages/ui/dev/index.html`;
test('keeps current weapon controls and reminders available in every unlocked dispatch on narrow keyboard and touch layouts',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.goto(fixtureUrl);await page.getByRole('button',{name:'HIT THE STREETS'}).click();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'CONTROLS HELP',exact:true}).click();
 for(let stage=0;stage<10;stage++){
  await page.evaluate(stage=>{const f=(window as any).fixture;f.ui.update({snapshot:{...f.snapshot,campaign:{campaignId:'green-light-racket-v1',dispatchIndex:stage,status:'active',outcomes:[]}}});},stage);
  for(const [action,unlock] of [['fire',2],['bomb',4],['oil',7],['blades',8],['smog',9]] as const){const rows=page.locator(`.fo-help-view [data-control="${action}"]`);await expect(rows).toHaveCount(2);for(const row of await rows.all())stage>=unlock?await expect(row).toBeVisible():await expect(row).toBeHidden();}
  if(stage>=4)await expect(page.locator('.fo-help-view [data-control-lesson]')).toContainText('bomb');
  if(stage>=7)await expect(page.locator('.fo-help-view [data-control-lesson]')).toContainText('oil');
  if(stage>=8)await expect(page.locator('.fo-help-view [data-control-lesson]')).toContainText('blades');
 }
 await page.screenshot({path:info.outputPath('all-weapon-help-narrow.png'),fullPage:true});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'BACK ON PATROL'}).click();
 await page.evaluate(()=>{const f=(window as any).fixture;f.ui.setSettings({controlScheme:'touch'});f.ui.update({device:'touch'});});
 for(const kind of ['bomb','oil','blades','smog'])await expect(page.locator(`[data-touch="${kind}"]`)).toBeInViewport();
 for(const viewport of [{width:667,height:375},{width:667,height:290}]){await page.setViewportSize(viewport);for(const kind of ['bomb','oil','blades','smog']){const button=page.locator(`[data-touch="${kind}"]`);await expect(button).toBeInViewport();const box=(await button.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}}
 await page.screenshot({path:info.outputPath('all-weapons-touch-narrow.png')});
});
for(const [stage,kind,key] of [[4,'bomb','b'],[7,'oil','q'],[8,'blades','c'],[9,'smog','g']] as const)test(`dispatch ${stage+1} deploys police ${kind} through real input and authority`,async({page},info)=>{
 await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await dispatchFixture(page,stage);await page.getByRole('button',{name:'START DISPATCH'}).click();
 await page.waitForFunction(()=>{const d=(window as any).__FENDER_DEBUG__;return d?.snapshot?.phase==='playing'&&d.snapshot.serverTick>=d.snapshot.local.vehicle.protectedUntilTick&&d.input.focused;});
 await page.keyboard.down(key);
 await expect.poll(()=>page.evaluate(kind=>{const s=(window as any).__FENDER_DEBUG__.snapshot;return (kind==='bomb'?s.grenades:s.gadgets)?.some((g:any)=>g.ownerEntityId===s.local.vehicle.entityId&&(kind==='bomb'||g.kind===kind));},kind)).toBe(true);
 await page.keyboard.up(key);await page.screenshot({path:info.outputPath(`police-${kind}.png`)});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'CONTROLS HELP',exact:true}).click();
 for(const row of await page.locator(`.fo-help-view [data-control="${kind}"]`).all())await expect(row).toBeVisible();
 await expect(page.locator('.fo-help-view [data-control-lesson]')).toContainText(kind==='bomb'?'bomb':kind);
});

test('deploys each unlocked weapon through actual touch taps without replay after pause',async({page,context})=>{
 await page.addInitScript(()=>localStorage.setItem('fender-settings-v1',JSON.stringify({quality:'low',controlScheme:'touch'})));await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();const cdp=await context.newCDPSession(page);
 for(const [stage,kind] of [[4,'bomb'],[7,'oil'],[8,'blades'],[9,'smog']] as const){await dispatchFixture(page,stage);await page.getByRole('button',{name:'START DISPATCH'}).click();await page.waitForFunction(()=>{const d=(window as any).__FENDER_DEBUG__;return d?.snapshot?.phase==='playing'&&d.snapshot.serverTick>=d.snapshot.local.vehicle.protectedUntilTick&&d.input.focused;});
 const box=(await page.locator(`[data-touch="${kind}"]`).boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:box.x+box.width/2,y:box.y+box.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>page.evaluate(()=>((window as any).__FENDER_DEBUG__.snapshot.local.driver.nextDeployTick??0))).toBeGreaterThan(0);const deadline=await page.evaluate(()=>(window as any).__FENDER_DEBUG__.snapshot.local.driver.nextDeployTick);await page.getByRole('button',{name:'Open pause menu'}).click();await page.getByRole('button',{name:'BACK ON PATROL'}).click();expect(await page.evaluate(()=>(window as any).__FENDER_DEBUG__.snapshot.local.driver.nextDeployTick)).toBe(deadline);
 }
});
