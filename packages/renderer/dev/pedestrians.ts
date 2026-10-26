import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { PedestrianCrowd } from '../src/pedestrians';
import { CarFactory } from '../src/cars';
import { buildCity } from '../src/city';
import type { VehicleState } from '../../contracts/src/index';
const engine = new Engine(document.querySelector('canvas')!, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine); scene.useRightHandedSystem = true; scene.clearColor = Color4.FromHexString('#b8d1ceff');
scene.imageProcessingConfiguration.toneMappingEnabled = true; scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
const camera = new FreeCamera('crowd-camera', new Vector3(21, 23, -32), scene); camera.setTarget(new Vector3(0, 0, -7)); camera.fov = .68;
const sky = new HemisphericLight('sky', Vector3.Up(), scene); sky.intensity = .85; sky.groundColor = Color3.FromHexString('#8c9c82');
const sun = new DirectionalLight('sun', new Vector3(-.65, -1, .45), scene); sun.intensity = 1.1; sun.diffuse = Color3.FromHexString('#ffe1ad');
buildCity(scene); const map = new TransformNode('coordinate-map', scene); map.scaling.x = -1;
for (const mesh of scene.meshes) { mesh.unfreezeWorldMatrix(); mesh.parent = map; mesh.freezeWorldMatrix(); }
const crowd = new PedestrianCrowd(scene), factory = new CarFactory(scene), visual = factory.create('pedestrian-qa-car', 'patrol', false);
visual.health.isVisible = visual.healthBack.isVisible = visual.marker.isVisible = false;
const vehicle = (z: number, x = 4, speed = 28): VehicleState => ({ entityId: 'qa-car', playerId: null, bodyAssetId: 'patrol', pose: { x, z, yaw: 0 }, velocity: { x: 0, z: speed, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 });
let frames = 0, maxHidden = 0, maxRunning = 0, minimumSeparation = Infinity, maxEmergencyRetreats = 0;
const params = new URLSearchParams(location.search), suspect = params.has('suspect'), flee = params.has('flee') || suspect, traffic = params.has('traffic'), moving = flee || traffic;
await scene.whenReadyAsync();
function draw() {
  const car = vehicle(moving ? -52 + Math.min(frames, 84) * 28 / 60 : -24, flee ? 8 : 4, moving ? 28 : 0);
  if (flee && !suspect) car.playerId = 'officer';
  visual.root.position.set(-car.pose.x, .03, car.pose.z);
  crowd.update(moving ? [car] : [], 1 / 60, false, suspect ? car.entityId : undefined);
  const stats = crowd.getStats(); maxHidden = Math.max(maxHidden, stats.hiddenSafety); maxRunning = Math.max(maxRunning, stats.running);
  maxEmergencyRetreats = Math.max(maxEmergencyRetreats, stats.emergencyRetreats);
  for (let id = 0; id < 24; id++) { const person = scene.getTransformNodeByName(`pedestrian-${id}`)!; if (person.isEnabled()) minimumSeparation = Math.min(minimumSeparation, Math.hypot(person.position.x - visual.root.position.x, person.position.z - visual.root.position.z)); }
  document.querySelector('.stats')!.textContent = `BOROUGH FOOT TRAFFIC / ${suspect ? 'SUSPECT APPROACHING' : flee ? 'OFFICER APPROACHING' : traffic ? 'ORDINARY TRAFFIC' : 'AFTERNOON STROLL'}\nVISIBLE ${stats.visible}   WALKING ${stats.walking}\nRUNNING ${stats.running}   WAITING ${stats.waiting}\nSAFETY HIDDEN ${stats.hiddenSafety}`;
  scene.render();
  if (++frames < (moving ? 84 : 120)) requestAnimationFrame(draw);
  else Object.assign(window, { pedestrianQa: { crowd, stats, maxHidden, maxRunning, minimumSeparation, maxEmergencyRetreats, frames, scene } });
}
requestAnimationFrame(draw);
