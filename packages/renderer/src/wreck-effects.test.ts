import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {WreckEffects} from './wreck-effects';
let engine:NullEngine,scene:Scene,effects:WreckEffects;
const wreck={vehicleId:'hero',pose:{x:4,z:-34,yaw:0},bodyAssetId:'fire-chief',discontinuityId:2};
beforeEach(()=>{engine=new NullEngine();scene=new Scene(engine);effects=new WreckEffects(scene);});
afterEach(()=>{effects.dispose();scene.dispose();engine.dispose();});
describe('original pooled spectacular wreck sequence',()=>{
 it.each(['traffic-sedan','suspect'])('matches %s debris to the independent civilian gold body',bodyAssetId=>{
  effects.spawn({...wreck,bodyAssetId});effects.update(.1);const hood=scene.getTransformNodeByName('wreck-0-hood')!;expect(hood.getChildMeshes().some(m=>m.material?.name==='wreck-paint-traffic')).toBe(true);
 });
 it('launches four recognizable spinning wheels, body-colored doors/hood/roof/bumper and a billowing explosion',()=>{
  expect(effects.spawn(wreck)).toBe(true);effects.update(.1);const stats=effects.getStats();expect(stats.wreckWheels).toBe(4);expect(stats.wreckPanels).toBe(6);expect(stats.wreckFireballs).toBeGreaterThanOrEqual(6);expect(stats.wreckSmoke).toBeGreaterThanOrEqual(6);expect(stats.wreckRings).toBe(2);
  const wheels=scene.transformNodes.filter(n=>n.metadata?.wreckRole==='wheel'&&n.isEnabled());expect(wheels).toHaveLength(4);expect(wheels.every(n=>n.getChildMeshes().length>=3)).toBe(true);
  const wheel=wheels[0]!,y=wheel.position.y,spin=wheel.rotation.x;effects.update(.1);expect(wheel.position.y).toBeGreaterThan(y);expect(wheel.rotation.x).not.toBe(spin);
  for(const role of ['hood','door-left','door-right','roof','bumper']){const part=scene.getTransformNodeByName(`wreck-0-${role}`)!;expect(part.isEnabled()).toBe(true);const paint=part.getChildMeshes().find(m=>m.material?.name==='wreck-paint-fire-chief')!;expect(paint).toBeDefined();expect((paint.material as StandardMaterial).diffuseColor.toHexString().toLowerCase()).toBe('#bd4c3d');}
 });
 it('tumbles and bounces above the road, then clears all parts and smoke before the3second respawn',()=>{
  effects.spawn(wreck);let bounced=false;const wheel=scene.getTransformNodeByName('wreck-0-wheel-0')!;let oldY=wheel.position.y,wasFalling=false;
  for(let i=0;i<156;i++){effects.update(1/60);if(!wheel.isEnabled())continue;const y=wheel.position.y;if(y<oldY)wasFalling=true;if(wasFalling&&y>oldY+.002)bounced=true;expect(y).toBeGreaterThanOrEqual(.4);oldY=y;}
  expect(bounced).toBe(true);expect(effects.getStats().wreckSequences).toBe(0);expect(effects.getStats().wreckWheels).toBe(0);expect(effects.getStats().wreckSmoke).toBe(0);
 });
 it('reuses bounded pools, rejects duplicate lives, clears leave/reset state and disposes native resources',()=>{
  const meshes=scene.meshes.length,materials=scene.materials.length;expect(effects.spawn(wreck)).toBe(true);expect(effects.spawn(wreck)).toBe(false);
  for(let i=0;i<40;i++)effects.spawn({...wreck,vehicleId:`driver-${i}`,discontinuityId:i});expect(effects.getStats().wreckSequences).toBeLessThanOrEqual(8);expect(effects.getStats().wreckWheels).toBeLessThanOrEqual(32);expect(scene.meshes.length).toBe(meshes);expect(scene.materials.length).toBe(materials);expect(scene.lights).toHaveLength(0);
  effects.remove('driver-39');expect(effects.getStats().wreckSequences).toBeLessThanOrEqual(7);effects.reset();expect(effects.getStats().wreckSequences).toBe(0);expect(effects.spawn(wreck)).toBe(true);effects.dispose();expect(scene.meshes).toHaveLength(0);expect(scene.materials).toHaveLength(0);
 });
 it('reduces flashes and suppresses ballistic/tumbling pieces for reduced motion, including a live settings change',()=>{
  effects.spawn(wreck,{reducedFlash:true,reducedMotion:true});effects.update(.1,{reducedFlash:true,reducedMotion:true});expect(effects.getStats().wreckWheels).toBe(0);expect(effects.getStats().wreckPanels).toBe(0);expect(effects.getStats().wreckRings).toBe(0);expect(effects.getStats().wreckFireballs).toBeLessThanOrEqual(4);
  effects.reset();effects.spawn(wreck);effects.update(.1);expect(effects.getStats().wreckWheels).toBe(4);effects.update(.1,{reducedMotion:true});expect(effects.getStats().wreckWheels).toBe(0);
 });
});
