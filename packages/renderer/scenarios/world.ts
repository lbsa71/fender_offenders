import { createGameRenderer } from '../src/index';
import { initPhysics, createSimulation } from '@fender/sim';
import { districtMap } from '@fender/content';
import { neutralActions, type PropDefinition } from '@fender/contracts';
await initPhysics();
const definitions: PropDefinition[] = [
  { entityId: 'barrel', kind: 'barrel', position: { x: 4, y: .62, z: -41 } },
  { entityId: 'crate', kind: 'crate', position: { x: 5.1, y: .52, z: -38 } },
  { entityId: 'bin', kind: 'bin', position: { x: 2.9, y: .57, z: -37 } },
  { entityId: 'lamp', kind: 'lamp', position: { x: 4, y: 2.5, z: -35 } },
  { entityId: 'tree', kind: 'tree', position: { x: 4, y: 2.4, z: -31 } },
  { entityId: 'bench', kind: 'bench', position: { x: 4, y: .6, z: -27 } },
  { entityId: 'sign', kind: 'sign', position: { x: 4, y: 1.5, z: -24 } },
];
const simulation = createSimulation(districtMap, { mode: 'practice', trafficCount: 0, props: definitions });
const car = simulation.addPlayer({ playerId: 'fixture', nickname: 'Physics driver', bodyAssetId: 'army', sessionEpoch: 'fixture' });
const renderer = createGameRenderer(document.querySelector<HTMLCanvasElement>('#game')!, districtMap, { quality: 'high', muted: true, reducedShake: true, cameraDistance: .75, cameraLookAhead: 0 });
let tick = 0;
function render() {
  const state = simulation.snapshot('fixture');
  renderer.render({ sampleTimeSeconds: tick / 60, vehicles: state.vehicles, projectiles: state.projectiles, props: state.props, localEntityId: car.entityId, cameraTarget: { x: 4, z: -33, yaw: 0 } }, 1 / 60);
}
function advance(steps: number, driving = true) {
  for (let i = 0; i < steps; i++) {
    simulation.step(new Map([[car.entityId, { actions: { ...neutralActions(), throttle: driving ? 1 : 0 }, sessionEpoch: 'fixture', sourceCommandSequence: tick++ }]]));
    renderer.present(simulation.drainEvents()); render();
  }
  return simulation.snapshot('fixture');
}
render();
Object.assign(window, { worldFixture: { renderer, simulation, advance, render, get state() { return simulation.snapshot('fixture'); } } });
