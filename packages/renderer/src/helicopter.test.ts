import { afterEach, beforeEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import type { HelicopterState } from '@fender/contracts';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { HelicopterVisual } from './helicopter';
let engine:NullEngine,scene:Scene;
const visuals:HelicopterVisual[]=[];
beforeEach(()=>{engine=new NullEngine();scene=new Scene(engine);scene.useRightHandedSystem=true;});
afterEach(async()=>{for(const visual of visuals.splice(0)){visual.dispose();await visual.ready;}scene.dispose();engine.dispose();});
const modelBytes = new Uint8Array(readFileSync(new URL('../../content/runtime/models/helicopter/helicopter.glb', import.meta.url)));
async function create(){const visual=new HelicopterVisual(scene,undefined,modelBytes);visuals.push(visual);await visual.ready;return visual;}
const state:HelicopterState={entityId:'black-air',dispatchIndex:4,phase:'approach',health:60,from:{x:0,z:0},to:{x:20,z:0},yaw:Math.PI/2,startedAtTick:0,endsAtTick:120};
it('shows a black aircraft on the shared flight path with readable health and bounded reusable geometry',async()=>{
 const visual=await create();visual.render(state,60,false);expect(visual.getStats().helicopterVisible).toBe(true);
 const root=scene.getTransformNodeByName('black-chopper')!;expect(root.position.x).toBeCloseTo(-10);expect(root.position.y).toBe(18);
 const rotor=scene.getNodeByName('rotor_main')! as TransformNode,angle=rotor.rotation.y;visual.render({...state,health:30},61,false);expect(rotor.rotation.y).not.toBe(angle);
 expect(scene.getMeshByName('chopper-health')!.scaling.x).toBeCloseTo(.5);const count=scene.meshes.length,materials=scene.materials.length,textures=scene.textures.length;
 expect(textures,'only the shared PBR BRDF lookup may be allocated').toBeLessThanOrEqual(1);
 for(let i=0;i<100;i++)visual.render(state,62+i,false);expect(scene.meshes).toHaveLength(count);expect(scene.materials).toHaveLength(materials);expect(scene.textures).toHaveLength(textures);expect(scene.lights).toHaveLength(0);
 visual.dispose();expect(scene.meshes).toHaveLength(0);
});
it('falls once when downed, never resurrects the same dispatch helper and clears on garage/reset',async()=>{
 const visual=await create();const down={...state,phase:'downed' as const,health:0,startedAtTick:100,endsAtTick:190};
 visual.render(down,145,false);expect(scene.getTransformNodeByName('black-chopper')!.position.y).toBeLessThan(18);
 expect(visual.render(down,190,false)).toBeTruthy();expect(visual.render(down,191,false)).toBeNull();expect(visual.getStats().helicopterVisible).toBe(false);
 visual.render(state,192,false);expect(visual.getStats().helicopterVisible).toBe(false);
 visual.render({...state,entityId:'next-air'},60,true);const rotor=scene.getNodeByName('rotor_main')! as TransformNode,angle=rotor.rotation.y;
 visual.render({...state,entityId:'next-air'},70,true);expect(rotor.rotation.y).toBe(angle);
 visual.reset();expect(visual.getStats().helicopterVisible).toBe(false);visual.dispose();
});

const componentNames = ['cabin','cockpit','tail_boom','tail_fin','wing_left','wing_right','skid_left','skid_right','rotor_main','rotor_tail'];
it('imports the authored GLB with ten intact components and independently driven rotor axes', async () => {
 const visual=await create();
 try {
  await visual.ready;visual.render(state,60,false);
  expect(componentNames.filter(name=>scene.getNodeByName(name)), 'the shipped model must replace the primitive helicopter').toHaveLength(10);
  expect(scene.getMeshByName('chopper-fuselage')).toBeNull();
  const main=scene.getNodeByName('rotor_main')!,tail=scene.getNodeByName('rotor_tail')!;
  const mainMatrix=main.computeWorldMatrix(true).clone(),tailMatrix=tail.computeWorldMatrix(true).clone();
  visual.render(state,61,false);
  expect(main.computeWorldMatrix(true).equals(mainMatrix)).toBe(false);expect(tail.computeWorldMatrix(true).equals(tailMatrix)).toBe(false);
  visual.render(state,62,true);const frozen=(main as TransformNode).rotation.y;visual.render(state,100,true);
  expect((main as TransformNode).rotation.y).toBe(frozen);
 }finally{visual.dispose();}
});
it('releases ten real rigid fragments once at the crash, then expires and clears them', async () => {
 const visual=await create();
 try {
  await visual.ready;
  const down={...state,phase:'downed' as const,health:0,startedAtTick:100,endsAtTick:190};
  visual.render(down,189,false);expect(visual.getStats().helicopterDebrisBodies).toBe(0);
  expect(visual.render(down,190,false)).toBeTruthy();
  expect(visual.getStats().helicopterDebrisBodies, 'all ten original components must physically separate').toBe(10);
  const fragments=scene.transformNodes.filter(n=>n.metadata?.helicopterFragment),positions=fragments.map(n=>n.position.clone());
  for(let i=0;i<30;i++)visual.render(down,191+i,false,1/60);
  expect(fragments.filter((n,i)=>n.position.subtract(positions[i]!).length()>.5).length).toBeGreaterThan(7);
  expect(visual.render(down,221,false)).toBeNull();
  expect(visual.getStats().helicopterDebrisBodies).toBe(10);
  for(let i=0;i<200;i++)visual.render(down,222+i,false,1/60);
  expect(visual.getStats().helicopterDebrisBodies).toBe(0);
  visual.reset();visual.render({...down,entityId:'next-crash'},190,false);
  expect(visual.getStats().helicopterDebrisBodies).toBe(10);
  visual.reset();expect(visual.getStats().helicopterDebrisBodies).toBe(0);
 }finally{visual.dispose();}
});
it('suppresses physical breakup immediately for reduced motion and disposes an in-flight model load', async () => {
 const visual=await create();await visual.ready;
 const down={...state,phase:'downed' as const,health:0,startedAtTick:100,endsAtTick:190};
 visual.render(down,190,false);visual.render(down,191,true,1/60);
 expect(visual.getStats().helicopterDebrisBodies).toBe(0);visual.dispose();expect(scene.meshes).toHaveLength(0);
 const loading=new HelicopterVisual(scene,undefined,modelBytes);visuals.push(loading);loading.dispose();await loading.ready;
 expect(scene.meshes).toHaveLength(0);expect(scene.materials).toHaveLength(0);
});

it('keeps exact imported surfaces aligned when detaching and keeps debris above the road',async()=>{
 const visual=await create();const down={...state,from:{x:0,z:0},to:{x:0,z:0},phase:'downed' as const,health:0,startedAtTick:100,endsAtTick:190};
 visual.render(down,189,false);
 const meshes=scene.meshes.filter(m=>m.getTotalVertices()>0&&m.isDescendantOf(scene.getNodeByName('helicopter')!));
 const before=meshes.map(m=>Vector3.TransformCoordinates(Vector3.FromArray(m.getVerticesData('position')!),m.computeWorldMatrix(true)));
 visual.render(down,190,false);
 meshes.forEach((m,i)=>expect(Vector3.Distance(before[i]!,Vector3.TransformCoordinates(Vector3.FromArray(m.getVerticesData('position')!),m.computeWorldMatrix(true)))).toBeLessThan(.0001));
 let lowest=Infinity;
 for(let i=0;i<120;i++){
  visual.render(down,191+i,false,1/60);
  for(const m of meshes){const a=m.getVerticesData('position')!,matrix=m.computeWorldMatrix(true);for(let j=0;j<a.length;j+=3)lowest=Math.min(lowest,Vector3.TransformCoordinates(Vector3.FromArray(a,j),matrix).y);}
 }
 expect(lowest,'visible imported parts must not tunnel below the road').toBeGreaterThan(-.08);
});
it('reports an invalid model without an unhandled rejection or primitive substitute',async()=>{
 const visual=new HelicopterVisual(scene,undefined,new Uint8Array([0,1,2]));visuals.push(visual);await visual.ready;
 visual.render(state,60,false);expect(visual.getStats().helicopterModelStatus).toBe('failed');expect(visual.getStats().helicopterModelError).toBeTruthy();
 expect(visual.getStats().helicopterVisible).toBe(false);expect(visual.getStats().helicopterDebrisBodies).toBe(0);
});
