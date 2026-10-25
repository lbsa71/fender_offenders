import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export async function dispatchFixture(page:Page,stage:number){
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot?.campaign)).toBeDefined();
 const room=new URL(page.url()).searchParams.get('room')!;
 const port=Number(process.env.FENDER_E2E_SERVER_PORT??2867)+1000;
 const response=await page.request.post(`http://127.0.0.1:${port}/room/${room}/stage/${stage}`);
 expect(response.ok()).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.snapshot?.campaign?.dispatchIndex)).toBe(stage);
}
export async function arrestFixture(page:Page){
 const room=new URL(page.url()).searchParams.get('room')!;
 const port=Number(process.env.FENDER_E2E_SERVER_PORT??2867)+1000;
 expect((await page.request.post(`http://127.0.0.1:${port}/room/${room}/arrest/0`)).ok()).toBe(true);
}

/** Exercise the shipped low preset; do not replace the renderer or simulation. */
export async function configureGameContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // Preserve settings on reload so the persistence assertions retain meaning.
    if (localStorage.getItem('fender-settings-v1') === null) {
      localStorage.setItem('fender-settings-v1', JSON.stringify({ quality: 'low' }));
    }
  });
}

export async function createGameContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
  await configureGameContext(context);
  return context;
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await configureGameContext(context);
    await use(context);
  },
});
export { expect };
