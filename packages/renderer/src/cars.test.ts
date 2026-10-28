import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VEHICLE_BODIES } from '@fender/content';
import { CarFactory, type CarVisual } from './cars';
import * as CarPresentation from './cars';
import {readFileSync} from 'node:fs';

describe('selectable modeled DB5',()=>{
  async function load(detail:'briefing'|'driving'='driving'){
    scene.useRightHandedSystem=true;
    const loader=Reflect.get(factory,'loadDb5');
    expect(loader,'the car factory must load the shipped DB5').toBeTypeOf('function');
    await loader.call(factory,new Uint8Array(readFileSync(new URL(`../../content/runtime/models/db5/db5-${detail}.glb`,import.meta.url))));
  }
  it('uses the real silver exterior, four separate wheels and only unlocked guns',async()=>{
    await load();
    const rookie=factory.create('db5-rookie','db5',false,false),armed=factory.create('db5-armed','db5',false,true);
    expect(rookie.parts.some(p=>p.sourceMesh.material?.name==='silver_clearcoat')).toBe(true);
    const parts=factory.breakupParts('db5',false,false);
    expect(parts.filter(p=>p.metadata.componentName==='tire')).toHaveLength(4);
    expect(parts.map(p=>p.metadata.componentId)).toEqual(expect.arrayContaining(['body','bonnet','boot','door_left','door_right']));
    expect(parts.some(p=>p.metadata.componentId.startsWith('gun_'))).toBe(false);
    expect(factory.breakupParts('db5',false,true).filter(p=>p.metadata.componentId.startsWith('gun_'))).toHaveLength(2);
    expect(armed.parts.length).toBeGreaterThan(rookie.parts.length);
    expect(Math.min(...parts.map(p=>p.getBoundingInfo().boundingBox.minimum.y+p.position.y))).toBeGreaterThanOrEqual(-.001);
    expect(parts.every(p=>!p.isVisible)).toBe(true);
  });
  it('batches the driving model and reuses its geometry across eight officers',async()=>{
    await load();const car=factory.create('db5-0','db5',false,true);
    expect(car.parts.length).toBeLessThanOrEqual(20);
    expect(car.parts.reduce((n,p)=>n+p.sourceMesh.getTotalIndices()/3,0)).toBeGreaterThan(10000);
    for(let i=1;i<8;i++)expect(factory.create(`db5-${i}`,'db5',false,true).parts.map(p=>p.sourceMesh.geometry)).toEqual(car.parts.map(p=>p.sourceMesh.geometry));
  });
  it('disposes imported assets after the owning renderer removes the cars',async()=>{
    await load();factory.create('db5','db5',false).root.dispose();factory.dispose();
    expect(scene.meshes).toHaveLength(0);
  });
  it('disposes a completed load even when the owning renderer has already closed',async()=>{
    const loader=Reflect.get(factory,'loadDb5');expect(loader).toBeTypeOf('function');
    const pending=loader.call(factory,new Uint8Array(readFileSync(new URL('../../content/runtime/models/db5/db5-driving.glb',import.meta.url))));factory.dispose();await pending;
    expect(scene.meshes).toHaveLength(0);
  });
  it('turns front wheels, rolls all wheels and uses the authored grille muzzle positions',async()=>{
    await load();const car=factory.create('wheel-test','db5',false,true);
    const animate=Reflect.get(factory,'animateWheels'),muzzles=Reflect.get(factory,'muzzlePoints');
    expect(animate).toBeTypeOf('function');expect(muzzles).toBeTypeOf('function');
    animate.call(factory,car,1,.3);
    const wheels=car.parts.filter(p=>p.sourceMesh.metadata.wheel);
    expect(new Set(wheels.map(p=>p.sourceMesh.metadata.wheel)).size).toBe(4);
    for(const id of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr'])expect(new Set(wheels.filter(p=>p.sourceMesh.metadata.wheel===id).map(p=>p.position.asArray().map(n=>n.toFixed(5)).join(','))).size,'tire and wire hub must rotate about the same axle').toBe(1);
    for(const wheel of wheels){expect(Math.abs(wheel.rotation.x)).toBeGreaterThan(.5);expect(wheel.rotation.y).toBeCloseTo(wheel.sourceMesh.metadata.wheel.endsWith('fl')||wheel.sourceMesh.metadata.wheel.endsWith('fr')?.3:0);}
    expect(muzzles.call(factory,'db5').map((p:Vector3)=>[p.x,p.y,p.z])).toEqual([expect.arrayContaining([expect.closeTo(-.43),expect.closeTo(.582),expect.closeTo(2.02)]),expect.arrayContaining([expect.closeTo(.43),expect.closeTo(.582),expect.closeTo(2.02)])]);
  });
});

let engine: NullEngine, scene: Scene, factory: CarFactory;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); factory = new CarFactory(scene); });
afterEach(() => { scene.dispose(); engine.dispose(); });
function part(car: CarVisual, name: string) {
  const value = car.parts.find(value => value.sourceMesh.material?.name === name);
  expect(value, `visible ${name} geometry`).toBeDefined();
  return value!.sourceMesh;
}
function paint(car: CarVisual, name: string) {
  const mesh = part(car, `paint-${name}`);
  expect(mesh.material).toBeInstanceOf(PBRMaterial);
  return { color: (mesh.material as PBRMaterial).albedoColor.toHexString().toLowerCase(), bounds: mesh.getBoundingInfo().boundingBox };
}

