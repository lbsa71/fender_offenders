import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {createGaragePreview} from './garage';
let engine:NullEngine,garage:ReturnType<typeof createGaragePreview>;
beforeEach(()=>{engine=new NullEngine();garage=createGaragePreview(engine);});
afterEach(()=>{garage.dispose();engine.dispose();});
describe('native garage turntable',()=>{
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
