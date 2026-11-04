import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createTcpProxy } from '../integration/tcp-proxy';
import { compareSteeringTrace, type SteeringTrace } from '../support/steering-trace';
import { summarizeMotion, type MotionSample } from '../support/motion-trace';

// These checks measure input/network behavior, not software-GPU throughput.
test.use({ viewport: { width: 640, height: 360 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: 'patrol' }));
    const existing = JSON.parse(localStorage.getItem('fender-settings-v1') ?? '{}');
    localStorage.setItem('fender-settings-v1', JSON.stringify({ ...existing, quality: 'low', controlScheme: 'keyboard' }));
  });
});

async function clearDrivingLane(page: Page, relocate = true) {
  const room = new URL(page.url()).searchParams.get('room')!;
  const port = Number(process.env.FENDER_E2E_SERVER_PORT ?? 2867) + 1000;
  expect((await page.request.post(`http://127.0.0.1:${port}/room/${room}/drive/${relocate ? 0 : 1}`)).status()).toBe(204);
  await page.waitForFunction(relocate => {
    const state = (window as any).__FENDER_DEBUG__?.snapshot;
    return state?.local && (!relocate || state.local.vehicle.pose.z < -150) && state.vehicles.length === 2;
  }, relocate);
  // Drain commands from before fixture synchronization before observation.
  const ack = await page.evaluate(() => (window as any).__FENDER_DEBUG__.snapshot.local.lastConsumedSequence);
  await page.waitForFunction(ack => (window as any).__FENDER_DEBUG__.snapshot.local.lastConsumedSequence >= ack + 8, ack);
}

