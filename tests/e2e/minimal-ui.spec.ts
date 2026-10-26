import {CAMPAIGN_DISPATCHES} from '@fender/contracts';
import {arrestFixture, expect, test} from './fixtures';

test('keeps the story and car choice without turning the briefing into a statistics page',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();
  const briefing=page.getByRole('region',{name:'Campaign dispatch briefing'});
  await expect(briefing.locator('[data-campaign-briefing]')).toHaveText(CAMPAIGN_DISPATCHES[0]!.briefing.replace(' Arrest him or wreck the getaway car.',''));
  await expect(briefing.locator('[data-campaign-name]')).toHaveText('Nico Nickel');
  await expect(page.locator('.fo-garage-stats,.fo-tactics-difficulty,.fo-campaign-tracker,.fo-campaign-casefile,.fo-campaign-roster')).toHaveCount(0);
  for(const size of [{width:960,height:640},{width:390,height:844},{width:740,height:420}]){
    await page.setViewportSize(size);
    await expect(page.getByRole('button',{name:'START DISPATCH'})).toBeInViewport();
    await expect(page.getByText('YOUR UNIT',{exact:true})).toBeInViewport();
    await expect(page.getByText('SUSPECT CAR',{exact:true})).toBeInViewport();
    await page.screenshot({path:test.info().outputPath(`quick-briefing-${size.width}.png`),animations:'disabled'});
  }
  const before=await page.locator('[data-text="vehicle-name"]').innerText();
  await page.getByRole('button',{name:'REASSIGN VEHICLE'}).click();
  await expect(page.locator('[data-text="vehicle-name"]')).not.toHaveText(before);
  await expect(page.locator('.fo-toast')).toBeHidden();
  await expect(page.locator('[data-text="vehicle-name"]')).toHaveAttribute('aria-live','polite');
});

test('keeps chase feedback clear without a leaderboard or campaign dashboard',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await page.getByRole('button',{name:'START DISPATCH'}).click();
  await expect(page.locator('[data-objective-title]')).toHaveText('APPREHEND NICO');
  await expect(page.locator('[data-objective-instruction]')).toContainText('3 seconds');
  await expect(page.locator('.fo-scoreboard,.fo-campaign-live,.fo-score-head,.fo-speed,.fo-arrest-label')).toHaveCount(0);
  await expect(page.locator('[data-tutorial-controls]')).not.toContainText('Arresting is automatic');
  await expect(page.locator('[data-text="ammo"]')).toBeHidden();
  await expect(page.locator('[data-text="timer"]')).toBeVisible();
  await expect(page.locator('.fo-health')).toBeVisible();
  await expect(page.getByRole('img',{name:/^Wanted suspect,/})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('quick-chase.png'),animations:'disabled'});
});

test('celebrates an arrest with one earned story beat and a clear next action',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await page.getByRole('button',{name:'START DISPATCH'}).click();
  await expect(page.locator('[data-objective-title]')).toBeVisible();await arrestFixture(page);
  await expect(page.getByText('ARREST CERTIFIED',{exact:true})).toBeVisible();
  await expect(page.locator('.fo-campaign-new-lead p')).toHaveText(CAMPAIGN_DISPATCHES[0]!.reveal);
  await expect(page.locator('.fo-results')).not.toContainText(CAMPAIGN_DISPATCHES[1]!.reveal);
  await expect(page.locator('.fo-results .fo-campaign-tracker,.fo-results .fo-campaign-casefile,[data-results],.fo-campaign-bosses')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'NEXT BRIEFING'})).toBeInViewport();
  await page.screenshot({path:test.info().outputPath('quick-result.png'),animations:'disabled'});
  await page.getByRole('button',{name:'NEXT BRIEFING'}).click();
  await expect(page.locator('[data-campaign-name]')).toHaveText('Mabel Clench');
});
