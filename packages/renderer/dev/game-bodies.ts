import { createGameRenderer } from '../src/index';
import { districtMap, VEHICLE_BODIES } from '../../content/src/index';
import type { RenderFrame, VehicleState } from '../../contracts/src/index';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';

const renderer = createGameRenderer(document.querySelector('canvas')!, districtMap, { quality: 'high', muted: true });
const frame: RenderFrame = {
  sampleTimeSeconds: 0, localEntityId: null, cameraTarget: { x: 0, z: -36, yaw: 0 }, projectiles: [],
  vehicles: VEHICLE_BODIES.map((bodyAssetId, i): VehicleState => ({ entityId: bodyAssetId, playerId: bodyAssetId, bodyAssetId, pose: { x: (i % 3 - 1) * 5.3, z: i < 3 ? -30 : -44, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 })),
};
const labels = VEHICLE_BODIES.map(body => { const label = document.createElement('div'); label.className = 'label'; label.textContent = body.replace('-', ' '); document.body.append(label); return label; });
let frames = 0;
function draw() {
  renderer.render(frame, 1 / 60);
  const scene = EngineStore.LastCreatedScene!;
  const viewport = scene.activeCamera!.viewport.toGlobal(scene.getEngine().getRenderWidth(), scene.getEngine().getRenderHeight());
  frame.vehicles.forEach((vehicle, i) => {
    const root = scene.getTransformNodeByName(`vehicle-${vehicle.entityId}`)!; root.computeWorldMatrix(true);
    const point = Vector3.Project(Vector3.TransformCoordinates(new Vector3(0, 3.5, 0), root.getWorldMatrix()), Matrix.Identity(), scene.getTransformMatrix(), viewport);
    labels[i]!.style.left = `${point.x}px`; labels[i]!.style.top = `${point.y}px`;
  });
  if (++frames < 45) requestAnimationFrame(draw); else Object.assign(window, { fleetReady: true });
}
await EngineStore.LastCreatedScene!.whenReadyAsync();
requestAnimationFrame(draw);