for(const dispatch of [1,9])for(const forceResync of [false,true])test(`steering press and release in dispatch ${dispatch} follow direct local physics through jitter and a 650ms TCP stall${forceResync ? ' and an explicit full resync' : ''}`, async ({page})=>{
  test.setTimeout(60000);
  // Keep winter raster work bounded alongside the intentional TCP stall.
  if (dispatch === 9) await page.setViewportSize({ width: 320, height: 240 });
  const serverPort=Number(process.env.FENDER_E2E_SERVER_PORT??2867),proxyPort=serverPort+4;
  const profile={oneWayLatencyMs:80,jitterMs:50,stallAtMs:undefined as number|undefined,stallDurationMs:650},began=performance.now();
  const proxy=await createTcpProxy(proxyPort,serverPort,profile);
  // Read the actual commands and frames once, without changing their results.
  await page.route('**/packages/net-client/src/index.ts*',async route=>{
    const response=await route.fetch(),source=await response.text();expect(source).toContain('return api;');
    await route.fulfill({response,body:source.replace('return api;',`{
      window.__FO_DRIVER__=api; window.__FO_STEERING__=null;
      const submit=api.submit,sample=api.sampleFrame;
      api.submit=function(...args){
        const trace=window.__FO_STEERING__,before=api.getStats().pendingInputs,at=performance.now(),result=submit.apply(this,args);
        if(trace){const item={order:trace.nextOrder++,at,logical:args[1],command:structuredClone(args[0])};
          if(api.getStats().pendingInputs===before+1)trace.commands.push(item);else trace.dropped.push(item);
        }return result;
      };
      api.onSnapshot(state=>{const trace=window.__FO_STEERING__;if(trace&&state.local)trace.snapshots.push({order:trace.nextOrder++,at:performance.now(),predictionAt,local:structuredClone(state.local),resetReason:state.resetReason,corrections:api.getStats().corrections});});
      api.sampleFrame=function(...args){const frame=sample.apply(this,args),trace=window.__FO_STEERING__,state=api.getSnapshot();
        if(trace&&frame&&state?.local){const car=frame.vehicles.find(car=>car.entityId===frame.localEntityId);trace.frames.push({order:trace.nextOrder++,at:performance.now(),sampleAt:frame.sampleTimeSeconds*1000,pose:{...car.pose},velocity:{...car.velocity},life:car.discontinuityId,pending:api.getStats().pendingInputs,contactRevision:state.local.contact?.revision??0,corrections:api.getStats().corrections});}return frame;};
    } return api;`)});
  });
  await page.addInitScript(({serverPort,proxyPort,winter})=>{
    localStorage.setItem('fender-garage-v1',JSON.stringify({vehicleBodyId:'patrol'}));
    localStorage.setItem('fender-settings-v1',JSON.stringify({quality:'low',controlScheme:'keyboard',reducedShake:winter}));
    const NativeWebSocket=window.WebSocket;
    window.WebSocket=class extends NativeWebSocket{constructor(url:string|URL,protocols?:string|string[]){const target=new URL(String(url));if(target.hostname==='127.0.0.1'&&target.port===String(serverPort))target.port=String(proxyPort);super(target,protocols);}};
  },{serverPort,proxyPort,winter:dispatch===9});
  try{
    await page.goto(`/?debugDispatch=${dispatch}`);await page.getByRole('button',{name:'HIT THE STREETS'}).click();await page.getByRole('button',{name:'START DISPATCH'}).click();
    await page.waitForFunction(()=>(window as any).__FENDER_DEBUG__?.snapshot?.phase==='playing'&&(window as any).__FENDER_DEBUG__.input.focused);
    await clearDrivingLane(page);
    await page.waitForTimeout(250);
    await page.evaluate(()=>{const driver=(window as any).__FO_DRIVER__;(window as any).__FO_STEERING__={initial:structuredClone(driver.getSnapshot().local),initialCorrections:driver.getStats().corrections,nextOrder:0,snapshots:[],reducedShake:JSON.parse(localStorage.getItem('fender-settings-v1')??'{}').reducedShake,snowflakes:(window as any).__FENDER_DEBUG__.stats.renderer.snowflakes,surface:{width:innerWidth,height:innerHeight,canvasWidth:document.querySelector('canvas')?.width,canvasHeight:document.querySelector('canvas')?.height},commands:[],dropped:[],frames:[]};});
    await page.keyboard.down('w');profile.stallAtMs=performance.now()-began+500;await page.waitForTimeout(500);
    if(forceResync)await page.evaluate(()=>(window as any).__FO_DRIVER__.request('resync'));
    for(const key of ['d','a','d','a']){await page.keyboard.down(key);await page.waitForTimeout(120);await page.keyboard.up(key);await page.waitForTimeout(600);}
    await page.keyboard.up('w');await page.waitForTimeout(200);
    const trace: SteeringTrace & { reducedShake?: boolean; snowflakes: number } = await page.evaluate(()=>(window as any).__FO_STEERING__);
    const errors = compareSteeringTrace(trace, dispatch);
    const tracePath = test.info().outputPath('steering-trace.json');
    await writeFile(tracePath, JSON.stringify({trace,errors}));
    await test.info().attach('Direct local steering versus actual networked frames',{path:tracePath,contentType:'application/json'});
    if (dispatch === 9) { expect(trace.reducedShake).toBe(true); expect(trace.snowflakes).toBe(0); }
    if(forceResync)expect(trace.snapshots.some(s=>s.resetReason==='resync'&&s.corrections>trace.initialCorrections),'The real server must deliver a full resync baseline').toBe(true);
    expect(Math.max(...errors.map(error=>error.unexpectedCorrections)),'Ordinary snapshots must never reset local steering').toBe(0);
    expect(trace.frames.length).toBeGreaterThan(60);
    expect(Math.max(...trace.frames.map(frame=>frame.pending))).toBeGreaterThan(6);
    if(!forceResync)expect(new Set(trace.frames.map(frame=>frame.life)).size,'This steering trace must avoid actual collision/life interventions').toBe(1);
    expect(Math.max(...errors.map(error=>error.unexpectedLifeChanges)),'Every rendered life must match its declared baseline').toBe(0);
    expect(Math.max(...errors.map(error=>error.rate)),'Ordinary snapshots must not restore old steering between explicit full resyncs').toBeLessThan(.000001);
    expect(Math.max(...errors.map(error=>error.yaw)),'Network traffic must not add a delayed visual turn after release').toBeLessThan(.001);
  }finally{await page.keyboard.up('w');await proxy.dispose();}
});

