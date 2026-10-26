import { dispatchFixture, expect, test } from './fixtures';

test('volume knob clicks mute, drags change volume, keyboard works and reload preserves the level', async ({ page }) => {
  await page.goto('/');
  const knob = page.getByRole('button', { name: /^Mute audio/ });
  await expect(knob).toBeVisible();
  await knob.click();
  const unmute = page.getByRole('button', { name: /^Unmute audio/ });
  await expect(unmute).toHaveAttribute('aria-pressed', 'true');
  await unmute.click(); await knob.focus(); await page.keyboard.press('ArrowDown');
  await expect(knob).toHaveAttribute('aria-label', 'Mute audio. Volume 65 percent.');
  const box = (await knob.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 36, { steps: 6 }); await page.mouse.up();
  await expect(knob).toHaveAttribute('aria-label', 'Mute audio. Volume 35 percent.');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Mute audio/ })).toHaveAttribute('aria-label', 'Mute audio. Volume 35 percent.');
  await page.getByRole('button', { name: /^Mute audio/ }).click(); await page.reload();
  await expect(page.getByRole('button', { name: /^Unmute audio/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Unmute audio/ }).click();
  await page.getByRole('button', { name: 'SETTINGS & CONTROLS' }).click();
  await expect(page.getByRole('slider', { name: 'Master volume', exact: true })).toHaveValue('0.35');
});

test.describe('touch audio control', () => {
  test.use({ hasTouch: true });
  test('small-screen knob supports tapping and captured touch dragging without covering controls', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 667 }); await page.goto('/');
    const knob = page.locator('[data-audio-control]');
    await expect(knob).toBeVisible();
    await page.screenshot({ path: 'work/volume-title-375x667.png' });
    await knob.tap(); await expect(knob).toHaveAttribute('aria-pressed', 'true');
    await knob.tap(); await expect(knob).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'HIT THE STREETS' }).tap(); await dispatchFixture(page, 2);
    await page.getByRole('button', { name: 'START DISPATCH' }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase)).toBe('playing');
    const box = (await knob.boundingBox())!, cdp = await context.newCDPSession(page);
    const finger = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...finger, y: finger.y + 24 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(knob).toHaveAttribute('aria-label', 'Mute audio. Volume 50 percent.');
    await expect(page.getByRole('region', { name: 'Touch driving controls' })).toBeVisible();
    for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 290 }]) {
      await page.setViewportSize(viewport);
      expect(await knob.evaluate(node => {
        const a = node.getBoundingClientRect();
        return a.width >= 44 && a.height >= 44 && a.x >= 0 && a.y >= 0 && a.right <= innerWidth && a.bottom <= innerHeight &&
          ![...document.querySelectorAll('.fo-touch-controls button,[data-action="pause"],.fo-instruments,.fo-round')].some(other => {
            const b = other.getBoundingClientRect(); return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
          });
      })).toBe(true);
    }
    await page.screenshot({ path: 'work/volume-driving-667x290.png' });
  });
});
