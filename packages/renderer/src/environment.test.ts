import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CAMPAIGN_DISPATCHES, type PropState } from '@fender/contracts';
import { DispatchEnvironment, themeForDispatch } from './environment';

let engine: NullEngine, scene: Scene, sun: DirectionalLight, sky: HemisphericLight, environment: DispatchEnvironment;
const lamp = (id: string, x: number, z = 0): PropState => ({ entityId: id, kind: 'lamp', scale: 1, position: { x, y: 2.5, z }, rotation: { x: 0, y: 0, z: 0, w: 1 }, mode: 'fixed', sleeping: true, discontinuityId: 0 });
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); sun = new DirectionalLight('sun', Vector3.Down(), scene); sky = new HemisphericLight('sky', Vector3.Up(), scene); environment = new DispatchEnvironment(scene, sun, sky); });
afterEach(() => { environment.dispose(); scene.dispose(); engine.dispose(); });

describe('authored dispatch atmosphere', () => {
  it('assigns every existing dispatch explicitly, with safe noon fallback', () => {
    expect(CAMPAIGN_DISPATCHES.map(d => themeForDispatch(d.id))).toEqual(['noon', 'noon', 'dusk', 'dusk', 'night', 'noon', 'dusk', 'night', 'dusk', 'night']);
    expect(themeForDispatch(null)).toBe('noon'); expect(themeForDispatch('toString')).toBe('noon');
  });
  it('changes real fog, key direction and ambient illumination while keeping nearby roads clear', () => {
    environment.setDispatch('loose-change'); const noon = { fog: scene.fogColor.clone(), sun: sun.direction.clone(), ambient: sky.intensity };
    environment.setDispatch('express-distress'); expect(scene.fogColor.equals(noon.fog)).toBe(false); expect(sun.direction.equals(noon.sun)).toBe(false);
    environment.setDispatch('green-light'); expect(sky.intensity).toBeLessThan(noon.ambient); expect(sky.intensity).toBeGreaterThan(.3);
    expect(sun.diffuse.b).toBeGreaterThan(sun.diffuse.r); expect(scene.fogStart).toBeGreaterThanOrEqual(65); expect(scene.fogEnd).toBeGreaterThan(scene.fogStart + 60);
  });
  it('keeps every upright lamp lit regardless of camera distance, reflecting each lamp-head position once', () => {
    const lamps = [lamp('far', 120), lamp('near', 2), lamp('next', 8), lamp('behind', -90)];
    environment.setDispatch('green-light'); environment.update(lamps);
    const sources = [...environment.lighting.sources];
    expect(sources.map(l => l.id).sort()).toEqual(lamps.map(l => l.entityId).sort());
    const near = sources.find(l => l.id === 'near')!;
    expect(near.position.x).toBeCloseTo(-.6); expect(near.position.y).toBeCloseTo(4.8);
    expect(environment.getStats().environmentLights).toBe(4); expect(scene.lights).toHaveLength(2);
    environment.update(lamps);
    expect(environment.lighting.sources).toEqual(sources);
  });
  it('never lights absent or fallen props, while every upright lamp contributes', () => {
    const props = [lamp('one', 1), lamp('two', 3), lamp('far', 100), { ...lamp('fallen', 0), mode: 'dynamic' as const }];
    environment.setDispatch('green-light'); environment.update(props); expect(environment.getStats().environmentLights).toBe(3);
    environment.update([{ ...props[0]!, mode: 'dynamic' }]); expect(environment.getStats().environmentLights).toBe(0);
    environment.update([]); expect(environment.getStats().environmentLights).toBe(0);
  });
  it('turns lamps off immediately at noon, reuses one field across dispatches and releases it on disposal', () => {
    environment.setDispatch('green-light'); environment.update([lamp('one', 1)]);
    const lights = scene.lights.length, textures = scene.textures.length, field = environment.lighting.texture;
    for (let i = 0; i < 20; i++) { environment.setDispatch('express-distress'); environment.setDispatch('green-light'); environment.update([lamp('one', 1)]); }
    expect(scene.lights).toHaveLength(lights); expect(scene.textures).toHaveLength(textures); expect(environment.lighting.texture).toBe(field);
    environment.setDispatch(null); expect(environment.getStats().environmentLights).toBe(0); expect(environment.lighting.strength).toBe(0);
    environment.dispose(); expect(scene.lights).toHaveLength(2); expect(scene.textures).toHaveLength(textures - 1);
  });
  it('retains an active dispatch when asynchronous scene loading finishes, then restores the supplied baseline on leave', () => {
    environment.setDispatch('green-light'); const night = scene.fogColor.clone();
    environment.loadBaseline({ skyColor: '#abcdef', fogColor: '#aabbcc', sunDirection: [-.2, -1, .4] });
    expect(scene.fogColor.equals(night)).toBe(true);
    environment.setDispatch(null); expect(scene.fogColor.toHexString().toLowerCase()).toBe('#aabbcc'); expect(sun.direction.asArray()).toEqual([-.2, -1, .4]);
    const fog = scene.fogColor; environment.setDispatch(null); expect(scene.fogColor).toBe(fog);
  });
  it('uses the actual rotated, scaled lamp head instead of a fixed floating world position', () => {
    const prop = { ...lamp('turned', 2, 10), scale: 2, rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } };
    environment.setDispatch('green-light'); environment.update([prop]);
    const head = environment.lighting.sources[0]!.position;
    expect(head.x).toBeCloseTo(-2); expect(head.y).toBeCloseTo(7.1); expect(head.z).toBeCloseTo(12.8);
  });
  it('refreshes cached illumination when an upright lamp changes its slight tilt', () => {
    const prop = { ...lamp('tilted', 3), rotation: { x: .05, y: 0, z: 0, w: Math.sqrt(1 - .05 ** 2) } };
    environment.setDispatch('green-light'); environment.update([prop]); const first = environment.lighting.sources[0]!.position.clone();
    prop.rotation.x = -.05; environment.update([prop]);
    expect(environment.lighting.sources[0]!.position.z).not.toBeCloseTo(first.z);
  });
});
