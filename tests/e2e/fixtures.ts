import { test as base, expect, type Browser, type BrowserContext } from '@playwright/test';

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
