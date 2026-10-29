import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { ROAD_GADGET_RULES, type RoadGadgetState, type VehicleState } from '@fender/contracts';
import { MeshBuilder } from './primitives';
import {SmogEffects} from './smog';
interface Slot { oil: Mesh; rim: Mesh; film: Mesh; root: TransformNode; caps: Mesh[]; blades: Mesh[]; meshes: Mesh[] }
function puddle(name: string, radius: number, scene: Scene, phase = 0): Mesh {
  const mesh = new Mesh(name, scene), data = new VertexData(), count = 24;
  data.positions = [0, 0, 0]; data.normals = [0, 1, 0]; data.indices = [];
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count, r = radius * (.9 + .06 * Math.sin(angle * 3 + phase) + .04 * Math.cos(angle * 5 - phase));
    data.positions.push(Math.cos(angle) * r, 0, Math.sin(angle) * r); data.normals.push(0, 1, 0); data.indices.push(0, (i + 1) % count + 1, i + 1);
  }
  data.applyToMesh(mesh); return mesh;
}
/** Fixed-size pool reconstructed entirely from current authoritative warnings. */
export class RoadGadgetEffects {
  private readonly slots: Slot[];
  private readonly materials: StandardMaterial[] = [];
  private readonly amber: StandardMaterial;
  private readonly steel: StandardMaterial;
  private readonly film: StandardMaterial;
  private readonly smog: SmogEffects;
  private tick = 0;
  private disposed = false;
  private stats = { oilSlicks: 0, wheelBladeWarnings: 0, wheelBlades: 0 };
  constructor(scene: Scene) {
    this.smog=new SmogEffects(scene);
    const material = (name: string, color: string, shine = false) => {
      const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color);
      m.specularColor = Color3.FromHexString(shine ? '#a9c9dc' : '#3c4148'); m.specularPower = shine ? 96 : 24;
      this.materials.push(m); return m;
    };
    const oil = material('gadget-oil-finish', '#182a32', true);
    oil.backFaceCulling = false;
    this.amber = material('gadget-warning-amber', '#ffbf52'); this.amber.emissiveColor.set(.28, .12, .015);
    this.steel = material('gadget-blade-steel', '#c0dbe1', true);
    this.film = material('gadget-oil-iridescence', '#637f9b', true);
    this.film.alpha = .35; this.film.disableDepthWrite = true; this.film.backFaceCulling = false;
    this.slots = Array.from({ length: ROAD_GADGET_RULES.maxActive }, (_, index) => {
      const patch = puddle(`gadget-${index}-oil`, ROAD_GADGET_RULES.oilRadius, scene); patch.material = oil;
      const rim = MeshBuilder.CreateTorus(`gadget-${index}-oil-rim`, { diameter: ROAD_GADGET_RULES.oilRadius * 2, thickness: .055, tessellation: 32 }, scene);
      const film = puddle(`gadget-${index}-oil-film`, 1.8, scene, 1.2); film.material = this.film; film.scaling.z = .72;
      const root = new TransformNode(`gadget-${index}-hubcaps`, scene), caps: Mesh[] = [], blades: Mesh[] = [];
      for (const side of [-1, 1]) for (const z of [-1.3, 1.3]) {
        const cap = MeshBuilder.CreateTorus(`gadget-${index}-hubcap-${side}-${z}`, { diameter: .62, thickness: .08, tessellation: 12 }, scene);
        cap.parent = root; cap.position.set(side * 1.06, .58, z); cap.rotation.z = Math.PI / 2; caps.push(cap);
        const blade = MeshBuilder.CreateBox(`gadget-${index}-blade-${side}-${z}`, { width: .7, height: .09, depth: .22 }, scene);
        blade.parent = root; blade.position.set(side * 1.4, .58, z); blade.material = this.steel; blades.push(blade);
      }
      const meshes = [patch, rim, film, ...caps, ...blades]; for (const mesh of meshes) mesh.isPickable = false;
      return { oil: patch, rim, film, root, caps, blades, meshes };
    });
    this.reset();
  }
  render(gadgets: readonly RoadGadgetState[], vehicles: readonly VehicleState[], tick: number, reducedMotion = false): void {
    if (this.disposed) return;
    if (Number.isFinite(tick)) this.tick = Math.max(this.tick, tick);
    this.smog.render(gadgets,vehicles,this.tick,reducedMotion);
    this.hide(); let index = 0;
    for (const g of gadgets) {
      if(g.kind==='smog')continue;
      const owner = vehicles.find(v => v.entityId === g.ownerEntityId);
      if (index >= this.slots.length) break;
      if (!owner || owner.status !== 'active' || owner.protectedUntilTick > this.tick || this.tick < g.bornTick || this.tick >= g.expiresTick || !Object.values(g.pose).every(Number.isFinite)) continue;
      const slot = this.slots[index++]!, warning = this.tick < g.activeAtTick;
      if (g.kind === 'oil') {
        this.stats.oilSlicks++;
        slot.oil.position.set(-g.pose.x, .035, g.pose.z); slot.rim.position.set(-g.pose.x, .055, g.pose.z); slot.film.position.set(-g.pose.x, .052, g.pose.z);
        slot.rim.material = warning ? this.amber : this.film;
        for (const mesh of [slot.oil, slot.rim, slot.film]) { mesh.setEnabled(true); mesh.isVisible = true; }
      } else {
        if (warning) this.stats.wheelBladeWarnings++; else this.stats.wheelBlades++;
        slot.root.setEnabled(true); slot.root.position.set(-owner.pose.x, 0, owner.pose.z); slot.root.rotation.y = -owner.pose.yaw;
        for (const cap of slot.caps) { cap.setEnabled(true); cap.isVisible = true; cap.material = warning ? this.amber : this.steel; }
        for (const blade of slot.blades) { blade.setEnabled(!warning); blade.isVisible = !warning; blade.rotation.x = reducedMotion ? 0 : (this.tick - g.activeAtTick) * .18; }
      }
    }
  }
  private hide(): void {
    this.stats = { oilSlicks: 0, wheelBladeWarnings: 0, wheelBlades: 0 };
    for (const slot of this.slots) { slot.root.setEnabled(false); for (const mesh of slot.meshes) { mesh.setEnabled(false); mesh.isVisible = false; } }
  }
  getStats() { return { ...this.stats,...this.smog.getStats() }; }
  reset(): void { if (this.disposed) return; this.tick = 0; this.hide(); this.smog.reset(); }
  dispose(): void { if (this.disposed) return; this.reset(); this.disposed = true;this.smog.dispose(); for (const slot of this.slots) { for (const mesh of slot.meshes) mesh.dispose(); slot.root.dispose(); } for (const material of this.materials) material.dispose(); }
}
