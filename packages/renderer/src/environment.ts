import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Scene } from '@babylonjs/core/scene';
import {findCampaignDispatch,type PropState,type SceneManifest} from '@fender/contracts';
import { StreetLightField } from './street-light-field';

type Theme = 'noon' | 'dusk' | 'night' | 'snow';
export function themeForDispatch(id:string|null):Theme{return findCampaignDispatch(id)?.dispatch.theme??'noon';}

const profiles = {
  snow: { sky:'#c3d1dc',fog:'#cbd8df',start:90,end:215,direction:[-.5,-1,.3],key:'#e8f2ff',keyPower:1,fill:'#d3e2ed',ground:'#8facc0',fillPower:.8,exposure:1,lamp:.35 },
  noon: { sky: '#b8d1ce', fog: '#b8d1ce', start: 110, end: 235, direction: [-.55, -1, .35], key: '#ffe8c5', keyPower: 1.2, fill: '#d4e4df', ground: '#8c9c82', fillPower: .7, exposure: 1, lamp: 0 },
  dusk: { sky: '#c99c99', fog: '#c9a6a2', start: 95, end: 215, direction: [-.85, -.65, .5], key: '#ffbd82', keyPower: 1.25, fill: '#b6c8e3', ground: '#737e91', fillPower: .65, exposure: 1.04, lamp: .55 },
  night: { sky: '#263d58', fog: '#40546c', start: 85, end: 195, direction: [.45, -.9, -.6], key: '#b1ccec', keyPower: .8, fill: '#9eafcf', ground: '#687c8c', fillPower: .55, exposure: 1.12, lamp: 1 },
} as const;

/** Cosmetic themes only. Every upright lamp contributes to one persistent, camera-independent field. */
export class DispatchEnvironment {
  private theme: Theme = 'noon';
  private dispatch: string | null = null;
  private baseline: SceneManifest['environment'] | null = null;
  private disposed = false;
  readonly lighting: StreetLightField;

  constructor(private scene: Scene, private sun: DirectionalLight, private sky: HemisphericLight) {
    this.lighting = new StreetLightField(scene);
    this.apply();
  }

  setDispatch(id: string | null): void {
    if (this.disposed || id === this.dispatch) return;
    this.dispatch = id; this.theme = themeForDispatch(id); this.apply();
  }
  loadBaseline(environment: SceneManifest['environment']): void { this.baseline = environment; if (!this.disposed) this.apply(); }
  get lampGlow(): number { return profiles[this.theme].lamp; }

  private apply(): void {
    const p = profiles[this.theme], base = this.dispatch === null ? this.baseline : null;
    this.scene.clearColor = Color4.FromColor3(Color3.FromHexString(base?.skyColor ?? p.sky), 1);
    this.scene.fogMode = Scene.FOGMODE_LINEAR; this.scene.fogColor = Color3.FromHexString(base?.fogColor ?? p.fog);
    this.scene.fogStart = p.start; this.scene.fogEnd = p.end;
    this.sun.direction = Vector3.FromArray(base?.sunDirection ?? [...p.direction]);
    this.sun.diffuse = Color3.FromHexString(p.key); this.sun.intensity = p.keyPower;
    // Keep the shadow view and key direction coherent when changing sun to moon.
    this.sun.position.copyFrom(this.sun.direction).scaleInPlace(-100);
    this.sky.diffuse = Color3.FromHexString(p.fill); this.sky.groundColor = Color3.FromHexString(p.ground); this.sky.intensity = p.fillPower;
    this.scene.ambientColor = Color3.FromHexString(p.ground);
    this.scene.imageProcessingConfiguration.exposure = p.exposure;
    this.lighting.strength = p.lamp * 1.3;
  }

  update(props: readonly PropState[]): void {
    if (!this.disposed) this.lighting.update(props);
  }

  getStats() { return { environmentTheme: this.theme, environmentDispatchId: this.dispatch, environmentLights: this.lampGlow ? this.lighting.sources.length : 0 }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.lighting.dispose(); }
}
