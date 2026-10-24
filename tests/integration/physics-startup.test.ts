import { expect, it, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { createSimulation, initPhysics } from '@fender/sim';
import { districtMap } from '@fender/content';
import { WreckEffects } from '../../packages/renderer/src/wreck-effects';

vi.mock('@dimforge/rapier3d-compat', async load => {
  const actual = await load<typeof import('@dimforge/rapier3d-compat')>();
  // Count the external WASM initialization boundary while retaining real worlds/bodies.
  return { ...actual, default: { ...actual.default, init: vi.fn(actual.default.init) } };
});

it('keeps authoritative scenery valid when local wreck physics initializes and is disposed', async () => {
  await initPhysics();
  const sim = createSimulation(districtMap, { mode: 'practice', trafficCount: 0, props: [{ entityId: 'startup-barrel', kind: 'barrel', position: { x: 4, y: .6, z: -43 } }] });
  const baseline = sim.snapshot().props;
  const engine = new NullEngine(), scene = new Scene(engine), effects = new WreckEffects(scene);
  let sceneryValid = false;
  try {
    await effects.ready;
    expect(RAPIER.init, 'simulation and debris must share one WASM initialization').toHaveBeenCalledTimes(1);
    expect(() => sim.snapshot(), 'initializing debris must not reinitialize WASM and invalidate the existing simulation').not.toThrow();
    expect(sim.snapshot().props).toEqual(baseline);
    sceneryValid = true;
    effects.dispose();
    expect(() => sim.step(new Map())).not.toThrow();
    expect(sim.snapshot().props?.[0]?.entityId).toBe('startup-barrel');
  } finally {
    effects.dispose(); scene.dispose(); engine.dispose();
    // The RED implementation destroys the native arena; an invalid arena cannot safely be freed again.
    if (sceneryValid) sim.dispose();
  }
});
