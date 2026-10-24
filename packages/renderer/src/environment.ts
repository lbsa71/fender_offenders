import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Scene } from '@babylonjs/core/scene';
import type { PropState, SceneManifest } from '@fender/contracts';

type Theme = 'noon' | 'dusk' | 'night';
const dispatchThemes = new Map<string, Theme>([
  ['loose-change', 'noon'], ['clamp-down', 'noon'], ['duplicate-trouble', 'dusk'], ['express-distress', 'dusk'], ['stamp-duty', 'night'],
  ['false-alarm', 'noon'], ['cone-of-silence', 'dusk'], ['premium-care', 'night'], ['paper-trail', 'dusk'], ['green-light', 'night'],
]);
export function themeForDispatch(id: string | null): Theme { return dispatchThemes.get(id ?? '') ?? 'noon'; }

const profiles = {
  noon: { sky: '#b8d1ce', fog: '#b8d1ce', start: 110, end: 235, direction: [-.55, -1, .35], key: '#ffe8c5', keyPower: 1.2, fill: '#d4e4df', ground: '#8c9c82', fillPower: .7, exposure: 1, lamp: 0 },
  dusk: { sky: '#c99c99', fog: '#c9a6a2', start: 95, end: 215, direction: [-.85, -.65, .5], key: '#ffbd82', keyPower: 1.25, fill: '#b6c8e3', ground: '#737e91', fillPower: .65, exposure: 1.04, lamp: .55 },
  night: { sky: '#263d58', fog: '#40546c', start: 85, end: 195, direction: [.45, -.9, -.6], key: '#b1ccec', keyPower: .8, fill: '#9eafcf', ground: '#687c8c', fillPower: .55, exposure: 1.12, lamp: 1 },
} as const;

/** Cosmetic themes only. Two reusable, shadow-free lights follow actual upright lamp props. */
export class DispatchEnvironment {
  private theme: Theme = 'noon';
  private dispatch: string | null = null;
  private quality: 'low' | 'medium' | 'high' = 'high';
  private baseline: SceneManifest['environment'] | null = null;
  private disposed = false;
  private readonly spots: SpotLight[];
  private readonly offset = Vector3.Zero();
  private readonly rotation = Quaternion.Identity();
  private readonly down = Vector3.Down();
  private readonly direction = Vector3.Down();

  constructor(private scene: Scene, private sun: DirectionalLight, private sky: HemisphericLight) {
    this.spots = Array.from({ length: 2 }, (_, i) => {
      const light = new SpotLight(`street-light-${i}`, Vector3.Zero(), Vector3.Down(), Math.PI * .82, 2, scene);
      light.diffuse = Color3.FromHexString('#ffe0a4'); light.specular = Color3.FromHexString('#e5be83'); light.range = 20;
      light.setEnabled(false); return light;
    });
    this.apply();
  }

  setDispatch(id: string | null): void {
    if (this.disposed || id === this.dispatch) return;
    this.dispatch = id; this.theme = themeForDispatch(id); this.apply();
  }
  loadBaseline(environment: SceneManifest['environment']): void { this.baseline = environment; if (!this.disposed) this.apply(); }
  setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.quality = quality;
    for (let i = quality === 'low' ? 0 : quality === 'medium' ? 1 : 2; i < this.spots.length; i++) this.spots[i]!.setEnabled(false);
  }
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
    for (const light of this.spots) { light.intensity = p.lamp * 1.6; if (!p.lamp) light.setEnabled(false); }
  }

  update(props: readonly PropState[], target: Vector3): void {
    if (this.disposed) return;
    const cap = this.lampGlow === 0 || this.quality === 'low' ? 0 : this.quality === 'medium' ? 1 : 2;
    // Match the prop adapter's population bound. Stable tie order avoids arbitrary flicker.
    const candidates = cap ? props.slice(0, 192).filter(p => p.kind === 'lamp' && p.mode === 'fixed' && Math.abs(p.rotation.x) < .1 && Math.abs(p.rotation.z) < .1 && Math.hypot(-p.position.x - target.x, p.position.z - target.z) < 45)
      .sort((a, b) => Math.hypot(-a.position.x - target.x, a.position.z - target.z) - Math.hypot(-b.position.x - target.x, b.position.z - target.z) || a.entityId.localeCompare(b.entityId)) : [];
    for (let i = 0; i < this.spots.length; i++) {
      const light = this.spots[i]!, prop = i < cap ? candidates[i] : undefined;
      light.setEnabled(!!prop); light.metadata = prop ? { propId: prop.entityId } : null;
      if (!prop) continue;
      const q = prop.rotation; this.rotation.set(q.x, q.y, q.z, q.w).normalize();
      this.offset.set(-1.4 * prop.scale, 2.3 * prop.scale, 0).rotateByQuaternionToRef(this.rotation, this.offset);
      light.position.set(-(prop.position.x + this.offset.x), prop.position.y + this.offset.y, prop.position.z + this.offset.z);
      this.down.rotateByQuaternionToRef(this.rotation, this.direction); light.direction.set(-this.direction.x, this.direction.y, this.direction.z);
    }
  }

  getStats() { return { environmentTheme: this.theme, environmentDispatchId: this.dispatch, environmentLights: this.spots.filter(l => l.isEnabled()).length }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; for (const light of this.spots) light.dispose(); }
}
