import { expect, test } from './fixtures';
import { createTcpProxy } from '../integration/tcp-proxy';

test('keeps both cars stable while bumper pressure completes an arrest through network jitter',async({page})=>{
  test.setTimeout(60000);
  const serverPort=Number(process.env.FENDER_E2E_SERVER_PORT??2867),proxyPort=serverPort+5;
  const proxy=await createTcpProxy(proxyPort,serverPort,{oneWayLatencyMs:60,jitterMs:20});
  await page.route('**/packages/net-client/src/index.ts*',async route=>{
    const response=await route.fetch(),source=await response.text();expect(source).toContain('return api;');
    await route.fulfill({response,body:source.replace('return api;',`{
      const sample=api.sampleFrame;window.__FO_CONTACT__=null;
      api.sampleFrame=function(...args){const frame=sample.apply(this,args),state=api.getSnapshot(),trace=window.__FO_CONTACT__;
        if(trace&&frame&&state?.phase==='playing'){const car=frame.vehicles.find(v=>v.entityId===frame.localEntityId),target=frame.vehicles.find(v=>v.entityId===state.pursuit?.suspectId);
          if(car&&target)trace.push({at:performance.now(),z:car.pose.z,life:car.discontinuityId,targetLife:target.discontinuityId,health:car.health,contact:state.local.contact?.revision??0,corrections:api.getStats().corrections});}
        return frame;};window.__FO_CONTACT_API__=api;
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
    await page.waitForFunction(()=>(window as any).__FO_CONTACT_API__?.getSnapshot()?.phase==='playing');
    const room=new URL(page.url()).searchParams.get('room')!;
    expect((await page.request.post(`http://127.0.0.1:${serverPort+1000}/room/${room}/contact/0`)).ok()).toBe(true);
    await page.waitForFunction(()=>Math.abs((window as any).__FO_CONTACT_API__?.getSnapshot()?.local?.vehicle.pose.z+30)<1);
    // The forced teleport is a separate life. Drain its in-flight reports before
    // measuring ordinary contact, then retain the full three-second arrest window.
    const setupAck=await page.evaluate(()=>(window as any).__FO_CONTACT_API__.getSnapshot().local.lastConsumedSequence);
    await page.waitForFunction(ack=>(window as any).__FO_CONTACT_API__.getSnapshot().local.lastConsumedSequence>=ack+8,setupAck);
    expect((await page.request.post(`http://127.0.0.1:${serverPort+1000}/room/${room}/contact-ready/0`)).ok()).toBe(true);
    const initial=await page.evaluate(()=>{const api=(window as any).__FO_CONTACT_API__;(window as any).__FO_CONTACT__=[];return api.getStats().corrections;});
    await page.keyboard.down('w');await expect(page.getByText('ARREST CERTIFIED',{exact:true})).toBeVisible();await page.keyboard.up('w');
    const frames:{at:number;z:number;life:number;targetLife:number;health:number;contact:number;corrections:number}[]=await page.evaluate(()=>(window as any).__FO_CONTACT__);
    const backsteps=frames.slice(1).map((f,i)=>frames[i]!.z-f.z),maxBackstep=Math.max(...backsteps);
    await test.info().attach('Rendered bumper contact and arrest',{body:JSON.stringify({frames,maxBackstep}),contentType:'application/json'});
    console.log('Bumper trace',JSON.stringify({frames:frames.length,maxBackstep,contactRevisions:Math.max(...frames.map(f=>f.contact)),controllerResets:Math.max(...frames.map(f=>f.corrections))-initial}));
    expect(frames.length).toBeGreaterThan(60);expect(Math.max(...frames.map(f=>f.contact))).toBeGreaterThan(3);
    expect(Math.max(...frames.map(f=>f.corrections)),'Contact must not restart local driving').toBe(initial);
    expect(new Set(frames.map(f=>f.life)).size).toBe(1);expect(new Set(frames.map(f=>f.targetLife)).size).toBe(1);
    expect(Math.min(...frames.map(f=>f.health))).toBe(100);
    expect(maxBackstep,'Holding bumper contact must not jump back to older server poses').toBeLessThan(.2);
  }finally{await page.keyboard.up('w');await proxy.dispose();}
});
