import { arrestFixture, createGameContext, dispatchFixture, expect, test } from './fixtures';

test('teaches an unarmed first arrest with temporary remapped controls and both briefing cars',async({page},testInfo)=>{
 await page.addInitScript(()=>localStorage.setItem('fender-settings-v1',JSON.stringify({bindings:{throttle:['KeyI']}})));
 await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();
 await expect(page.getByRole('region',{name:'Campaign dispatch briefing'})).toBeVisible();
 await expect(page.getByText('YOUR UNIT',{exact:true})).toBeVisible();await expect(page.getByText('SUSPECT CAR',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.garageSuspectBody)).toBe('roadster');
 await page.screenshot({path:testInfo.outputPath('rookie-briefing-desktop.png')});
 await page.getByRole('button',{name:'START DISPATCH'}).click();
 await expect(page.locator('[data-tutorial-controls]')).toBeVisible();
 await expect(page.locator('[data-tutorial-controls]')).toContainText('I');
 await expect(page.locator('[data-tutorial-controls]')).not.toContainText('FIRE');
 await expect(page.locator('[data-objective-title]')).toHaveText('APPREHEND NICO');
 await expect(page.locator('[data-objective-instruction]')).toContainText('3 seconds');
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot?.serverTick >= (window as any).__FENDER_DEBUG__?.snapshot?.local?.vehicle.protectedUntilTick)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('rookie-controls.png')});
 await page.keyboard.press('Space');
 expect(await page.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot.projectiles.length)).toBe(0);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'SETTINGS & CONTROLS'}).click();
 await page.getByText('KEYBOARD BINDINGS',{exact:true}).click();await expect(page.locator('[data-binding="fire"]')).toBeHidden();
});

test('an arrest teaches suspect guns before police guns unlock and later briefings teach bombs and puddles',async({page,browser})=>{
 await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await page.getByRole('button',{name:'START DISPATCH'}).click();
 await expect(page.locator('[data-tutorial-controls]')).toBeVisible();await arrestFixture(page);
 await expect(page.getByText('ARREST CERTIFIED',{exact:true})).toBeVisible();await page.getByRole('button',{name:'NEXT BRIEFING'}).click();
 await expect(page.locator('[data-tutorial-lesson]')).toContainText('SUSPECT GUNS');
 await dispatchFixture(page,2);await expect(page.locator('[data-tutorial-lesson]')).toContainText('UNLOCKED: GUNS!');
 await page.getByRole('button',{name:'START DISPATCH'}).click();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'CONTROLS HELP',exact:true}).click();
 await expect(page.locator('.fo-help-view [data-control="fire"]')).toHaveCount(2);
 for(const row of await page.locator('.fo-help-view [data-control="fire"]').all())await expect(row).toBeVisible();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'BACK ON PATROL'}).click();
 await page.keyboard.down('Space');await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot.local.driver.shotOrdinal??0)).toBeGreaterThan(0);await page.keyboard.up('Space');
 await dispatchFixture(page,2);await expect(page.locator('[data-tutorial-lesson]')).toContainText('marked circle');
 await dispatchFixture(page,3);await expect(page.locator('[data-tutorial-lesson]')).toContainText('Puddles reduce grip');
 await page.getByRole('button',{name:'START DISPATCH'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.waterSurfaces)).toBe(6);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'CONTROLS HELP',exact:true}).click();
 await expect(page.locator('.fo-help-view [data-control-lesson]')).toContainText('Puddles reduce grip');
 const backupContext=await createGameContext(browser);try{const backup=await backupContext.newPage();await backup.goto(page.url());await backup.getByRole('button',{name:'HIT THE STREETS'}).click();await expect(backup.locator('[data-tutorial-controls] [data-control-lesson]')).toContainText('Puddles reduce grip');await expect(backup.locator('[data-tutorial-controls] [data-control="fire"]')).toBeVisible();expect(await backup.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot.campaign.dispatchIndex)).toBe(3);}finally{await backupContext.close();}
});

test('shares a chase preview and both stats on a narrow briefing without covering its start action',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();
 await expect(page.getByText('YOUR UNIT',{exact:true})).toBeVisible();await expect(page.getByText('SUSPECT CAR',{exact:true})).toBeVisible();
 const start=page.getByRole('button',{name:'START DISPATCH'});await expect(start).toBeInViewport();
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.renderer.garageSuspectBody)).toBe('roadster');
 await page.screenshot({path:testInfo.outputPath('rookie-briefing-mobile.png')});
 await start.click();await expect(page.locator('[data-tutorial-controls]')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot?.serverTick >= (window as any).__FENDER_DEBUG__?.snapshot?.local?.vehicle.protectedUntilTick)).toBe(true);
 await expect(page.locator('.fo-target-indicator')).toBeVisible();
 expect(await page.locator('.fo-target-indicator').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})).toBe(true);
 await page.screenshot({path:testInfo.outputPath('rookie-controls-mobile.png')});
 await page.getByRole('button',{name:'Open pause menu'}).click();
 await page.getByRole('button',{name:'CONTROLS HELP',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Controls help.'})).toBeVisible();
 await expect(page.locator('.fo-help-lesson')).toContainText('Arresting is automatic');
});
