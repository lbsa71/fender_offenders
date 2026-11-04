import { expect, test } from './fixtures';

const fixtureUrl = `/@fs/${process.cwd().replaceAll('\\', '/')}/packages/ui/dev/campaign.html`;
test('Nico speaks once per screen, changes with the confirmed outcome and stops on dispatch', async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => Boolean((window as any).campaignFixture));
  const set = (options: Record<string, unknown>) => page.evaluate(options => (window as any).campaignFixture.set(options), options);
  await set({ stage: 0, phase: 'lobby', outcomes: [] });
  const quote = page.locator('.fo-campaign-briefing [data-suspect-quote]');
  await expect(quote).toHaveText('These meters pay better than your badge!');
  await page.locator('.fo-campaign-briefing [data-suspect-replay]').click();
  const audio = page.locator('audio[data-suspect-voice]');
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0 && a.duration > 0)).toBe(true);
  const source = await audio.getAttribute('src');
  await set({ stage: 0, phase: 'lobby', outcomes: [] });
  expect(await audio.getAttribute('src')).toBe(source);
  for (const outcome of ['escaped', 'wrecked', 'arrested']) {
    await set({ stage: 0, phase: 'results', outcomes: outcome === 'escaped' ? [] : [{ dispatchIndex: 0, outcome, playerId: 'backup', callsign: 'Parking Menace', elapsedTicks: 180 }] });
    await expect(audio).toHaveAttribute('src', `/voices/nico-nickel/${outcome}.mp3`);
    await expect(page.locator('.fo-campaign-resolution [data-suspect-quote]')).not.toBeEmpty();
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0 && a.error === null)).toBe(true);
  }
  await set({ stage: 0, phase: 'playing' });
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
});

test('speech respects mute, hidden screens and one playback per visit, with replay available', async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => Boolean((window as any).campaignFixture));
  await page.evaluate(() => {
    const f = (window as any).campaignFixture;
    f.set({ stage: 0, phase: 'lobby' });
    (window as any).voiceStarts = 0;
    document.querySelector('audio[data-suspect-voice]')!.addEventListener('play', () => (window as any).voiceStarts++);
  });
  await page.locator('.fo-campaign-briefing [data-suspect-replay]').click();
  const audio = page.locator('audio[data-suspect-voice]');
  await expect.poll(() => page.evaluate(() => (window as any).voiceStarts)).toBe(1);
  await page.evaluate(() => {
    const f = (window as any).campaignFixture;
    for (let i = 0; i < 12; i++) f.set({ stage: 0, phase: 'lobby' });
  });
  expect(await page.evaluate(() => (window as any).voiceStarts)).toBe(1);
  await page.evaluate(() => (window as any).campaignFixture.ui.setSettings({ muted: true }));
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused && a.muted)).toBe(true);
  await expect(page.locator('.fo-campaign-briefing [data-suspect-quote]')).toBeVisible();
  await page.evaluate(() => (window as any).campaignFixture.ui.setSettings({ muted: false }));
  await page.locator('.fo-campaign-briefing [data-suspect-replay]').click();
  await expect.poll(() => page.evaluate(() => (window as any).voiceStarts)).toBe(2);
  await page.evaluate(() => (window as any).campaignFixture.ui.showMenu('settings'));
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  await page.evaluate(() => (window as any).campaignFixture.ui.dispose());
  await expect(audio).toHaveCount(0);
});

test('all authored recordings decode in the browser', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto(fixtureUrl);
  const failures = await page.evaluate(async () => {
    const response = await fetch('/voices/manifest.json');
    const manifest = await response.json();
    const failures: { file: string; ready: boolean; duration: number; rms: number; error: number | null }[] = [];
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const audio = new Audio(); audio.preload = 'auto';
    for (const file of Object.keys(manifest)) {
      const ok = await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), 5000);
        audio.onloadeddata = () => { clearTimeout(timer); resolve(Number.isFinite(audio.duration) && audio.duration > .3 && audio.duration < 12); };
        audio.onerror = () => { if (audio.error) { clearTimeout(timer); resolve(false); } };
        audio.src = `/voices/${file}`; audio.load();
      });
      const buffer = await decoder.decodeAudioData(await (await fetch(`/voices/${file}`)).arrayBuffer());
      const samples = buffer.getChannelData(0);
      let energy = 0; for (const sample of samples) energy += sample * sample;
      const rms = Math.sqrt(energy / samples.length);
      if (!ok || rms <= .001) failures.push({ file, ready: ok, duration: audio.duration, rms, error: audio.error?.code ?? null });
      audio.onloadeddata = audio.onerror = null;
      audio.removeAttribute('src'); audio.load();
    }
    return { count: Object.keys(manifest).length, failures };
  });
  expect(failures.count).toBeGreaterThanOrEqual(400);
  expect(failures.failures).toEqual([]);
});

