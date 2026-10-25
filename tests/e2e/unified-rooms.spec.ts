import { expect, test, createGameContext } from './fixtures';
import type { Page } from '@playwright/test';
const state = (page:Page) => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot);

test('opens another room or starts fresh through the unified entry controls',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'OPEN ANOTHER ROOM',exact:true}).click();
  await page.getByRole('textbox',{name:'ROOM CODE OR INVITE LINK'}).fill('https://example.com/?room=UnifiedCase1');
  await page.getByRole('button',{name:'OPEN ROOM',exact:true}).click();
  await expect(page).toHaveURL(/room=UnifiedCase1$/);await expect.poll(async()=>(await state(page))?.phase).toBe('lobby');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'END PATROL'}).click();
  await page.getByRole('button',{name:'START A NEW ROOM',exact:true}).click();
  await expect(page).not.toHaveURL(/room=UnifiedCase1$/);
  await expect.poll(async()=>(await state(page))?.campaign?.dispatchIndex).toBe(0);
});

test('assigns a room URL before entry, retains it on reload, and allocates only when entering',async({page,request})=>{
  const health=`${process.env.TEST_SERVER_URL ?? 'http://127.0.0.1:2567'}/health`;
  const before=await (await request.get(health)).json();
  await page.goto('/');await expect(page).toHaveURL(/\?room=[A-Za-z0-9_-]{8,64}$/);
  const assigned=page.url();await page.reload();await expect(page).toHaveURL(assigned);
  const after=await (await request.get(health)).json();expect(after.rooms).toBe(before.rooms);
  await page.getByRole('button',{name:'HIT THE STREETS'}).click();
  await expect.poll(async()=>(await state(page))?.phase).toBe('lobby');
  await expect(page.locator('.fo-campaign-number')).toContainText('NEW CAMPAIGN');
  await page.getByRole('button',{name:'START DISPATCH',exact:false}).click();
  await expect.poll(async()=>(await state(page))?.phase).toBe('playing');
});
test('pauses alone, resumes when backup joins live, and returns to the same campaign',async({browser,baseURL})=>{
  const aContext=await createGameContext(browser),bContext=await createGameContext(browser);
  try{
    const a=await aContext.newPage(),b=await bContext.newPage();await a.goto(baseURL!);
    await a.getByRole('button',{name:'HIT THE STREETS'}).click();await a.getByRole('button',{name:'START DISPATCH',exact:false}).click();
    await expect.poll(async()=>(await state(a))?.phase).toBe('playing');
    await a.keyboard.press('Escape');await expect.poll(async()=>(await state(a))?.paused).toBe(true);
    const tick=(await state(a)).serverTick;await a.waitForTimeout(200);expect((await state(a)).serverTick).toBe(tick);
    await b.goto(a.url());await b.getByRole('button',{name:'HIT THE STREETS'}).click();
    await expect.poll(async()=>(await state(b))?.phase).toBe('playing');await expect.poll(async()=>(await state(a))?.paused).toBe(false);
    await a.waitForTimeout(4000);
    await expect(a.getByText('Backup joined. The dispatch is live.',{exact:true})).toBeVisible();
    await expect.poll(async()=>(await state(b))?.campaign).toEqual((await state(a)).campaign);
    await b.keyboard.press('Escape');await b.getByRole('button',{name:'END PATROL'}).click();
    await expect.poll(async()=>(await state(a))?.paused).toBe(true);
    await expect(a.getByText('Backup joined. The dispatch is live.',{exact:true})).toBeHidden();
  }finally{await aContext.close();await bContext.close();}
});
