import { arrestFixture, createGameContext, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const workspace = process.cwd().replaceAll('\\', '/');
const fixtureUrl = `/@fs/${workspace}/packages/ui/dev/campaign.html`;
const catalogUrl = `/@fs/${workspace}/packages/contracts/src/campaign-mugshots.ts`;
async function fixture(page: Page) {
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => Boolean((window as any).campaignFixture));
}
const set = (page: Page, options: Record<string, unknown>) => page.evaluate(options => (window as any).campaignFixture.set(options), options);
const outcome = (dispatchIndex: number, result: 'arrested' | 'wrecked', playerId = 'backup') => ({ dispatchIndex, outcome: result, playerId, callsign: playerId === 'backup' ? 'Parking Menace' : 'Officer Rookie', elapsedTicks: 180 });

test('all fifty suspects keep their identity but have visibly different outcome illustrations', async ({ page }) => {
  await fixture(page);
  const results = await page.evaluate(async url => {
    const { getCampaignMugshot } = await import(url);
    const { targets } = { targets: (window as any).campaignFixture.catalog.ALL_CAMPAIGN_TARGETS };
    const raster = async (svg: string) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 160, 160);
        return context.getImageData(0, 0, 160, 160).data;
      } finally { URL.revokeObjectURL(url); }
    };
    const results: { id: string; variant: string; changedPixels: number }[] = [];
    for (const target of targets) {
      const original = await raster(getCampaignMugshot(target.id));
      for (const variant of ['arrested', 'wrecked', 'escaped']) {
        const current = await raster(getCampaignMugshot(target.id, variant)); let changedPixels = 0;
        for (let i = 0; i < original.length; i += 4) if (Math.abs(current[i]! - original[i]!) + Math.abs(current[i + 1]! - original[i + 1]!) + Math.abs(current[i + 2]! - original[i + 2]!) > 30) changedPixels++;
        results.push({ id: target.id, variant, changedPixels });
      }
    }
    return results;
  }, catalogUrl);
  expect(results).toHaveLength(150);
  for (const result of results) expect(result.changedPixels, `${result.id}: ${result.variant} must change visible artwork`).toBeGreaterThan(160 * 160 * .02);
});

test('results select bandages, bars or gloating from the shared outcome and refresh the same suspect on retry', async ({ page }) => {
  await fixture(page);
  const portrait = page.locator('.fo-campaign-resolution>.fo-campaign-target .fo-campaign-portrait');
  await set(page, { stage: 1, phase: 'lobby', outcomes: [] });
  const original = await page.locator('.fo-campaign-briefing .fo-campaign-portrait svg').innerHTML();
  const results = [
    { variant: 'wrecked', description: 'bandaged', outcomes: [outcome(1, 'wrecked')] },
    { variant: 'arrested', description: 'behind bars', outcomes: [outcome(1, 'arrested')] },
    { variant: 'escaped', description: 'gloating', outcomes: [outcome(0, 'arrested')] },
  ];
  for (const result of results) {
    await set(page, { stage: 1, phase: 'results', outcomes: result.outcomes });
    await expect(portrait).toBeVisible();
    await expect(portrait.locator('svg')).toHaveAttribute('data-portrait-variant', result.variant);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }, { width: 520, height: 760 }]) {
      await page.setViewportSize(viewport); await portrait.scrollIntoViewIfNeeded();
      await expect(portrait).toBeInViewport();
      await expect.poll(async () => {
        const size = await portrait.boundingBox();
        return size && { width: size.width, height: size.height };
      }).toEqual({ width: 96, height: 96 });
      await page.screenshot({ path: test.info().outputPath(`result-${result.variant}-${viewport.width}.png`) });
    }
    await expect(portrait).toHaveAccessibleName(new RegExp(`Mabel Clench.*${result.description}`, 'i'));
    await set(page, { stage: 1, phase: 'results', mode: 'online', outcomes: result.outcomes });
    await expect(portrait.locator('svg')).toHaveAttribute('data-portrait-variant', result.variant);
  }
  await set(page, { stage: 1, phase: 'lobby', outcomes: [outcome(0, 'arrested')] });
  await expect(page.locator('.fo-campaign-briefing .fo-campaign-portrait svg')).toHaveAttribute('data-portrait-variant', 'briefing');
  expect(await page.locator('.fo-campaign-briefing .fo-campaign-portrait svg').innerHTML()).toBe(original);
});

