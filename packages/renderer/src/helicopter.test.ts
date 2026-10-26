import { afterAll, afterEach, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import type { HelicopterState } from '@fender/contracts';
import { HelicopterVisual } from './helicopter';
const engine=new NullEngine(),scene=new Scene(engine);afterAll(()=>{scene.dispose();engine.dispose();});afterEach(()=>{for(const mesh of scene.meshes.slice())mesh.dispose();});
const state:HelicopterState={entityId:'black-air',dispatchIndex:4,phase:'approach',health:60,from:{x:0,z:0},to:{x:20,z:0},yaw:Math.PI/2,startedAtTick:0,endsAtTick:120};
it('shows a black aircraft on the shared flight path with readable health and bounded reusable geometry',()=>{
 const visual=new HelicopterVisual(scene);visual.render(state,60,false);expect(visual.getStats().helicopterVisible).toBe(true);
 const root=scene.getTransformNodeByName('black-chopper')!;expect(root.position.x).toBeCloseTo(-10);expect(root.position.y).toBe(18);
 const rotor=scene.getTransformNodeByName('chopper-rotor')!,angle=rotor.rotation.y;visual.render({...state,health:30},61,false);expect(rotor.rotation.y).not.toBe(angle);
 expect(scene.getMeshByName('chopper-health')!.scaling.x).toBeCloseTo(.5);const count=scene.meshes.length;
 for(let i=0;i<100;i++)visual.render(state,62+i,false);expect(scene.meshes).toHaveLength(count);expect(scene.lights).toHaveLength(0);expect(scene.textures).toHaveLength(0);
 visual.dispose();expect(scene.meshes).toHaveLength(0);
});
it('falls once when downed, never resurrects the same dispatch helper and clears on garage/reset',()=>{
 const visual=new HelicopterVisual(scene);const down={...state,phase:'downed' as const,health:0,startedAtTick:100,endsAtTick:190};
 visual.render(down,145,false);expect(scene.getTransformNodeByName('black-chopper')!.position.y).toBeLessThan(18);
 expect(visual.render(down,190,false)).toBeTruthy();expect(visual.render(down,191,false)).toBeNull();expect(visual.getStats().helicopterVisible).toBe(false);
 visual.render(state,192,false);expect(visual.getStats().helicopterVisible).toBe(false);
 visual.render({...state,entityId:'next-air'},60,true);const rotor=scene.getTransformNodeByName('chopper-rotor')!,angle=rotor.rotation.y;
 visual.render({...state,entityId:'next-air'},70,true);expect(rotor.rotation.y).toBe(angle);
 visual.reset();expect(visual.getStats().helicopterVisible).toBe(false);visual.dispose();
});
