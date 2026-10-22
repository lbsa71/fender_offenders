import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { VEHICLE_BODIES } from '../../content/src/index';
import { MeshBuilder } from '../src/primitives';
import { CarFactory } from '../src/cars';

const descriptions = ['Borough patrol · classic sedan', 'Interceptor · pursuit coupe', 'Roadster · open-road trouble', 'Army · utility 4×4', 'Ambulance · emergency response', 'Fire chief · command SUV'];
const rear = new URLSearchParams(location.search).has('rear');
const scenes: Scene[] = [];
VEHICLE_BODIES.forEach((body, index) => {
  const article = document.createElement('article');
  article.innerHTML = `<canvas aria-label="${body} procedural vehicle"></canvas><span class="number">UNIT / 0${index + 1}</span><h2>${body.replace('-', ' ')}</h2><p>${descriptions[index]}</p>`;
  document.querySelector('main')!.append(article);
  const engine = new Engine(article.querySelector('canvas')!, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine); scenes.push(scene); scene.useRightHandedSystem = true; scene.clearColor = Color4.FromHexString('#dce5d7ff');
  scene.imageProcessingConfiguration.toneMappingEnabled = true; scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  const camera = new FreeCamera(body, new Vector3(rear ? -6 : 6, 4.2, rear ? -7.3 : 7.3), scene); camera.fov = .61; camera.setTarget(new Vector3(0, 1.05, 0));
  const sky = new HemisphericLight('sky', Vector3.Up(), scene); sky.intensity = .85; sky.groundColor = Color3.FromHexString('#a0b49a');
  const sun = new DirectionalLight('sun', new Vector3(-.7, -1, -.5), scene); sun.position.set(8, 12, 6); sun.intensity = 1.1; sun.diffuse = Color3.FromHexString('#ffe6bd');
  const shadows = new ShadowGenerator(1024, sun); shadows.usePercentageCloserFiltering = true; shadows.bias = .003; shadows.normalBias = .08; shadows.darkness = .22;
  const ground = MeshBuilder.CreateBox('ground', { width: 200, depth: 200, height: .05 }, scene); ground.position.y = -.025; ground.receiveShadows = true;
  const mat = new StandardMaterial('floor', scene); mat.diffuseColor = Color3.FromHexString('#c3d1bf'); mat.specularColor.set(0, 0, 0); ground.material = mat;
  const car = new CarFactory(scene).create(body, body, false); car.health.isVisible = car.healthBack.isVisible = car.marker.isVisible = false;
  car.parts.forEach(part => shadows.addShadowCaster(part));
  engine.resize();
});
let frames = 0;
function render() { scenes.forEach(scene => scene.render()); if (++frames < 20) requestAnimationFrame(render); else Object.assign(window, { fleetReady: true }); }
await Promise.all(scenes.map(scene => scene.whenReadyAsync()));
requestAnimationFrame(render);
