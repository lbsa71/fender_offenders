import { expect, test } from './fixtures';
import { createTcpProxy } from '../integration/tcp-proxy';
import { predictVehicle } from '@fender/sim';
import { districtMap } from '@fender/content';
import { getDispatchFeatures, type InputCommand, type LocalAuthorityState } from '@fender/contracts';
import { summarizeMotion, type MotionSample } from '../support/motion-trace';

test('steering press and release follow direct local physics through jitter and a 650ms TCP stall', async ({page})=>{
  test.setTimeout(60000);
  const serverPort=Number(process.env.FENDER_E2E_SERVER_PORT??2867),proxyPort=serverPort+4;
  const profile={oneWayLatencyMs:80,jitterMs:50,stallAtMs:undefined as number|undefined,stallDurationMs:650},began=performance.now();
  const proxy=await createTcpProxy(proxyPort,serverPort,profile);
  // Read the actual commands and frames once, without changing their results.
  await page.route('**/packages/net-client/src/index.ts*',async route=>{
    const response=await route.fetch(),source=await response.text();expect(source).toContain('return api;');
    await route.fulfill({response,body:source.replace('return api;',`{
      window.__FO_DRIVER__=api; window.__FO_STEERING__=null;
      const submit=api.submit,sample=api.sampleFrame;
      api.submit=function(...args){const trace=window.__FO_STEERING__;if(trace)trace.commands.push({at:performance.now(),logical:args[1],command:structuredClone(args[0])});return submit.apply(this,args);};
      api.sampleFrame=function(...args){const frame=sample.apply(this,args),trace=window.__FO_STEERING__,state=api.getSnapshot();
        if(trace&&frame&&state?.local){const car=frame.vehicles.find(car=>car.entityId===frame.localEntityId);trace.frames.push({at:performance.now(),sampleAt:frame.sampleTimeSeconds*1000,pose:{...car.pose},velocity:{...car.velocity},life:car.discontinuityId,pending:api.getStats().pendingInputs});}return frame;};
    } return api;`)});
  });
  await page.addInitScript(({serverPort,proxyPort})=>{
    localStorage.setItem('fender-garage-v1',JSON.stringify({vehicleBodyId:'patrol'}));
    localStorage.setItem('fender-settings-v1',JSON.stringify({quality:'low',controlScheme:'keyboard'}));
    const NativeWebSocket=window.WebSocket;
    window.WebSocket=class extends NativeWebSocket{constructor(url:string|URL,protocols?:string|string[]){const target=new URL(String(url));if(target.hostname==='127.0.0.1'&&target.port===String(serverPort))target.port=String(proxyPort);super(target,protocols);}};
  },{serverPort,proxyPort});
  try{
    await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await page.getByRole('button',{name:'START DISPATCH'}).click();
    await page.waitForFunction(()=>(window as any).__FENDER_DEBUG__?.snapshot?.phase==='playing'&&(window as any).__FENDER_DEBUG__.input.focused);
    await page.waitForTimeout(250);
    await page.evaluate(()=>{const driver=(window as any).__FO_DRIVER__;(window as any).__FO_STEERING__={initial:structuredClone(driver.getSnapshot().local),commands:[],frames:[]};});
    await page.keyboard.down('w');profile.stallAtMs=performance.now()-began+500;await page.waitForTimeout(500);
    for(const key of ['d','a','d','a']){await page.keyboard.down(key);await page.waitForTimeout(120);await page.keyboard.up(key);await page.waitForTimeout(600);}
    await page.keyboard.up('w');await page.waitForTimeout(200);
    const trace:{initial:LocalAuthorityState;commands:{at:number;logical:number;command:InputCommand}[];frames:{at:number;sampleAt:number;pose:{yaw:number};velocity:{yawRate:number};life:number;pending:number}[]}=await page.evaluate(()=>(window as any).__FO_STEERING__);
    let expected=structuredClone(trace.initial),cursor=0,lastLogical=0;
    const errors=trace.frames.map(frame=>{
      while(cursor<trace.commands.length&&trace.commands[cursor]!.at<=frame.at){const item=trace.commands[cursor++]!;expected={...expected,...predictVehicle(districtMap,expected.vehicle,expected.driver,item.command.actions,[],undefined,(expected.driver.simulatedTick??0)+1,getDispatchFeatures(0))};lastLogical=item.logical;}
      const dt=Math.max(0,Math.min(.05,(frame.sampleAt-lastLogical)/1000));
      return {yaw:Math.abs(Math.atan2(Math.sin(frame.pose.yaw-expected.vehicle.pose.yaw-expected.vehicle.velocity.yawRate*dt),Math.cos(frame.pose.yaw-expected.vehicle.pose.yaw-expected.vehicle.velocity.yawRate*dt))),rate:Math.abs(frame.velocity.yawRate-expected.vehicle.velocity.yawRate)};
    });
    await test.info().attach('Direct local steering versus actual networked frames',{body:JSON.stringify({trace,errors}),contentType:'application/json'});
    expect(trace.frames.length).toBeGreaterThan(60);
    expect(Math.max(...trace.frames.map(frame=>frame.pending))).toBeGreaterThan(6);
    expect(new Set(trace.frames.map(frame=>frame.life)).size,'This steering trace must avoid actual collision/reset interventions').toBe(1);
    expect(Math.max(...errors.map(error=>error.rate)),'Network traffic must not restore old steering into the local controller').toBeLessThan(.000001);
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
    const room = new URL(page.url()).searchParams.get('room')!;
    expect((await page.request.post(`http://127.0.0.1:${serverPort + 1000}/room/${room}/drive/0`)).status()).toBe(204);
    await page.waitForFunction(() => {
      const state = (window as any).__FENDER_DEBUG__?.snapshot;
      return state?.local?.vehicle.pose.z < -150 && state.vehicles.length === 2;
    });
    await page.keyboard.down('w'); await page.waitForTimeout(1000);
    const began = await page.evaluate(() => performance.now());
    await page.waitForFunction(began => {
      const samples = (window as any).__FO_MOTION__.filter((sample: { sampleAt: number }) => sample.sampleAt >= began);
      const useful = samples.slice(1).filter((sample: { sampleAt: number }, index: number) => {
        const dt = sample.sampleAt - samples[index].sampleAt; return dt > 0 && dt < 50;
      });
      return useful.length >= 90 && samples.at(-1).sampleAt - began >= 2000;
    }, began, { timeout: 10000 });
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
