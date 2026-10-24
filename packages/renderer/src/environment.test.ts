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
  it('selects nearest upright authority lamps, reflecting each lamp-head position once', () => {
    environment.setDispatch('green-light'); environment.update([lamp('far', 50), lamp('near', 2), lamp('next', 8)], Vector3.Zero());
    const spots = scene.lights.filter(l => l.getClassName() === 'SpotLight' && l.isEnabled()) as any[];
    expect(spots.map(l => l.metadata.propId)).toEqual(['near', 'next']);
    expect(spots[0].position.x).toBeCloseTo(-.6); expect(spots[0].position.y).toBeCloseTo(4.8); expect(spots[0].direction.y).toBe(-1);
    expect(spots.every(l => !l.getShadowGenerator())).toBe(true);
  });
  it('never lights absent or fallen props, and caps high/medium/low lights at two/one/zero', () => {
    const props = [lamp('one', 1), lamp('two', 3), { ...lamp('fallen', 0), mode: 'dynamic' as const }];
    environment.setDispatch('green-light'); environment.setQuality('high'); environment.update(props, Vector3.Zero()); expect(environment.getStats().environmentLights).toBe(2);
    environment.setQuality('medium'); environment.update(props, Vector3.Zero()); expect(environment.getStats().environmentLights).toBe(1);
    environment.setQuality('low'); environment.update(props, Vector3.Zero()); expect(environment.getStats().environmentLights).toBe(0);
    environment.setQuality('high'); environment.update([], Vector3.Zero()); expect(environment.getStats().environmentLights).toBe(0);
  });
  it('turns lamps off immediately at noon and releases its fixed light pool on disposal', () => {
    environment.setDispatch('green-light'); environment.update([lamp('one', 1)], Vector3.Zero());
    const lights = scene.lights.length;
    for (let i = 0; i < 20; i++) { environment.setDispatch('express-distress'); environment.setDispatch('green-light'); environment.update([lamp('one', 1)], Vector3.Zero()); }
    expect(scene.lights).toHaveLength(lights); environment.setDispatch(null); expect(environment.getStats().environmentLights).toBe(0);
    environment.dispose(); expect(scene.lights).toHaveLength(2);
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
    environment.setDispatch('green-light'); environment.update([prop], Vector3.Zero());
    const light = scene.getLightByName('street-light-0') as any;
    expect(light.position.x).toBeCloseTo(-2); expect(light.position.y).toBeCloseTo(7.1); expect(light.position.z).toBeCloseTo(12.8);
  });
});
