import { expect, test } from './fixtures';
import { createTcpProxy } from '../integration/tcp-proxy';
import { maxUnexplainedBackstep } from '../support/motion-trace';

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
          if(car&&target&&car.discontinuityId===trace.localLife&&target.discontinuityId===trace.targetLife)trace.frames.push({at:frame.sampleTimeSeconds*1000,z:car.pose.z,velocity:car.velocity.z,contactZ:state.local.contact?.pose.z??0,life:car.discontinuityId,targetLife:target.discontinuityId,health:car.health,contact:state.local.contact?.revision??0,corrections:api.getStats().corrections});}
        return frame;};window.__FO_CONTACT_API__=api;
    } return api;`)});
  });
  await page.addInitScript(({serverPort,proxyPort})=>{
    localStorage.setItem('fender-garage-v1',JSON.stringify({vehicleBodyId:'patrol'}));
    localStorage.setItem('fender-settings-v1',JSON.stringify({quality:'low',controlScheme:'keyboard'}));
    const NativeWebSocket=window.WebSocket;
    window.WebSocket=class extends NativeWebSocket{constructor(url:string|URL,protocols?:string|string[]){const target=new URL(String(url));if(target.hostname==='127.0.0.1'&&target.port===String(serverPort))target.port=String(proxyPort);super(target,protocols);}};
  },{serverPort,proxyPort});
  // Two genuine arrest windows collect the sample floor without making it an FPS gate.
  let totalFrames=0;
  try{
   for(let trial=0;trial<2;trial++){
    await page.goto('/');await page.getByRole('button',{name:'HIT THE STREETS'}).click();await page.getByRole('button',{name:'START DISPATCH'}).click();
    await page.waitForFunction(()=>(window as any).__FO_CONTACT_API__?.getSnapshot()?.phase==='playing');
    const room=new URL(page.url()).searchParams.get('room')!;
    const initial=await page.evaluate(()=>{
      const api=(window as any).__FO_CONTACT_API__,state=api.getSnapshot();
      const localLife=state.local.vehicle.discontinuityId+1,targetLife=state.vehicles.find((car:any)=>car.entityId===state.pursuit.suspectId).discontinuityId+1;
      (window as any).__FO_CONTACT__={frames:[],localLife,targetLife};
      return {corrections:api.getStats().corrections+1,localLife,targetLife};
    });
    expect((await page.request.post(`http://127.0.0.1:${serverPort+1000}/room/${room}/contact/0`)).ok()).toBe(true);
    await page.waitForFunction(()=>Math.abs((window as any).__FO_CONTACT_API__?.getSnapshot()?.local?.vehicle.pose.z+30)<1);
    // The forced teleport is a separate life. Drain its in-flight reports before
    // measuring ordinary contact, then retain the full three-second arrest window.
    const setupAck=await page.evaluate(()=>(window as any).__FO_CONTACT_API__.getSnapshot().local.lastConsumedSequence);
    await page.waitForFunction(ack=>(window as any).__FO_CONTACT_API__.getSnapshot().local.lastConsumedSequence>=ack+8,setupAck);
    initial.corrections=await page.evaluate(()=>{(window as any).__FO_CONTACT__.frames=[];return (window as any).__FO_CONTACT_API__.getStats().corrections;});
    expect((await page.request.post(`http://127.0.0.1:${serverPort+1000}/room/${room}/contact-ready/0`)).ok()).toBe(true);
    await page.keyboard.down('w');await expect(page.getByText('ARREST CERTIFIED',{exact:true})).toBeVisible();await page.keyboard.up('w');
    const frames:{at:number;z:number;velocity:number;contactZ:number;life:number;targetLife:number;health:number;contact:number;corrections:number}[]=await page.evaluate(()=>(window as any).__FO_CONTACT__.frames);
    const backsteps=frames.slice(1).map((f,i)=>frames[i]!.z-f.z),maxBackstep=Math.max(...backsteps);
    const unadjustedBacksteps=frames.slice(1).flatMap((f,i)=>f.contact===frames[i]!.contact?[frames[i]!.z-f.z]:[]);
    const unexplainedBackstep=maxUnexplainedBackstep(frames);
    const separationPerRevision=frames.slice(1).flatMap((f,i)=>f.contact>frames[i]!.contact?[Math.abs(f.contactZ-frames[i]!.contactZ)/(f.contact-frames[i]!.contact)]:[]);
    await test.info().attach('Rendered bumper contact and arrest',{body:JSON.stringify({frames,maxBackstep,unexplainedBackstep}),contentType:'application/json'});
    console.log('Bumper trace',JSON.stringify({frames:frames.length,maxBackstep,unexplainedBackstep,contactRevisions:Math.max(...frames.map(f=>f.contact)),controllerResets:Math.max(...frames.map(f=>f.corrections))-initial.corrections}));
    expect(frames[0]!.life,'Recording begins with the explicit fixture intervention, not an earlier car pose').toBe(initial.localLife);
    expect(frames[0]!.targetLife).toBe(initial.targetLife);
    totalFrames+=frames.length;expect(Math.max(...frames.map(f=>f.contact))).toBeGreaterThan(3);
    expect(Math.max(...frames.map(f=>f.corrections)),'Contact must not restart local driving').toBe(initial.corrections);
    expect(new Set(frames.map(f=>f.life)).size).toBe(1);expect(new Set(frames.map(f=>f.targetLife)).size).toBe(1);
    expect(Math.min(...frames.map(f=>f.health))).toBe(100);
    expect(unadjustedBacksteps.length).toBeGreaterThan(3);
    expect(Math.max(...unadjustedBacksteps),'Without a new contact adjustment, settled contact must not jump back to older poses').toBeLessThan(.2);
    expect(separationPerRevision.length).toBeGreaterThan(3);
    expect(Math.max(...separationPerRevision),'The authority must not hide a large teleport in a contact revision').toBeLessThan(.2);
    expect(unexplainedBackstep,'Holding bumper contact must not add an unexplained jump to older poses').toBeLessThan(.2);
    await page.getByRole('button',{name:/^BACK TO DISPATCH/}).click();
   }
   expect(totalFrames,'Two real arrest windows must provide enough samples without imposing a rendering FPS requirement').toBeGreaterThan(60);
  }finally{await page.keyboard.up('w');await proxy.dispose();}
});
