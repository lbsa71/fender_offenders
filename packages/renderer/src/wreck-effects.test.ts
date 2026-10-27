import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {WreckEffects} from './wreck-effects';
let engine:NullEngine,scene:Scene,effects:WreckEffects;
const wreck={vehicleId:'hero',pose:{x:4,z:-34,yaw:0},bodyAssetId:'fire-chief',discontinuityId:2};
beforeEach(async()=>{engine=new NullEngine();scene=new Scene(engine);effects=new WreckEffects(scene);await effects.ready;});
afterEach(()=>{effects.dispose();scene.dispose();engine.dispose();});
describe('original pooled spectacular wreck sequence',()=>{
 it.each(['traffic-sedan','suspect'])('matches %s debris to the independent civilian gold body',bodyAssetId=>{
  effects.spawn({...wreck,bodyAssetId});effects.update(.1);const hood=scene.transformNodes.find(n=>n.metadata?.componentName==='hood'&&n.isEnabled())!;expect(hood.getChildMeshes().some(m=>m.material?.name==='paint-traffic')).toBe(true);
 });
 it('launches four spinning tires, separate hubs and every original styled component with a billowing explosion',()=>{
  expect(effects.spawn(wreck)).toBe(true);effects.update(.1);const stats=effects.getStats();expect(stats.wreckWheels).toBe(4);expect(stats.wreckPanels).toBe(49);expect(stats.wreckBodies).toBe(53);expect(stats.wreckFireballs).toBeGreaterThanOrEqual(6);expect(stats.wreckSmoke).toBeGreaterThanOrEqual(6);expect(stats.wreckRings).toBe(2);
  const wheels=scene.transformNodes.filter(n=>n.metadata?.wreckRole==='wheel'&&n.isEnabled());expect(wheels).toHaveLength(4);expect(wheels.every(n=>n.getChildMeshes().length===1)).toBe(true);
  expect(scene.meshes.filter(m=>m.metadata?.wreckComponent&&m.isEnabled()&&['hub','hub-cap'].includes(m.metadata.componentName))).toHaveLength(8);
  const wheel=wheels[0]!,y=wheel.position.y,spin=wheel.rotationQuaternion!.asArray();effects.update(.1);expect(wheel.position.y).toBeGreaterThan(y);expect(wheel.rotationQuaternion!.asArray()).not.toEqual(spin);
  for(const [role,material]of [['hood','paint-fire-chief'],['paint-shell','paint-fire-chief'],['roof','paint-fire-chief'],['bumper','chrome'],['white-roof','service-white']]){const part=scene.transformNodes.find(n=>n.metadata?.componentName===role&&n.isEnabled())!;expect(part).toBeDefined();const paint=part.getChildMeshes().find(m=>m.material?.name===material)!;expect(paint).toBeDefined();expect(paint.material).toBeInstanceOf(PBRMaterial);if(material==='paint-fire-chief')expect((paint.material as PBRMaterial).albedoColor.toHexString().toLowerCase()).toBe('#bd4c3d');}
 });
 it('tumbles and bounces above the road, then clears all parts and smoke before the3second respawn',()=>{
  effects.spawn(wreck);let bounced=false;const wheel=scene.transformNodes.find(n=>n.metadata?.wreckRole==='wheel'&&n.isEnabled())!;let oldY=wheel.position.y,wasFalling=false;
  for(let i=0;i<156;i++){effects.update(1/60);if(!wheel.isEnabled())continue;const y=wheel.position.y;if(y<oldY)wasFalling=true;if(wasFalling&&y>oldY+.002)bounced=true;const mesh=wheel.getChildMeshes()[0]!;mesh.computeWorldMatrix(true);const vertices=mesh.getVerticesData('position')!;let minimumY=Infinity;for(let j=0;j<vertices.length;j+=3)minimumY=Math.min(minimumY,Vector3.TransformCoordinates(Vector3.FromArray(vertices,j),mesh.getWorldMatrix()).y);expect(minimumY, `tire surface at tick ${i}, center ${wheel.position.y}`).toBeGreaterThan(-.08);oldY=y;}
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
