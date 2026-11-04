import { configureGameContext, expect, test } from './fixtures';
import { chromium } from '@playwright/test';

test('starts title music on load when the browser allows autoplay', async ({baseURL})=>{
  const launch=test.info().project.use.launchOptions;
  const browser=await chromium.launch({...launch,args:[...(launch?.args??[]),'--autoplay-policy=no-user-gesture-required']});
  try{
    const context=await browser.newContext();await configureGameContext(context);
    const page=await context.newPage();await page.goto(baseURL!);
    await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.music.tracks.some((t:any)=>t.kind==='title'&&t.playing&&t.volume>0))).toBe(true);
    await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.music.needsActivation)).toBe(false);
    await expect(page.getByRole('button',{name:'PLAY TITLE MUSIC'})).toBeHidden();
  }finally{await browser.close();}
});

test('title chase animates, offers blocked audio activation, and respects reduced motion', async ({page})=>{
  await page.addInitScript(()=>{
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){return navigator.userActivation.hasBeenActive?play.call(this):Promise.reject(new Error('Gesture required'));};
  });
  await page.goto('/');
  await expect(page.locator('.fo-title-chase')).toBeVisible();
  await expect(page.getByRole('heading',{name:'FENDER OFFENDERS',exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('.fo-title-chase').evaluate(n=>n.getAnimations({subtree:true}).some(a=>a.playState==='running'))).toBe(true);
  const play=page.getByRole('button',{name:'PLAY TITLE MUSIC'});await expect(play).toBeVisible();await play.click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.music.tracks.some((t:any)=>t.kind==='title'&&t.playing&&t.volume>0))).toBe(true);
  await expect(play).toBeHidden();
  for(const size of [{width:1440,height:900},{width:375,height:667},{width:667,height:290}]){
    await page.setViewportSize(size);await expect(page.getByRole('button',{name:'HIT THE STREETS'})).toBeInViewport();
    await page.screenshot({path:test.info().outputPath(`title-${size.width}.png`)});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>page.locator('.fo-title-chase').evaluate(n=>n.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
  await page.getByRole('button',{name:'HIT THE STREETS'}).click();
  await expect(page.locator('.fo-title-chase')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.music.screen)).toBe('briefing');
  await expect.poll(()=>page.evaluate(()=>(window as any).__FENDER_DEBUG__?.stats.music.tracks.some((t:any)=>t.kind==='title'&&t.playing&&t.volume>0))).toBe(true);
});