describe('original procedural vehicle bodies', () => {
  it('removes only the gun fittings from each rookie car and its exact breakup assembly',()=>{
    for(const body of VEHICLE_BODIES.filter(id=>id!=='db5')){
      const rookie=factory.create(`rookie-${body}`,body,false,false);
      expect(paint(rookie,body).color).toBe(paint(factory.create(`armed-${body}`,body,false),body).color);
      const armed=factory.create(`reference-${body}`,body,false);expect(Boolean(rookie.sirenRed)).toBe(Boolean(armed.sirenRed));expect(Boolean(rookie.sirenBlue)).toBe(Boolean(armed.sirenBlue));
      expect(factory.breakupParts(body,false,false).filter(m=>m.metadata.componentName==='gun')).toHaveLength(0);
      expect(factory.breakupParts(body,false).filter(m=>m.metadata.componentName==='gun')).toHaveLength(2);
    }
  });
  it('distinguishes dielectric glass, coated paint and metal instead of giving every surface the same response', () => {
    factory.create('finish', 'patrol', false);
    const paint = scene.getMaterialByName('paint-patrol') as PBRMaterial, glass = scene.getMaterialByName('glass') as PBRMaterial, chrome = scene.getMaterialByName('chrome') as PBRMaterial;
    expect(glass.roughness).toBeLessThan(paint.roughness!);
    expect(glass.metallic).toBe(0); expect(paint.metallic).toBeLessThan(.2); expect(chrome.metallic).toBeGreaterThan(.6);
    expect(paint.clearCoat.isEnabled).toBe(true); expect(glass.clearCoat.isEnabled).toBe(false);
  });
  it.each([...VEHICLE_BODIES.filter(id=>id!=='db5'), 'traffic-sedan'])('retains every authored %s component for an exact physical breakup', body => {
    const traffic = body === 'traffic-sedan';
    const intact = factory.create('assembly', body, traffic);
    const breakup = Reflect.get(factory, 'breakupParts') as (body: string, traffic: boolean) => readonly Mesh[];
    expect(breakup, 'the car factory must expose its actual assembly instead of generic replacement debris').toBeTypeOf('function');
    const components = breakup.call(factory, body, traffic);
    expect(components.length).toBeGreaterThanOrEqual(40);
    expect(components.filter(m => m.metadata.componentName === 'tire')).toHaveLength(4);
    expect(components.filter(m => m.metadata.componentName === 'gun')).toHaveLength(traffic ? 0 : 2);
    expect(new Set(components.map(m => m.metadata.componentId)).size).toBe(components.length);
    const vertices = (meshes: readonly Mesh[], transform: boolean) => meshes.flatMap(mesh => {
      const data = mesh.getVerticesData('position')!;
      mesh.computeWorldMatrix(true);
      return Array.from({ length: data.length / 3 }, (_, index) => {
        const v = Vector3.FromArray(data, index * 3);
        const p = transform ? Vector3.TransformCoordinates(v, mesh.getWorldMatrix()) : v;
        return [p.x, p.y, p.z].map(n => n.toFixed(4)).join(',');
      });
    }).sort();
    expect(vertices(components, true)).toEqual(vertices(intact.parts.map(p => p.sourceMesh), false));
    expect(components.every(m => !m.isVisible && m.material !== null)).toBe(true);
    expect(breakup.call(factory, body, traffic)).toBe(components);
  });
  it('keeps civilian traffic unarmed while retaining both physical gun barrels on player and villain cars', () => {
    const barrelTips = (car: CarVisual) => car.parts.flatMap(part => {
      const vertices = part.sourceMesh.getVerticesData('position') ?? [];
      const tips: number[] = [];
      for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i]!, y = vertices[i + 1]!, z = vertices[i + 2]!;
        if (Math.abs(x) > .56 && Math.abs(x) < .70 && y > 1.10 && y < 1.24 && z > 2.4) tips.push(x);
      }
      return tips;
    });
    expect(barrelTips(factory.create('civilian', 'traffic-sedan', true)), 'spectator cars must have no gun-tip geometry').toHaveLength(0);
    for (const body of VEHICLE_BODIES.filter(id=>id!=='db5')) {
      const tips = barrelTips(factory.create(`officer-${body}`, body, false));
      expect(tips.some(x => x < 0), `${body} left barrel`).toBe(true);
      expect(tips.some(x => x > 0), `${body} right barrel`).toBe(true);
    }
    expect(barrelTips(factory.create('villain', 'suspect', false)).length).toBeGreaterThan(0);
    expect(barrelTips(factory.create('second-civilian', 'traffic-sedan', true))).toHaveLength(0);
  });
  it('puts both modeled gun tips at the shared physical forward2.45/lateral0.63/worldheight1.20 positions',()=>{
    const car=factory.create('gun-measure','patrol',false),navy=car.parts.find(m=>m.parent===car.body&&m.sourceMesh.material?.name==='navy')!.sourceMesh,vertices=navy.getVerticesData('position')!;
    for(const side of [-1,1]){const gun:number[][]=[];for(let i=0;i<vertices.length;i+=3){const x=vertices[i]!,y=vertices[i+1]!,z=vertices[i+2]!;if(x*side>.56&&x*side<.70&&y>1.10&&y<1.24&&z>.9)gun.push([x,y,z]);}
      expect(Math.max(...gun.map(v=>v[2]!))).toBeCloseTo(2.45,5);expect((Math.min(...gun.map(v=>v[0]!))+Math.max(...gun.map(v=>v[0]!)))/2).toBeCloseTo(side*.63,5);expect((Math.min(...gun.map(v=>v[1]!))+Math.max(...gun.map(v=>v[1]!)))/2+.03).toBeCloseTo(1.2,5);
    }
  });
  it('uses supported protection blinking, preserves marker and wreck silhouette, and honors reduced flash',()=>{
    const car=factory.create('status','patrol',false),update=Reflect.get(CarPresentation,'updateCarStatus') as (car:CarVisual,protectedSpawn:boolean,time:number,reducedFlash:boolean)=>void;
    expect(update).toBeTypeOf('function');
    car.marker.isVisible=true;update(car,true,.1,false);expect(car.parts.every(p=>p.isVisible)).toBe(true);
    update(car,true,.4,false);expect(car.parts.every(p=>!p.isVisible)).toBe(true);expect(car.marker.isVisible).toBe(true);
    update(car,true,.4,true);expect(car.parts.every(p=>p.isVisible)).toBe(true);
    update(car,false,.4,false);expect(car.parts.every(p=>p.isVisible)).toBe(true);
  });
  it('hides intact wheels and coachwork for snapshot wrecks, shows a charred chassis, and restores after respawn',()=>{
    const car=factory.create('wreck-state','ambulance',false),update=CarPresentation.updateCarStatus as (...args:any[])=>void;
    update(car,false,0,false,'wrecked');expect(car.parts.every(p=>!p.isVisible)).toBe(true);
    const charred=Reflect.get(car,'wreckParts') as import('@babylonjs/core/Meshes/instancedMesh').InstancedMesh[];expect(charred.length).toBeGreaterThan(0);expect(charred.every(m=>m.isVisible)).toBe(true);
    expect(charred.every(m=>m.parent===car.root)).toBe(true);expect(car.health.parent).toBe(car.root);
    update(car,false,0,false,'active');expect(car.parts.every(p=>p.isVisible)).toBe(true);expect(charred.every(m=>!m.isVisible)).toBe(true);
  });
  it('deforms the coachwork while keeping wheels rigid and health/identity outside the deformation', () => {
    const car = factory.create('elastic', 'ambulance', false);
    expect(car).toHaveProperty('body');expect(car).toHaveProperty('suspension');
    const body=(car as unknown as {body:import('@babylonjs/core/Meshes/transformNode').TransformNode}).body;
    const suspension=(car as unknown as {suspension:import('@babylonjs/core/Meshes/transformNode').TransformNode}).suspension;
    expect(car.parts.filter(p=>p.sourceMesh.metadata?.role==='wheel').length).toBeGreaterThan(0);
    expect(car.parts.filter(p=>p.sourceMesh.metadata?.role==='wheel').every(p=>p.parent===suspension)).toBe(true);
    expect(car.parts.filter(p=>p.sourceMesh.metadata?.role!=='wheel').every(p=>p.parent===body)).toBe(true);
    body.scaling.set(1.2,.75,1.1);body.rotation.z=.28;suspension.position.y=.4;
    car.health.computeWorldMatrix(true);car.marker.computeWorldMatrix(true);
    expect(car.health.parent).toBe(car.root);expect(car.marker.parent).toBe(car.root);
    expect(car.health.getAbsolutePosition().y).toBeCloseTo(3.51,2);expect(car.marker.getAbsolutePosition().y).toBeCloseTo(.08,2);
    expect(car.root.scaling.y).toBe(1);expect(car.root.rotation.z).toBe(0);
  });
  it('publishes all seven selectable bodies in the shared authoritative catalog', () => {
    expect(VEHICLE_BODIES).toEqual(['patrol', 'interceptor', 'roadster', 'army', 'ambulance', 'fire-chief', 'db5']);
  });

  it.each(['patrol', 'interceptor', 'roadster'])('retains the existing %s body and instanced geometry', body => {
    const first = factory.create('one', body, false), next = factory.create('two', body, false);
    expect(paint(first, body).bounds.maximum.y).toBeGreaterThan(1.5);
    expect(next.parts[0]!.sourceMesh).toBe(first.parts[0]!.sourceMesh);
    expect(first.parts.every(mesh => mesh.getTotalVertices() > 0)).toBe(true);
  });

  it('renders an olive upright army 4x4 with an elevated rear spare tire', () => {
    const car = factory.create('army-test', 'army', false), body = paint(car, 'army');
    expect(body.color).toBe('#69754a');
    expect(body.bounds.maximum.y).toBeGreaterThan(2);
    const tires = part(car, 'rubber').getBoundingInfo().boundingBox;
    expect(tires.minimum.z).toBeLessThan(-2.2);
    expect(tires.maximum.y).toBeGreaterThan(1.8);
  });

  it('renders a white ambulance with a tall rear box, fictional teal medical crosses and red service stripe', () => {
    const car = factory.create('ambulance-test', 'ambulance', false), body = paint(car, 'ambulance');
    expect(body.color).toBe('#f4efe0');
    expect(body.bounds.maximum.y).toBeGreaterThan(2.5);
    expect(body.bounds.minimum.z).toBeLessThan(-2);
    const marking = part(car, 'medical-cross');
    expect((marking.material as PBRMaterial).albedoColor.toHexString().toLowerCase()).toBe('#318c88');
    expect((part(car, 'medical-service').material as PBRMaterial).albedoColor.toHexString().toLowerCase()).toBe('#c94b43');
    const crosses = marking.getBoundingInfo().boundingBox;
    expect(crosses.maximum.y).toBeGreaterThan(2.2);
    expect(crosses.maximum.x - crosses.minimum.x).toBeGreaterThan(1.9);
    const glass = part(car, 'glass').getVerticesData('position')!;
    const upperWindshieldZ = Array.from({ length: glass.length / 3 }, (_, i) => [glass[i * 3 + 1]!, glass[i * 3 + 2]!] as const).filter(([y]) => y > 1.7).map(([, z]) => z);
    expect(Math.max(...upperWindshieldZ), 'upper front windshield must project ahead of the medical box').toBeGreaterThan(.7);
    expect(car.sirenRed).not.toBeNull(); expect(car.sirenBlue).not.toBeNull();
  });

  it('renders a red fire-chief SUV with a raised cabin, service stripe and roof lightbar', () => {
    const car = factory.create('chief-test', 'fire-chief', false), body = paint(car, 'fire-chief');
    expect(body.color).toBe('#bd4c3d');
    expect(body.bounds.maximum.y).toBeGreaterThan(2);
    const stripe = part(car, 'fire-service').getBoundingInfo().boundingBox;
    expect(stripe.maximum.z - stripe.minimum.z).toBeGreaterThan(3);
    expect(car.sirenRed).not.toBeNull(); expect(car.sirenBlue).not.toBeNull();
    expect(car.sirenRed!.sourceMesh.getBoundingInfo().boundingBox.minimum.y).toBeGreaterThan(2.2);
  });

  it.each(['army', 'ambulance', 'fire-chief'])('keeps %s inside the existing driving envelope and traffic independent', body => {
    const car = factory.create(body, body, false);
    for (const mesh of car.parts) {
      const bounds = mesh.sourceMesh.getBoundingInfo().boundingBox;
      expect(Math.max(Math.abs(bounds.minimum.x), Math.abs(bounds.maximum.x))).toBeLessThan(1.25);
      expect(Math.max(Math.abs(bounds.minimum.z), Math.abs(bounds.maximum.z))).toBeLessThan(2.55);
      expect(bounds.maximum.y).toBeLessThan(3);
    }
    expect(paint(factory.create('traffic', body, true), 'traffic').color).toBe('#cbb26e');
  });
});
