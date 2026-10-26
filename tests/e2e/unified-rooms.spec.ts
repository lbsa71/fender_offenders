import { expect, test, createGameContext } from './fixtures';
import type { Page } from '@playwright/test';
const state = (page:Page) => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot);

test('offers one invite URL action and one entry action without room-management controls',async({page})=>{
  await page.addInitScript(()=>{
    (window as any).firstAddress=location.href;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).copiedInvite=text;}}});
  });
  await page.goto('/?theme=dusk#patrol');
  await expect(page.getByRole('heading',{name:"You're on duty."})).toBeVisible();
  await expect(page.getByRole('button',{name:'START A NEW ROOM',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'OPEN ANOTHER ROOM',exact:true})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'ROOM CODE OR INVITE LINK'})).toHaveCount(0);
  const invite=page.getByRole('button',{name:'INVITE URL',exact:true});await expect(invite).toHaveCount(1);
  const assigned=new URL(page.url());expect(assigned.searchParams.get('room')).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  expect(assigned.searchParams.get('theme')).toBe('dusk');expect(assigned.hash).toBe('#patrol');
  expect(new URL(await page.evaluate(()=>(window as any).firstAddress)).searchParams.has('room')).toBe(false);
  await invite.click();expect(await page.evaluate(()=>(window as any).copiedInvite)).toBe(page.url());
  expect(await state(page)).toBeNull();
  const capture=test.info().outputPath('minimal-entry.png');await page.screenshot({path:capture});await test.info().attach('Minimal entry',{path:capture,contentType:'image/png'});
  await page.getByRole('button',{name:'HIT THE STREETS'}).click();
  await expect.poll(async()=>(await state(page))?.phase).toBe('lobby');
  await expect(invite).toHaveCount(1);
});

test('offers address-bar copying when the clipboard is unavailable',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
  await page.goto('/?room=FallbackInvite');
  await page.getByRole('button',{name:'INVITE URL',exact:true}).click();
  await expect(page.getByText('Copy this page’s address to invite a friend.',{exact:true})).toBeVisible();
});

test('assigns a room URL before entry, retains it on reload, and allocates only when entering',async({page,request})=>{
  const health=`${process.env.TEST_SERVER_URL ?? 'http://127.0.0.1:2567'}/health`;
  const before=await (await request.get(health)).json();
  await page.goto('/');await expect(page).toHaveURL(/\?room=[A-Za-z0-9_-]{8,64}$/);
  const assigned=page.url();await page.reload();await expect(page).toHaveURL(assigned);
  const after=await (await request.get(health)).json();expect(after.rooms).toBe(before.rooms);
  await page.getByRole('button',{name:'HIT THE STREETS'}).click();
  await expect.poll(async()=>(await state(page))?.phase).toBe('lobby');
  expect((await state(page))?.campaign).toMatchObject({dispatchIndex:0,status:'active',outcomes:[]});
  await expect(page.locator('[data-campaign-title]')).toHaveText('A Small Withdrawal');
  await expect(page.locator('[data-campaign-name]')).toHaveText('Nico Nickel');
  await page.getByRole('button',{name:'START DISPATCH',exact:false}).click();
  await expect.poll(async()=>(await state(page))?.phase).toBe('playing');
});
test('shares an ongoing solo patrol from its pause menu and adds backup without resetting it',async({browser,baseURL})=>{
  // Two real scenes plus the intentional notice delay need a total budget
  // matching the other two-browser flow. Individual expectations stay at 12 s.
  test.setTimeout(90000);
  const aContext=await createGameContext(browser),bContext=await createGameContext(browser);
  try{
    await aContext.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).copiedPatrolInvite=text;}}}));
    const a=await aContext.newPage(),b=await bContext.newPage();await a.goto(baseURL!);
    await a.getByRole('button',{name:'HIT THE STREETS'}).click();await a.getByRole('button',{name:'START DISPATCH',exact:false}).click();
    await expect.poll(async()=>(await state(a))?.phase).toBe('playing');
    await a.keyboard.press('Escape');await expect.poll(async()=>(await state(a))?.paused).toBe(true);
    const solo=await state(a),tick=solo.serverTick;await a.waitForTimeout(200);expect((await state(a)).serverTick).toBe(tick);
    const invite=a.getByRole('button',{name:'INVITE URL',exact:true});
    await expect(invite).toBeVisible();
    // Resume -> end patrol -> settings -> controls help -> invite.
    await a.keyboard.press('Tab');await a.keyboard.press('Tab');await a.keyboard.press('Tab');await a.keyboard.press('Tab');await expect(invite).toBeFocused();
    const capture=test.info().outputPath('invite-backup-menu.png');await a.screenshot({path:capture});await test.info().attach('Pause menu invite',{path:capture,contentType:'image/png'});
    await a.keyboard.press('Enter');
    const shared=await a.evaluate(()=>(window as any).copiedPatrolInvite);
    expect(shared).toBe(a.url());expect((await state(a)).serverTick).toBe(tick);
    await b.goto(shared);await b.getByRole('button',{name:'HIT THE STREETS'}).click();
    await expect.poll(async()=>(await state(b))?.phase).toBe('playing');await expect.poll(async()=>(await state(a))?.paused).toBe(false);
    const resumed=await state(a),joined=await state(b);
    expect(resumed.matchId).toBe(solo.matchId);expect(joined.matchId).toBe(solo.matchId);
    expect(resumed.phaseEndsAtTick).toBe(solo.phaseEndsAtTick);expect(resumed.local.vehicle.entityId).toBe(solo.local.vehicle.entityId);
    expect(resumed.local.vehicle.health).toBe(solo.local.vehicle.health);
    expect(resumed.campaign).toEqual(solo.campaign);expect(joined.campaign).toEqual(solo.campaign);
    expect(resumed.scores).toHaveLength(2);expect(resumed.serverTick).toBeGreaterThanOrEqual(tick);
    await a.waitForTimeout(4000);
    await expect(a.getByText('Backup joined. The dispatch is live.',{exact:true})).toBeVisible();
    await expect.poll(async()=>(await state(b))?.campaign).toEqual((await state(a)).campaign);
    await b.bringToFront();
    await b.keyboard.press('Escape');
    // Keep the room lifecycle keyboard-driven; pointer stability belongs to the UI fixture.
    const leave=b.getByRole('button',{name:'END PATROL'});await expect(leave).toBeVisible();
    await leave.focus();await expect(leave).toBeFocused();await b.keyboard.press('Enter');
    await expect.poll(async()=>(await state(a))?.paused).toBe(true);
    await expect(a.getByText('Backup joined. The dispatch is live.',{exact:true})).toBeHidden();
  }finally{await aContext.close();await bContext.close();}
});
