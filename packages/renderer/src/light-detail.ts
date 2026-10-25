import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import type { Plane } from '@babylonjs/core/Maths/math.plane';
import { SpotLight } from '@babylonjs/core/Lights/spotLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { CollisionMap, RenderFrame } from '@fender/contracts';
import type { CarVisual } from './cars';
import { MeshBuilder } from './primitives';
import { buildings } from '@fender/content';

const gabledBuildings = new Set(buildings.filter(b => b.kind === 'house').map(b => b.id));

/** Exact source clipping plus conservative authored building occlusion, in renderer coordinates. */
export function sourceIsVisible(source: Vector3, eye: Vector3, planes: readonly Plane[], map: CollisionMap): boolean {
  if (planes.some(plane => plane.dotCoordinate(source) <= 0)) return false;
  for (const c of map.colliders) {
    if (!c.halfExtents || c.layer !== 'world-solid') continue;
    const cos = Math.cos(c.pose.yaw), sin = Math.sin(c.pose.yaw);
    const local = (p: Vector3) => { const x = -p.x - c.pose.x, z = p.z - c.pose.z; return [x * cos - z * sin, p.y, x * sin + z * cos]; };
    const a = local(eye), b = local(source), h = c.halfExtents;
    const roof = gabledBuildings.has(c.id) ? 3.2 : .8;
    const min = [-h.x - .5, -.1, -h.z - .5], max = [h.x + .5, h.y * 2 + roof, h.z + .5];
    let enter = 0, exit = 1;
    for (let axis = 0; axis < 3; axis++) {
      const delta = b[axis]! - a[axis]!;
      if (Math.abs(delta) < .00001) { if (a[axis]! < min[axis]! || a[axis]! > max[axis]!) { exit = -1; break; } }
      else {
        const t1 = (min[axis]! - a[axis]!) / delta, t2 = (max[axis]! - a[axis]!) / delta;
        enter = Math.max(enter, Math.min(t1, t2)); exit = Math.min(exit, Math.max(t1, t2));
      }
    }
    if (enter <= exit && exit > .0001 && enter < .9999) return false;
  }
  return true;
}

/** Two shadowless headlight cones and eight steady, occluded source halos. No full-screen effect. */
export class LightDetail {
  readonly headlights: SpotLight[];
  readonly glints: Mesh[];
  private readonly texture: RawTexture;
  private readonly material: StandardMaterial;
  private readonly windows: StandardMaterial[];
  private disposed = false;

  constructor(private scene: Scene, private map: CollisionMap) {
    this.windows = scene.materials.filter((m): m is StandardMaterial => m instanceof StandardMaterial && ['#4f7e87false', '#517e87false'].includes(m.name));
    this.headlights = Array.from({ length: 2 }, (_, i) => {
      const light = new SpotLight(`car-headlight-${i}`, Vector3.Zero(), new Vector3(0, -.12, 1), .68, 2, scene);
      light.diffuse = Color3.FromHexString('#ffe4af'); light.specular = light.diffuse; light.range = 23; light.intensity = 0;
      light.setEnabled(false); return light;
    });
    const size = 32, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot((x + .5 - size / 2) / (size / 2), (y + .5 - size / 2) / (size / 2)), i = (y * size + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255; pixels[i + 3] = Math.round(Math.max(0, 1 - r) ** 3 * 145);
    }
    this.texture = RawTexture.CreateRGBATexture(pixels, size, size, scene, false, false, Texture.BILINEAR_SAMPLINGMODE); this.texture.hasAlpha = true;
    this.texture.name = 'source-halo';
    this.material = new StandardMaterial('source-halo', scene); this.material.disableLighting = true;
    this.material.emissiveColor = Color3.FromHexString('#ffd398'); this.material.diffuseTexture = this.texture;
    this.material.useAlphaFromDiffuseTexture = true; this.material.alphaMode = Constants.ALPHA_ADD;
    this.material.disableDepthWrite = true; this.material.backFaceCulling = false;
    this.glints = Array.from({ length: 8 }, (_, i) => {
      const mesh = MeshBuilder.CreatePlane(`source-glint-${i}`, { size: .85 }, scene);
      mesh.material = this.material; mesh.billboardMode = Mesh.BILLBOARDMODE_ALL; mesh.isPickable = false; mesh.isVisible = false; return mesh;
    });
  }

