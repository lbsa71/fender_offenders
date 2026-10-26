import type { Scene } from '@babylonjs/core/scene';
import type { VehicleState } from '@fender/contracts';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/instancedMesh';
import { MeshBuilder } from './primitives';
import { WaterCrossings, type SplashCue } from './water-crossings';
interface Drop { mesh: InstancedMesh; life: number; duration: number; vx: number; vy: number; vz: number; floor: number; size: number; owner: string; generation: number }
/** Shared geometry/material, 96 reusable drops; low uses at most 48. */
export class WaterSplashes {
  private crossings = new WaterCrossings();
  private material: StandardMaterial;
  private source: Mesh;
  private drops: Drop[];
  private cursor = 0;
  private disposed = false;
  constructor(scene: Scene) {
    this.material = new StandardMaterial('water-splash-foam', scene);
    this.material.diffuseColor = Color3.FromHexString('#c0e8e9'); this.material.emissiveColor.set(.10, .14, .15); this.material.specularColor.set(0, 0, 0);
    this.source = MeshBuilder.CreateIcoSphere('water-splash-source', { radius: 1, subdivisions: 0 }, scene);
    this.source.material = this.material; this.source.isVisible = false; this.source.isPickable = false;
    this.drops = Array.from({ length: 96 }, (_, i) => {
      const mesh = this.source.createInstance(`water-splash-drop-${i}`); mesh.isVisible = false; mesh.isPickable = false; mesh.setEnabled(false);
      return { mesh, life: 0, duration: 0, vx: 0, vy: 0, vz: 0, floor: 0, size: 0, owner: '', generation: 0 };
    });
  }
  update(vehicles: readonly VehicleState[], dt: number, quality: 'low' | 'medium' | 'high', reducedMotion: boolean): SplashCue[] {
    if (this.disposed) return [];
    const delta = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0, limit = quality === 'low' ? 48 : 96;
    const generations = new Map(vehicles.filter(v => v.status === 'active').map(v => [v.entityId, v.discontinuityId]));
    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i]!;
      if (reducedMotion || i >= limit || generations.get(drop.owner) !== drop.generation) drop.life = 0;
      if (drop.life <= 0) { drop.mesh.isVisible = false; if (drop.mesh.isEnabled()) drop.mesh.setEnabled(false); continue; }
      drop.life -= delta; drop.mesh.position.addInPlaceFromFloats(-drop.vx * delta, drop.vy * delta, drop.vz * delta); drop.vy -= 12.5 * delta;
      if (drop.mesh.position.y < drop.floor || drop.life <= 0) { drop.life = 0; drop.mesh.isVisible = false; drop.mesh.setEnabled(false); continue; }
      const size = drop.size * Math.max(.1, drop.life / drop.duration); drop.mesh.scaling.set(size, size * 2.5, size);
    }
    const cues = this.crossings.update(vehicles, delta);
    if (!reducedMotion) for (const cue of cues) for (const wheel of cue.wheels) {
      const count = quality === 'low' ? 3 : 8;
      for (let i = 0; i < count; i++) {
        const drop = this.drops[this.cursor++ % limit]!, fan = .65 + i / count * .7, outward = wheel.side * (2 + cue.strength * 6) * fan;
        drop.life = drop.duration = .42 + cue.strength * .12; drop.floor = wheel.y; drop.size = .085 + cue.strength * .075;
        drop.owner = cue.entityId; drop.generation = generations.get(cue.entityId)!;
        drop.vx = cue.velocity.x * .4 + Math.cos(cue.yaw) * outward;
        drop.vz = cue.velocity.z * .4 - Math.sin(cue.yaw) * outward;
        drop.vy = 2.4 + cue.strength * 4.2 + (i % 3) * .5;
        drop.mesh.position.set(-wheel.x, wheel.y + .05, wheel.z); drop.mesh.scaling.set(drop.size, drop.size * 2.5, drop.size); drop.mesh.isVisible = true; drop.mesh.setEnabled(true);
      }
    }
    return cues;
  }
  reset(): void { this.crossings.reset(); this.cursor = 0; for (const drop of this.drops) { drop.life = 0; drop.mesh.isVisible = false; if (drop.mesh.isEnabled()) drop.mesh.setEnabled(false); } }
  getStats() { return { waterSplashDrops: this.drops.filter(drop => drop.life > 0).length, waterSplashCapacity: this.disposed ? 0 : this.drops.length }; }
  dispose(): void { if (this.disposed) return; this.reset(); this.disposed = true; for (const drop of this.drops) drop.mesh.dispose(); this.source.dispose(); this.material.dispose(); }
}
