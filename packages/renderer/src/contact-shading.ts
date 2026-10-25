import type { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { VehicleState } from '@fender/contracts';
import { districtMap, roadCenters } from '@fender/content';
import { MeshBuilder } from './primitives';

function surfaceHeight(x: number, z: number): number {
  if (roadCenters.some(c => Math.abs(x - c) < 8 || Math.abs(z - c) < 8)) return .042;
  for (const s of districtMap.surfaces.filter(s => s.surface === 'dirt')) {
    const p = s.polygonXZ; let inside = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if ((p[i + 1]! > z) !== (p[j + 1]! > z) && x < (p[j]! - p[i]!) * (z - p[i + 1]!) / (p[j + 1]! - p[i + 1]!) + p[i]!) inside = !inside;
    }
    if (inside) return .27;
  }
  return Math.abs(x) < 72 && Math.abs(z) < 72 ? .236 : .166;
}

/** Small road-attached diffuse contact patches; no AO pass or shadow light. */
export class ContactShading {
  readonly meshes: Mesh[];
  private readonly material: StandardMaterial;
  private readonly texture: RawTexture;
  private disposed = false;
  constructor(scene: Scene) {
    const size = 32, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const r = Math.hypot((x + .5 - size / 2) / (size / 2), (y + .5 - size / 2) / (size / 2));
      pixels[(y * size + x) * 4 + 3] = Math.round(Math.max(0, 1 - r) ** 2 * 55);
    }
    this.texture = RawTexture.CreateRGBATexture(pixels, size, size, scene, false, false, Texture.BILINEAR_SAMPLINGMODE); this.texture.hasAlpha = true;
    this.texture.name = 'vehicle-contact';
    this.material = new StandardMaterial('vehicle-contact', scene); this.material.disableLighting = true;
    this.material.diffuseTexture = this.texture; this.material.useAlphaFromDiffuseTexture = true; this.material.disableDepthWrite = true; this.material.backFaceCulling = false;
    this.meshes = Array.from({ length: 32 }, (_, i) => {
      const mesh = MeshBuilder.CreatePlane(`vehicle-contact-${i}`, { width: 2.6, height: 4.8 }, scene);
      mesh.rotation.x = Math.PI / 2; mesh.material = this.material; mesh.isPickable = false; mesh.isVisible = false; return mesh;
    });
  }
  update(vehicles: readonly VehicleState[]): void {
    if (this.disposed) return; this.reset(); let index = 0;
    for (const vehicle of vehicles) {
      if (vehicle.status === 'respawning') continue;
      const mesh = this.meshes[index++]; if (!mesh) break;
      mesh.position.set(-vehicle.pose.x, surfaceHeight(vehicle.pose.x, vehicle.pose.z), vehicle.pose.z);
      mesh.rotation.set(Math.PI / 2, 0, -vehicle.pose.yaw); mesh.isVisible = true;
    }
  }
  reset(): void { for (const mesh of this.meshes) mesh.isVisible = false; }
  getStats() { return { contactPatches: this.meshes.filter(m => m.isVisible).length }; }
  dispose(): void { if (this.disposed) return; this.reset(); this.disposed = true; for (const mesh of this.meshes) mesh.dispose(); this.material.dispose(); this.texture.dispose(); }
}