test('the real room briefing plays Nico and starting the pursuit stops his line', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.waitForFunction(() => Boolean((window as any).__FENDER_DEBUG__?.snapshot?.campaign));
  await page.evaluate(() => (window as any).__FENDER_DEBUG__.dispatch(1, 'green-light-racket-v1'));
  await expect(page.locator('.fo-campaign-briefing [data-suspect-quote]')).toHaveText('These meters pay better than your badge!');
  await page.locator('.fo-campaign-briefing [data-suspect-replay]').click();
  const audio = page.locator('audio[data-suspect-voice]');
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('nico-briefing.png') });
  await page.getByRole('button', { name: 'START DISPATCH', exact: false }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase)).not.toBe('lobby');
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
});

test('a retry gets a different line while routine snapshots and replay retain the current caption', async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => Boolean((window as any).campaignFixture));
  const set = (phase: string) => page.evaluate(phase => (window as any).campaignFixture.set({ stage: 0, phase, outcomes: [] }), phase);
  await set('lobby');
  const quote = page.locator('.fo-campaign-briefing [data-suspect-quote]');
  const first = await quote.textContent();
  await set('playing'); await set('lobby');
  await expect(quote).not.toHaveText(first!);
  const second = await quote.textContent();
  await set('lobby');
  await page.locator('.fo-campaign-briefing [data-suspect-replay]').click();
  await expect(quote).toHaveText(second!);
  await expect.poll(() => page.locator('audio[data-suspect-voice]').evaluate((audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0)).toBe(true);
});

test('a dispatch arriving while settings are open waits until visible and then loads its voice', async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => Boolean((window as any).campaignFixture));
  await page.evaluate(() => {
    const f = (window as any).campaignFixture;
    f.ui.showMenu('settings');
    f.set({ stage: 1, phase: 'lobby', outcomes: [] });
    f.ui.showMenu(null);
  });
  await page.locator('.fo-campaign-briefing [data-suspect-replay]').click();
  const audio = page.locator('audio[data-suspect-voice]');
  await expect(audio).toHaveAttribute('src', '/voices/mabel-clench/briefing.mp3');
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > 0)).toBe(true);
});

test('the longest available captions keep portraits, replay and dispatch actions usable on short screens', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(fixtureUrl);
  await page.waitForFunction(() => Boolean((window as any).campaignFixture));
  const picks = await page.evaluate(async url => {
    const { suspectVoices } = await import(url);
    const f = (window as any).campaignFixture;
    return ['briefing', 'escaped', 'wrecked', 'arrested'].map(variant => {
      const choices = f.catalog.STORYLINES.flatMap((story: any) => story.dispatches.flatMap((dispatch: any, stage: number) => suspectVoices(dispatch.targetId, variant).map((line: any) => ({ ...line, variant, stage, campaignId: story.id, count: suspectVoices(dispatch.targetId, variant).length }))));
      return choices.sort((a: any, b: any) => b.text.length - a.text.length)[0];
    });
  }, `/@fs/${process.cwd().replaceAll('\\', '/')}/packages/ui/src/suspect-voice.ts`);
  for (const viewport of [{ width: 390, height: 568 }, { width: 740, height: 420 }]) {
    await page.setViewportSize(viewport);
    for (const pick of picks) {
      await page.evaluate(pick => {
        const f = (window as any).campaignFixture;
        const panel = pick.variant === 'briefing' ? '.fo-campaign-briefing' : '.fo-campaign-resolution';
        const outcomes = pick.variant === 'briefing' || pick.variant === 'escaped' ? [] : [{ dispatchIndex: pick.stage, outcome: pick.variant, playerId: 'you', callsign: 'Officer Rookie', elapsedTicks: 180 }];
        for (let i = 0; i <= pick.count; i++) {
          f.set({ campaignId: pick.campaignId, stage: pick.stage, phase: 'playing', outcomes: [] });
          f.set({ campaignId: pick.campaignId, stage: pick.stage, phase: pick.variant === 'briefing' ? 'lobby' : 'results', outcomes });
          if (document.querySelector(`${panel} [data-suspect-quote]`)!.textContent === pick.text) break;
        }
      }, pick);
      const panel = page.locator(pick.variant === 'briefing' ? '.fo-campaign-briefing' : '.fo-campaign-resolution');
      await expect(panel.locator('[data-suspect-quote]')).toHaveText(pick.text);
      await expect(panel.locator('.fo-campaign-portrait')).toBeInViewport();
      await expect(page.getByRole('button', { name: pick.variant === 'briefing' ? /START DISPATCH/ : /NEXT BRIEFING|RETRY DISPATCH|ANOTHER CASE/ })).toBeInViewport();
      await panel.locator('[data-suspect-replay]').scrollIntoViewIfNeeded();
      await expect(panel.locator('[data-suspect-replay]')).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`longest-${pick.variant}-${viewport.width}.png`) });
    }
  }
});
