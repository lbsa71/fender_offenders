import { test, expect } from './fixtures';

test('native patrol audio plays in a live room, silences on pause, and resumes without another download', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      override createDynamicsCompressor() {
        const compressor = super.createDynamicsCompressor(), analyser = this.createAnalyser();
        analyser.fftSize = 1024; compressor.connect(analyser);
        (window as any).audioProbe = analyser;
        return compressor;
      }
    };
  });
  let downloads = 0;
  page.on('response', response => { if (/\/patrol\/.*\.wav/.test(response.url()) && response.ok()) downloads++; });
  await page.goto('/');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.getByRole('button', { name: 'START DISPATCH' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase)).toBe('playing');
  const peak = () => page.evaluate(() => {
    const analyser = (window as any).audioProbe as AnalyserNode | undefined;
    if (!analyser) return -1;
    const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
    return Math.max(...samples.map(Math.abs));
  });
  await expect.poll(peak).toBeGreaterThan(.005);
  expect(downloads).toBe(38);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'BACK ON PATROL' })).toBeVisible();
  await expect.poll(peak).toBeLessThan(.00001);
  await page.getByRole('button', { name: 'BACK ON PATROL' }).click();
  await expect.poll(peak).toBeGreaterThan(.005);
  expect(downloads).toBe(38);
});