  update(frame: RenderFrame, cars: ReadonlyMap<string, CarVisual>, lampSources: readonly { position: Vector3 }[], strength: number, quality: 'low' | 'medium' | 'high', reducedFlash: boolean): void {
    if (this.disposed) return;
    for (const mesh of this.glints) mesh.isVisible = false;
    for (const material of this.windows) material.emissiveColor.set(.46 * strength, .24 * strength, .085 * strength);
    if (strength <= 0) { this.setHeadlightCount(0); return; }
    const camera = this.scene.activeCamera; if (!camera) { this.setHeadlightCount(0); return; }
    const candidates = frame.vehicles.filter(v => v.status === 'active' && cars.get(v.entityId)?.wreckLife !== v.discontinuityId)
      .sort((a, b) => Number(b.entityId === frame.localEntityId) - Number(a.entityId === frame.localEntityId) || Math.hypot(-a.pose.x - camera.position.x, a.pose.z - camera.position.z) - Math.hypot(-b.pose.x - camera.position.x, b.pose.z - camera.position.z));
    const cap = quality === 'low' ? 0 : quality === 'medium' ? 1 : 2;
    const sources: Vector3[] = [];
    for (let i = 0; i < Math.min(cap, candidates.length); i++) {
      const vehicle = candidates[i]!, car = cars.get(vehicle.entityId); if (!car) continue;
      car.body.computeWorldMatrix(true);
      const matrix = car.body.getWorldMatrix(), light = this.headlights[i]!;
      light.position.copyFrom(Vector3.TransformCoordinates(new Vector3(0, .9, 2.22), matrix));
      light.direction.copyFrom(Vector3.TransformNormal(new Vector3(0, -.12, 1), matrix)).normalize();
      light.intensity = 1.1 * strength; sources.push(light.position);
    }
    this.setHeadlightCount(sources.length);
    if (quality === 'low' || reducedFlash) return;
    const planes = Frustum.GetPlanes(camera.getViewMatrix().multiply(camera.getProjectionMatrix()));
    const visible = [...lampSources.map(s => s.position), ...sources]
      .filter(source => sourceIsVisible(source, camera.position, planes, this.map))
      .sort((a, b) => Vector3.DistanceSquared(a, camera.position) - Vector3.DistanceSquared(b, camera.position));
    for (let i = 0; i < Math.min(8, visible.length); i++) {
      const mesh = this.glints[i]!; mesh.position.copyFrom(visible[i]!); mesh.visibility = strength * .65; mesh.isVisible = true;
    }
  }
  private setHeadlightCount(count: number): void {
    // Changing membership invalidates every receiver's light/shader defines in Babylon.
    // Moving an existing cone only needs uniform updates.
    for (let i = 0; i < this.headlights.length; i++) {
      const light = this.headlights[i]!, enabled = i < count;
      if (!enabled) light.intensity = 0;
      if (light.isEnabled() !== enabled) light.setEnabled(enabled);
    }
  }
  reset(): void { this.setHeadlightCount(0); for (const mesh of this.glints) mesh.isVisible = false; }
  getStats() { return { headlightLights: this.headlights.filter(l => l.isEnabled()).length, sourceGlints: this.glints.filter(m => m.isVisible).length, fullScreenBloomPasses: 0 }; }
  dispose(): void {
    if (this.disposed) return; this.reset(); this.disposed = true;
    for (const light of this.headlights) light.dispose(); for (const mesh of this.glints) mesh.dispose(); this.material.dispose(); this.texture.dispose();
    for (const material of this.windows) material.emissiveColor.set(0, 0, 0);
  }
}