test('keeps solo driving commands and prediction steady when rendering drops to five frames per second', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: 'patrol' }));
    const raf = window.requestAnimationFrame.bind(window);
    // Slow presentation without blocking timers or simulating a network outage.
    // A driver's input clock must remain independent from the graphics clock.
    window.requestAnimationFrame = callback => window.setTimeout(() => raf(callback), 200);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
  await page.getByRole('button', { name: 'START DISPATCH' }).click();
  await page.waitForFunction(() => {
    const debug = (window as any).__FENDER_DEBUG__;
    return debug?.snapshot?.phase === 'playing' && document.querySelector('.fo-hud')?.getAttribute('hidden') === null && debug.input.focused;
  });
  await clearDrivingLane(page, false);
  await page.waitForTimeout(250);
  await page.keyboard.down('w');
  try {
    const start = await page.evaluate(() => {
      const debug = (window as any).__FENDER_DEBUG__;
      return { tick: debug.snapshot.serverTick, ack: debug.snapshot.local.lastConsumedSequence, pose: debug.snapshot.local.vehicle.pose };
    });
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => {
      const debug = (window as any).__FENDER_DEBUG__;
      return { tick: debug.snapshot.serverTick, ack: debug.snapshot.local.lastConsumedSequence, pose: debug.snapshot.local.vehicle.pose, stats: debug.stats.network, paused: debug.snapshot.paused };
    });
    await test.info().attach('Solo driving clock', { body: JSON.stringify({ start, after }), contentType: 'application/json' });
    expect(after.paused).toBe(false);
    expect(after.tick - start.tick).toBeGreaterThan(100);
    expect(after.ack - start.ack, 'Rendering at 5 fps must not throttle input delivery to 20 commands per second').toBeGreaterThan(100);
    expect(Math.hypot(after.pose.x - start.pose.x, after.pose.z - start.pose.z)).toBeGreaterThan(20);
    expect(after.stats.maxCorrection, 'A straight solo drive must not repeatedly jump several metres').toBeLessThan(1.5);
  } finally { await page.keyboard.up('w'); }
});

test('keeps a solo chase steady through ordered network delay and jitter', async ({ page }) => {
  test.setTimeout(60000);
  const serverPort = Number(process.env.FENDER_E2E_SERVER_PORT ?? 2867), proxyPort = serverPort + 2;
  const proxy = await createTcpProxy(proxyPort, serverPort, { oneWayLatencyMs: 45, jitterMs: 35 });
  await page.addInitScript(({ serverPort, proxyPort }) => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const target = new URL(String(url));
        if (target.hostname === '127.0.0.1' && target.port === String(serverPort)) target.port = String(proxyPort);
        super(target, protocols);
      }
    };
  }, { serverPort, proxyPort });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
    await page.getByRole('button', { name: 'START DISPATCH' }).click();
    await page.waitForFunction(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase === 'playing' && (window as any).__FENDER_DEBUG__.input.focused);
    await clearDrivingLane(page, false);
    const endpoint = process.env.TEST_SERVER_URL!;
    const beforeHealth = await (await page.request.get(`${endpoint}/health`)).json();
    const start = await page.evaluate(() => (window as any).__FENDER_DEBUG__.snapshot.local.vehicle.pose);
    await page.keyboard.down('w');
    await page.waitForTimeout(3000);
    await page.keyboard.up('w');
    const after = await page.evaluate(() => {
      const debug = (window as any).__FENDER_DEBUG__;
      return { pose: debug.snapshot.local.vehicle.pose, stats: debug.stats.network };
    });
    const afterHealth = await (await page.request.get(`${endpoint}/health`)).json();
    await test.info().attach('Ordered input jitter', { body: JSON.stringify({ start, after, beforeHealth, afterHealth }), contentType: 'application/json' });
    expect(afterHealth.queueResets - beforeHealth.queueResets, 'Ordinary packet batching must not repeatedly reset the patrol car').toBe(0);
    expect(Math.hypot(after.pose.x - start.x, after.pose.z - start.z)).toBeGreaterThan(30);
    expect(after.stats.maxCorrection).toBeLessThan(3);
  } finally { await proxy.dispose(); }
});

