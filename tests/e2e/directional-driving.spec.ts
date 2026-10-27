import { expect, test } from './fixtures';

for(const device of ['touch','gamepad'] as const)test(`${device} holds a screen direction as the car turns, without steering forever`,async({page,context})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:740,height:580});
  await page.addInitScript(device=>{
    localStorage.setItem('fender-settings-v1',JSON.stringify({quality:'low',controlScheme:device}));
    const pad={id:'Directional browser pad',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});(window as any).directionPad=pad;
  },device);
  await page.route('**/packages/net-client/src/index.ts*',async route=>{
    const response=await route.fetch(),source=await response.text();
    await route.fulfill({response,body:source.replace('return api;',`window.directionSession=api;const originalSubmit=api.submit;api.submit=function(command,...args){window.directionActions=command.actions;return originalSubmit.call(this,command,...args);};return api;`)});
  });
  await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await page.getByRole('button',{name:'START DISPATCH'}).click();
  await page.waitForFunction(()=>(window as any).__FENDER_DEBUG__?.snapshot?.phase==='playing');
  const room=new URL(page.url()).searchParams.get('room')!,port=Number(process.env.FENDER_E2E_SERVER_PORT??2867);
  expect((await page.request.post(`http://127.0.0.1:${port+1000}/room/${room}/drive/0`)).ok()).toBe(true);
  await page.waitForFunction(()=>Math.abs((window as any).__FENDER_DEBUG__.snapshot.local.vehicle.pose.z+160)<1);
  const cdp=await context.newCDPSession(page);
  if(device==='touch'){
    const box=(await page.getByRole('button',{name:/^Drive: drag/}).boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:box.x+box.width*.9,y:box.y+box.height/2}]});
  }else await page.evaluate(()=>{(window as any).directionPad.axes=[1,0];});
  try{
    // East is a broad unobstructed avenue at the fixture; its camera-relative
    // heading is close to +X, rather than an ongoing right turn.
    await expect.poll(()=>page.evaluate(()=>Math.sin((window as any).__FENDER_DEBUG__.snapshot.local.vehicle.pose.yaw)),{timeout:10000}).toBeGreaterThan(.96);
    await expect.poll(()=>page.evaluate(()=>Math.abs((window as any).directionActions.steer)),{timeout:5000}).toBeLessThan(.15);
    await page.waitForTimeout(700);
    expect(await page.evaluate(()=>Math.sin((window as any).__FENDER_DEBUG__.snapshot.local.vehicle.pose.yaw))).toBeGreaterThan(.96);
    expect(await page.evaluate(()=>(window as any).directionActions.brakeReverse)).toBe(0);
    await page.screenshot({path:`work/directional-${device}.png`});
  }finally{
    if(device==='touch')await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else await page.evaluate(()=>{(window as any).directionPad.axes=[0,0];});
  }
  await expect.poll(()=>page.evaluate(()=>(window as any).directionActions.throttle)).toBe(0);
});
