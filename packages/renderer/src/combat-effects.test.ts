import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import type {ProjectileState} from '@fender/contracts';
import {CombatEffects} from './combat-effects';
let engine:NullEngine,scene:Scene,effects:CombatEffects;
beforeEach(()=>{engine=new NullEngine();scene=new Scene(engine);effects=new CombatEffects(scene);});
afterEach(()=>{effects.dispose();scene.dispose();engine.dispose();});
describe('bounded native confirmed weapon effects',()=>{
 it('shows a fresh confirmed flash for at least one frame even at10FPS, then expires naturally',()=>{
  effects.muzzle({x:0,z:0,yaw:0});effects.update(.1);expect(effects.getStats().muzzleFlashes).toBe(2);
  effects.update(.1);expect(effects.getStats().muzzleFlashes).toBe(0);
 });
 it('flashes both gun tips, expands impact rings, and settles to invisible without allocating lights',()=>{
  effects.muzzle({x:3,z:4,yaw:0});effects.impact({x:3,z:7,yaw:0},1);effects.update(.01);
  expect(effects.getStats().muzzleFlashes).toBeGreaterThanOrEqual(2);expect(effects.getStats().impactRings).toBe(1);expect(scene.lights).toHaveLength(0);
  const cores=scene.meshes.filter(m=>m.name.startsWith('pooled-muzzle-core-')&&m.isVisible);expect(cores.length).toBeGreaterThanOrEqual(2);expect(cores.some(m=>m.position.x<-3.5)).toBe(true);expect(cores.some(m=>m.position.x>-2.5)).toBe(true);for(const core of cores.slice(0,2))expect(core.position.z).toBe(4);
  for(let i=0;i<120;i++)effects.update(1/60);expect(effects.getStats().muzzleFlashes).toBe(0);expect(effects.getStats().impactRings).toBe(0);
 });
 it('provides a white tracer core and orange trail behind confirmed projectile direction, bounded to96',()=>{
  const shots=Array.from({length:120},(_,i)=>({entityId:`p${i}`,ownerEntityId:'hero',pose:{x:4,z:8,yaw:0},velocity:{x:0,z:60,yawRate:0},bornTick:1,expiresTick:100,sourceCommandSequence:1,sourceShotOrdinal:i})) satisfies ProjectileState[];
  effects.renderProjectiles(shots);expect(effects.getStats().tracerCores).toBe(96);expect(effects.getStats().tracerTrails).toBe(96);
  const trail=scene.getMeshByName('pooled-tracer-trail-0')!;expect(trail.position.z).toBeLessThan(8);expect(trail.position.x).toBe(-4);
  effects.renderProjectiles([]);expect(effects.getStats().tracerCores).toBe(0);
 });
 it('caps sustained bursts, keeps materials shared, reduces flash size and disposes every native resource',()=>{
  const meshes=scene.meshes.length,materials=scene.materials.length;for(let i=0;i<500;i++){effects.muzzle({x:0,z:0,yaw:i});effects.impact({x:0,z:0,yaw:0},1);}
  expect(effects.getStats().muzzleFlashes).toBeLessThanOrEqual(24);expect(effects.getStats().impactRings).toBeLessThanOrEqual(12);expect(scene.meshes.length).toBe(meshes);expect(scene.materials.length).toBe(materials);
  effects.reset();effects.muzzle({x:0,z:0,yaw:0},true);effects.update(.01,true);const small=scene.getMeshByName('pooled-muzzle-flare-0')!.scaling.z;
  effects.reset();effects.muzzle({x:0,z:0,yaw:0});effects.update(.01);expect(scene.getMeshByName('pooled-muzzle-flare-0')!.scaling.z).toBeGreaterThan(small);
  effects.dispose();expect(scene.meshes).toHaveLength(0);expect(scene.materials).toHaveLength(0);
 });
});
