import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {createGaragePreview} from './garage';
let engine:NullEngine,garage:ReturnType<typeof createGaragePreview>;
beforeEach(()=>{engine=new NullEngine();garage=createGaragePreview(engine);});
afterEach(()=>{garage.dispose();engine.dispose();});
describe('native garage turntable',()=>{
  it('uses synchronous compilation for the shared preview engine to avoid stale programs',()=>{
    garage.dispose();engine.getCaps().parallelShaderCompile={COMPLETION_STATUS_KHR:123};garage=createGaragePreview(engine);
    expect(engine.getCaps().parallelShaderCompile).toBeUndefined();
  });
  it('keeps the phone chase viewport above the DB5 selection cards',()=>{
    garage.dispose();engine.dispose();engine=new NullEngine({renderWidth:390,renderHeight:844,textureSize:512,deterministicLockstep:false,lockstepMaxSteps:4});garage=createGaragePreview(engine);
    garage.setBody('db5',false,'roadster',false);garage.update(0,true);
    const v=garage.scene.activeCamera!.viewport;
    expect(Math.round((1-v.y)*844)).toBeLessThanOrEqual(195);
  });
  it('moves the road behind the chase and freezes all decorative motion when reduced',()=>{
    garage.setBody('patrol',false,'roadster',false);garage.update(0,false);
    const dash=garage.scene.getMeshByName('garage-registration')!;
    const start=dash.position.z;garage.update(.1,false);
    expect(dash.position.z).toBeLessThan(start);
    const frozen=dash.position.z,unit=garage.scene.getTransformNodeByName('vehicle-garage-preview')!.rotation.y;
    garage.update(.5,true);
    expect(dash.position.z).toBe(frozen);
    expect(garage.scene.getTransformNodeByName('vehicle-garage-preview')!.rotation.y).toBe(unit);
  });
  it('stages both cars in one shared chase view with the suspect ahead',()=>{
    garage.setBody('patrol',false,'roadster',false);garage.update(.1,true);
    expect(garage.scene.activeCameras??[garage.scene.activeCamera]).toHaveLength(1);
    expect(garage.scene.getMeshByName('garage-stage-rival')).toBeNull();
    const unit=garage.scene.getTransformNodeByName('vehicle-garage-preview')!;
    const suspect=garage.scene.getTransformNodeByName('vehicle-garage-suspect')!;
    expect(suspect.getAbsolutePosition().z).toBeGreaterThan(unit.getAbsolutePosition().z+3);
  });
  it('returns to the player camera after leaving a two-car briefing',()=>{
    garage.setBody('patrol',false,'roadster',false);garage.update(.1,true);garage.scene.render();
    garage.setBody('ambulance');garage.update(.1,true);
    expect(garage.scene.activeCamera?.name).toBe('garage-camera');
  });
  it('shows the actual suspect alongside the selected car with independent weapon fittings',()=>{
    garage.setBody('patrol',false,'roadster',false);
    expect(garage.scene.meshes.some(m=>m.name.startsWith('garage-suspect-')&&m.isVisible)).toBe(true);
    expect(garage.getStats()).toMatchObject({bodyAssetId:'patrol',suspectBody:'roadster',armed:false,suspectArmed:false});
    garage.setBody('army',true,'patrol',true);
    expect(garage.getStats()).toMatchObject({bodyAssetId:'army',suspectBody:'patrol',armed:true,suspectArmed:true});
  });
  it('disables garage shadows for low quality and restores them at high quality',()=>{
    const setQuality=Reflect.get(garage,'setQuality') as (quality:string)=>void;
    expect(setQuality).toBeTypeOf('function');setQuality('low');expect(garage.scene.shadowsEnabled).toBe(false);setQuality('high');expect(garage.scene.shadowsEnabled).toBe(true);
  });
  it('shows a substantial original car on a lit stage inside the left 58 percent viewport',()=>{
    garage.setBody('ambulance');
    expect(garage.scene.activeCamera?.viewport.width).toBe(.58);
    expect(garage.scene.meshes.some(m=>m.name.includes('paint-ambulance')&&m.isVisible)).toBe(true);
    expect(garage.scene.meshes.some(m=>m.name==='garage-stage'&&m.receiveShadows)).toBe(true);
    expect(garage.scene.lights.length).toBeGreaterThanOrEqual(2);
  });
  it('turns continuously, freezes for reduced motion, and switches bodies without accumulating live previews',()=>{
    garage.setBody('patrol');const initial=garage.getStats().angle;garage.update(.5,false);const before=garage.getStats().angle;
    expect(before-initial).toBeGreaterThan(.05);garage.update(.5,true);expect(garage.getStats().angle).toBe(before);
    garage.setBody('ambulance');garage.setBody('patrol');const meshCount=garage.scene.meshes.length;
    for(let i=0;i<20;i++){garage.setBody('ambulance');garage.setBody('patrol');garage.update(.016,true);}
    expect(garage.scene.meshes.length).toBe(meshCount);
    expect(garage.scene.transformNodes.filter(n=>n.name==='vehicle-garage-preview')).toHaveLength(1);
    expect(garage.getStats().bodyAssetId).toBe('patrol');
  });
});