test('each compact case finale shows the final suspect’s own outcome without reviving the campaign dashboard', async ({ page }) => {
  await fixture(page);
  const stories = await page.evaluate(() => (window as any).campaignFixture.catalog.STORYLINES.map((story: any) => ({ id: story.id, targetId: story.dispatches[9].targetId })));
  const portrait = page.locator('.fo-campaign-resolution>.fo-campaign-target .fo-campaign-portrait');
  for (const story of stories) for (const variant of ['arrested', 'wrecked'] as const) {
    const outcomes = Array.from({ length: 10 }, (_, index) => outcome(index, index === 9 ? variant : variant === 'arrested' ? 'wrecked' : 'arrested'));
    await set(page, { campaignId: story.id, stage: 9, phase: 'results', complete: true, outcomes });
    await expect(portrait).toHaveAttribute('data-target', story.targetId);
    await expect(portrait.locator('svg')).toHaveAttribute('data-portrait-variant', variant);
    await expect(portrait).toBeInViewport();
    await expect(page.getByRole('button', { name: 'ANOTHER CASE' })).toBeInViewport();
    await expect(page.locator('.fo-campaign-bosses,.fo-campaign-casefile,.fo-campaign-tracker')).toHaveCount(0);
  }
});

test('the review sheet renders all two hundred portraits consistently at detail and HUD sizes', async ({ page }) => {
  await fixture(page);
  const stories: { id: string }[] = await page.evaluate(() => (window as any).campaignFixture.catalog.STORYLINES.map((story: any) => ({ id: story.id })));
  await page.setViewportSize({ width: 1100, height: 2400 });
  for (const [index, story] of stories.entries()) {
    await page.goto(`/@fs/${workspace}/packages/ui/dev/outcome-portraits.html?storyline=${story.id}`);
    await expect(page.locator('.portrait-art svg')).toHaveCount(40);
    for (const size of [160, 96]) {
      await page.locator('.portrait-grid').evaluate((node, size) => (node as HTMLElement).style.setProperty('--portrait-size', `${size}px`), size);
      for (const art of await page.locator('.portrait-art').all()) {
        const bounds = await art.boundingBox(); expect(bounds?.width).toBe(size); expect(bounds?.height).toBe(size);
      }
      const path = test.info().outputPath(`story-${index}-suspects-${size}.png`);
      await page.screenshot({ path, fullPage: true });
      await test.info().attach(`Story ${index + 1} suspects at ${size}px`, { path, contentType: 'image/png' });
    }
  }
});

test('a confirmed room arrest reconstructs the same jailed portrait for a late observer', async ({ page, browser }) => {
  test.setTimeout(90000);
  await page.goto('/'); await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.getByRole('button', { name: 'START DISPATCH', exact: false }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase)).toBe('playing');
  await arrestFixture(page);
  const portrait = page.locator('.fo-campaign-resolution>.fo-campaign-target .fo-campaign-portrait svg');
  await expect(portrait).toHaveAttribute('data-portrait-variant', 'arrested');
  const original = await portrait.evaluate(node => node.outerHTML);
  const context = await createGameContext(browser);
  try {
    const observer = await context.newPage(); await observer.goto(page.url());
    await observer.getByRole('button', { name: 'HIT THE STREETS' }).click();
    const shared = observer.locator('.fo-campaign-resolution>.fo-campaign-target .fo-campaign-portrait svg');
    await expect(shared).toHaveAttribute('data-portrait-variant', 'arrested');
    expect(await shared.evaluate(node => node.outerHTML)).toBe(original);
  } finally { await context.close(); }
});
