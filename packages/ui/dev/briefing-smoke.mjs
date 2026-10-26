import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';

// Real DOM/CSS with injected campaign snapshots; no physics, WebGL or sockets.
const server = await createServer({ configFile: false, root: process.cwd(), server: { host: '127.0.0.1', port: 5189, strictPort: true } });
await server.listen();
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: 'patrol' })));
  await page.goto('http://127.0.0.1:5189/packages/ui/dev/campaign.html');
  await expect(page.locator('.fo-garage')).toBeHidden();
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  const set = options => page.evaluate(options => window.campaignFixture.set(options), options);
  const unit = page.locator('[data-vehicle-comparison="unit"]'), suspect = page.locator('[data-vehicle-comparison="suspect"]');
  for (let stage = 0; stage < 10; stage++) {
    await set({ stage, vehicleBodyId: 'patrol' });
    const profile = await page.evaluate(stage => { const f = window.campaignFixture; return f.profile(f.catalog.getCampaignTarget(f.catalog.CAMPAIGN_DISPATCHES[stage].targetId).vehicleBodyId); }, stage);
    await expect(suspect).toContainText(profile.name);
    await expect(suspect).toContainText(`${profile.maxHealth} HP`);
    await expect(suspect).toContainText(`${Math.round(profile.topSpeed * 3.6)} KM/H`);
    await expect(suspect.getByRole('meter', { name: 'Suspect acceleration' })).toHaveAttribute('value', String(Math.min(1, profile.acceleration / 24)));
  }
  await set({ stage: 3, vehicleBodyId: 'patrol', suspectMaxHealth: 180 });
  await expect(suspect).toContainText('180 HP');
  await set({ stage: 3, vehicleBodyId: 'patrol' });
  await expect(unit).toContainText('100 HP'); await expect(unit).toContainText('86 KM/H');
  await page.evaluate(() => { Math.random = () => .5; });
  await page.getByRole('button', { name: 'REASSIGN VEHICLE' }).click();
  const selected = await page.evaluate(() => { const f = window.campaignFixture; return f.profile(f.ui.getVehicle()); });
  await expect(unit).toContainText(`${selected.maxHealth} HP`);
  await set({ stage: 3, vehicleBodyId: selected.id });
  mkdirSync('work', { recursive: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1100, height: 760 }, { width: 960, height: 640 }, { width: 520, height: 760 }, { width: 390, height: 844 }, { width: 740, height: 420 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => {
      const comparison = document.querySelector('.fo-garage'), briefing = document.querySelector('.fo-campaign-briefing');
      const a = comparison.getBoundingClientRect(), b = briefing.getBoundingClientRect();
      const portrait = briefing.querySelector('.fo-campaign-portrait').getBoundingClientRect(), scroll = briefing.querySelector('.fo-campaign-scroll').getBoundingClientRect();
      return { fits: a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= innerHeight && comparison.scrollWidth <= comparison.clientWidth,
        overlaps: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
        portraitVisible: portrait.top >= scroll.top && portrait.bottom <= scroll.bottom };
    }), `${viewport.width}x${viewport.height}`).toEqual({ fits: true, overlaps: false, portraitVisible: true });
    for (const card of [unit, suspect]) {
      await expect(card).toBeVisible(); expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await card.locator('h2').evaluate(node => node.scrollWidth <= node.clientWidth), 'Vehicle titles fit their cards').toBe(true);
      for (const meter of await card.getByRole('meter').all()) await expect(meter).toBeInViewport();
    }
    await expect(page.getByRole('button', { name: 'START DISPATCH' })).toBeInViewport();
    if (process.env.CAPTURE_UI) await page.screenshot({ path: `work/briefing-fixture-${viewport.width}x${viewport.height}.png` });
  }
  await page.setViewportSize({ width: 960, height: 640 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await set({ stage: 3, phase: 'playing' }); await set({ stage: 3, phase: 'lobby' });
  const briefing = page.getByRole('region', { name: 'Campaign dispatch briefing' });
  const duration = await briefing.evaluate(node => parseFloat(getComputedStyle(node).animationDuration));
  expect(duration).toBeGreaterThan(0); expect(duration).toBeLessThanOrEqual(.24);
  await expect.poll(() => briefing.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
  await set({ stage: 3 });
  expect(await briefing.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(briefing).toHaveCSS('animation-name', 'none'); await expect(page.locator('.fo-garage')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
  await page.getByRole('checkbox', { name: 'Reduce camera shake' }).check();
  await page.getByRole('button', { name: 'SAVE & BACK' }).click();
  await expect(briefing).toHaveCSS('animation-name', 'none'); await expect(page.locator('.fo-garage')).toHaveCSS('animation-name', 'none');
  // Check pointer activation independently of WebGL frame scheduling, under live-style updates.
  await page.evaluate(() => {
    const f = window.campaignFixture; f.ui.setSettings({ reducedShake: false }); f.set({ stage: 3, phase: 'playing' }); f.ui.showMenu('pause');
    const timer = setInterval(() => {
      if (document.querySelector('.fo-home').hidden) f.set({ stage: 3, phase: 'playing' });
      else clearInterval(timer);
    }, 50);
  });
  await page.getByRole('button', { name: 'END PATROL' }).click({ timeout: 3000 });
  await expect(page.getByRole('heading', { name: "You're on duty." })).toBeVisible();
  expect(errors).toEqual([]);
  console.log('Mocked briefing: ten suspect profiles, reassignment stats, six layouts and quick/reduced animations passed.');
} finally { await browser.close(); await server.close(); }