test('renders local driving between input ticks through jitter without waiting for acknowledged poses', async ({ page }) => {
  test.setTimeout(60000);
  // This observer needs sub-50ms frame pairs; bound real raster work accordingly.
  await page.setViewportSize({ width: 320, height: 240 });
  const serverPort = Number(process.env.FENDER_E2E_SERVER_PORT ?? 2867), proxyPort = serverPort + 3;
  const proxy = await createTcpProxy(proxyPort, serverPort, { oneWayLatencyMs: 80, jitterMs: 50 });
  // Observe the frame already handed to the renderer. Do not sample twice or
  // replace input, physics, clocks, snapshots or rendering with a test adapter.
  await page.route('**/packages/net-client/src/index.ts*', async route => {
    const response = await route.fetch(), source = await response.text();
    expect(source).toContain('return api;');
    const observer = `{
      const sample = api.sampleFrame;
      window.__FO_MOTION__ = [];
      api.sampleFrame = function(...args) {
        const frame = sample.apply(this, args), state = api.getSnapshot();
        const car = frame?.vehicles.find(car => car.entityId === frame.localEntityId);
        if (car && state?.phase === 'playing') window.__FO_MOTION__.push({ at: performance.now(), sampleAt: frame.sampleTimeSeconds * 1000, z: car.pose.z, ack: state.local.lastConsumedSequence, pending: api.getStats().pendingInputs });
        return frame;
      };
    } return api;`;
    await route.fulfill({ response, body: source.replace('return api;', observer) });
  });
  await page.addInitScript(({ serverPort, proxyPort }) => {
    localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: 'patrol' }));
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const target = new URL(String(url));
        if (target.hostname === '127.0.0.1' && target.port === String(serverPort)) target.port = String(proxyPort);
        super(target, protocols);
      }
    };
  }, { serverPort, proxyPort });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'HIT THE STREETS' }).click();
    await page.getByRole('button', { name: 'START DISPATCH' }).click();
    await page.waitForFunction(() => (window as any).__FENDER_DEBUG__?.snapshot?.phase === 'playing' && (window as any).__FENDER_DEBUG__.input.focused);
    await clearDrivingLane(page);
    await page.keyboard.down('w'); await page.waitForTimeout(1000);
    const began = await page.evaluate(() => performance.now());
    await page.waitForFunction(began => {
      const samples = (window as any).__FO_MOTION__.filter((sample: { sampleAt: number }) => sample.sampleAt >= began);
      const useful = samples.slice(1).filter((sample: { sampleAt: number }, index: number) => {
        const dt = sample.sampleAt - samples[index].sampleAt; return dt > 0 && dt < 50;
      });
      return useful.length >= 90 && samples.at(-1).sampleAt - began >= 2000;
    }, began, { timeout: 10000 }).catch(async error => {
      const samples = await page.evaluate(() => (window as any).__FO_MOTION__);
      await test.info().attach('Incomplete local render observation', { body: JSON.stringify(samples), contentType: 'application/json' });
      throw error;
    });
    await page.keyboard.up('w');
    const samples: MotionSample[] = await page.evaluate(began => (window as any).__FO_MOTION__.filter((sample: { sampleAt: number }) => sample.sampleAt >= began), began);
    const { steps, stalledFraction, maxBackwards, speedVariation, p95SpeedJump } = summarizeMotion(samples);
    await test.info().attach('Local render continuity through ordered jitter', { body: JSON.stringify({ samples, stalledFraction, maxBackwards, speedVariation, p95SpeedJump }), contentType: 'application/json' });
    expect(steps.length).toBeGreaterThan(60);
    expect(samples.at(-1)!.z - samples[0]!.z).toBeGreaterThan(25);
    expect(Math.max(...samples.map(sample => sample.pending)), 'The trace must exercise driving before server acknowledgement').toBeGreaterThan(6);
    expect(stalledFraction, 'The local car must keep moving between fixed input steps and delayed acknowledgements').toBeLessThan(.1);
    expect(maxBackwards).toBeLessThan(.1);
    expect(speedVariation, 'Smooth forward motion must not alternate between crawling and catching up each frame').toBeLessThan(.35);
    expect(p95SpeedJump, 'Routine snapshots must not create large frame-to-frame velocity changes').toBeLessThan(12);
  } finally { await page.keyboard.up('w'); await proxy.dispose(); }
});
