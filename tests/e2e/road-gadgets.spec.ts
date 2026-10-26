import { dispatchFixture, expect, test } from './fixtures';

for (const [stage, kind, description] of [[5, 'oil', 'Suspect oil'], [6, 'blades', 'Amber hubcaps']] as const) {
  test(`dispatch ${stage + 1} explains ${kind} and renders its authoritative warning and active phase`, async ({ page }, testInfo) => {
    await page.goto('/'); await page.getByRole('button', { name: 'HIT THE STREETS' }).click(); await dispatchFixture(page, stage);
    await expect(page.locator('[data-tutorial-lesson] p')).toContainText(description);
    await expect(page.locator('[data-tutorial-lesson] p')).toContainText(kind==='oil'?'steer around':'Give them room');
    await page.getByRole('button', { name: 'START DISPATCH' }).click();
    await page.waitForFunction(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase === 'playing' && (window as any).__FENDER_DEBUG__.input.focused);
    const room = new URL(page.url()).searchParams.get('room')!, port = Number(process.env.FENDER_E2E_SERVER_PORT ?? 2867) + 1000;
    expect((await page.request.post(`http://127.0.0.1:${port}/room/${room}/gadget/${stage}`)).ok()).toBe(true);
    const metric = kind === 'oil' ? 'oilSlicks' : 'wheelBladeWarnings';
    await expect.poll(() => page.evaluate(metric => (window as any).__FENDER_DEBUG__.stats.renderer[metric], metric)).toBe(1);
    await page.screenshot({ path: testInfo.outputPath(`${kind}-warning.png`) });
    if (kind === 'blades') await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__.stats.renderer.wheelBlades)).toBe(1);
    else await expect.poll(() => page.evaluate(() => { const state = (window as any).__FENDER_DEBUG__.snapshot; return state.gadgets?.some((g: any) => g.kind === 'oil' && state.serverTick >= g.activeAtTick); })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${kind}-active.png`) });
    expect(await page.evaluate(() => (window as any).__FENDER_DEBUG__.snapshot.campaign.outcomes.length)).toBe(stage);
    await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'CONTROLS HELP', exact: true }).click();
    await expect(page.locator('.fo-help-view [data-control-lesson]')).toContainText(kind === 'oil' ? 'grip' : 'side clearance');
  });
}
