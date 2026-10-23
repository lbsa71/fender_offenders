import { afterEach, beforeEach, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { PropVisuals } from './props';
import type { PropKind, PropState } from '@fender/contracts';

let engine: NullEngine, scene: Scene, props: PropVisuals;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); props = new PropVisuals(scene); });
afterEach(() => { props.dispose(); scene.dispose(); engine.dispose(); });
const state = (entityId: string, kind: PropKind, mode: PropState['mode'] = 'fixed'): PropState => ({ entityId, kind, position: { x: 3, y: 2.4, z: 7 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, mode, scale: 1, sleeping: false, discontinuityId: 0 });

it('draws every authored prop kind, reflecting position and full falling rotation once', () => {
  const tree = { ...state('tree', 'tree', 'dynamic'), rotation: { x: .6, y: 0, z: 0, w: .8 } };
  props.render([tree, ...(['barrel', 'crate', 'bin', 'lamp', 'sign', 'bench'] as PropKind[]).map(kind => state(kind, kind))]);
  expect(props.getStats()).toEqual({ props: 7, dynamicProps: 1 });
  const root = scene.getTransformNodeByName('prop-tree')!;
  expect(root.position.asArray()).toEqual([-3, 2.4, 7]);
  root.rotationQuaternion!.asArray().forEach((value, index) => expect(value).toBeCloseTo([.6, 0, 0, .8][index]!, 8));
  expect(root.getChildMeshes().length).toBeGreaterThanOrEqual(2);
});

it('updates a fixed lamp to fallen, reuses native resources, and removes vanished props', () => {
  props.render([state('lamp', 'lamp')]);
  const count = scene.meshes.length, materials = scene.materials.length;
  for (let i = 0; i < 100; i++) props.render([{ ...state('lamp', 'lamp', 'dynamic'), position: { x: i, y: .3, z: 7 }, rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } }]);
  expect(props.getStats().dynamicProps).toBe(1);
  expect(scene.getTransformNodeByName('prop-lamp')!.position.x).toBe(-99);
  expect(scene.getTransformNodeByName('prop-lamp')!.rotationQuaternion!.z).toBe(-Math.SQRT1_2);
  expect(scene.meshes.length).toBe(count); expect(scene.materials.length).toBe(materials);
  props.render([]); expect(props.getStats().props).toBe(0); expect(scene.getTransformNodeByName('prop-lamp')).toBeNull();
});

it('reset and disposal clear instances and shared templates without resource growth', () => {
  props.render([state('barrel', 'barrel'), state('bench', 'bench')]);
  props.reset(); expect(props.getStats().props).toBe(0);
  props.render([state('fresh-tree', 'tree')]); expect(props.getStats().props).toBe(1);
  props.dispose(); props.dispose(); expect(scene.meshes.length).toBe(0); expect(scene.materials.length).toBe(0);
});
