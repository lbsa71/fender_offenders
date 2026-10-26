import { afterEach, beforeEach, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { WetSurfaces } from './wet-surfaces';
import { DISTRICT_WATER } from '@fender/content';
import { ROAD_PUDDLES } from '@fender/content';

let engine: NullEngine, scene: Scene, water: WetSurfaces;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); scene.useRightHandedSystem = true; water = new WetSurfaces(scene); });
afterEach(() => { water.dispose(); scene.dispose(); engine.dispose(); });
it('keeps decorative puddles visible and renders the exact physics polygon on every preset',()=>{
 expect(water.getStats().waterSurfaces).toBe(6);
 for(const quality of ['low','medium','high'] as const){water.update(.1,quality,false);expect(water.getStats().waterSurfaces).toBe(6);
 for(const zone of ROAD_PUDDLES){const mesh=water.meshes.find(m=>m.name===`wet-${zone.id}`)!,positions=mesh.getVerticesData('position')!;
 for(let i=0;i<zone.polygonXZ.length/2;i++){expect(-(positions[(i+1)*3]!+mesh.position.x)).toBeCloseTo(zone.polygonXZ[i*2]!,5);expect(positions[(i+1)*3+2]!+mesh.position.z).toBeCloseTo(zone.polygonXZ[i*2+1]!,5);}}
 }
});

it('shares one opaque PBR surface across authored sites, without reflection render targets', () => {
  expect(water.meshes).toHaveLength(DISTRICT_WATER.length);
  for (const [i, mesh] of water.meshes.entries()) {
    expect(mesh.material).toBe(water.material); expect(mesh.isPickable).toBe(false);
    expect(mesh.position.asArray()).toEqual([-DISTRICT_WATER[i]!.x, DISTRICT_WATER[i]!.y, DISTRICT_WATER[i]!.z]);
  }
  expect(water.material.alpha).toBe(1); expect(scene.customRenderTargets).toHaveLength(0); expect(scene.lights).toHaveLength(0);
});
it('freezes decorative time immediately for reduced motion and low quality', () => {
  water.update(.1, 'high', false); expect(water.time).toBeCloseTo(.1);
  water.update(.1, 'high', true); expect(water.time).toBeCloseTo(.1);
  water.update(.1, 'low', false); expect(water.time).toBeCloseTo(.1); expect(water.ripples).toBe(false);
  water.update(.1, 'medium', false); expect(water.time).toBeCloseTo(.2);
});
it('reuses resources across quality changes and releases every surface/material', () => {
  const material = water.material;
  for (let i = 0; i < 100; i++) water.update(.1, i % 2 ? 'low' : 'high', false);
  expect(scene.meshes.filter(m => m.name.startsWith('wet-'))).toHaveLength(6); expect(scene.materials).toContain(material);
  water.dispose(); water.dispose(); expect(scene.meshes).toHaveLength(0); expect(scene.materials).not.toContain(material);
});
it('gives the pond and pool a pale, flat shallow border without erecting a route obstacle', () => {
  const borders = scene.meshes.filter(m => m.name.startsWith('shallow-border-'));
  expect(borders).toHaveLength(2);
  expect(borders.every(m => !m.isPickable && m.getBoundingInfo().boundingBox.extendSize.y < .03)).toBe(true);
});
