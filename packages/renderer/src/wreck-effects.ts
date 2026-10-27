import type { Scene } from '@babylonjs/core/scene';
import type { CollisionMap, PlanarPose } from '@fender/contracts';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { VEHICLE_BODIES } from '@fender/contracts';
import { MeshBuilder } from './primitives';
import { CarFactory } from './cars';
import { WreckPhysics } from './wreck-physics';

export interface WreckDescriptor { vehicleId: string; pose: PlanarPose; bodyAssetId: string; discontinuityId: number; armed?: boolean }
export interface WreckOptions { reducedMotion?: boolean; reducedFlash?: boolean }
interface Piece {
  root: TransformNode; mesh: Mesh; shadow: InstancedMesh; source: Mesh | null;
  body: RigidBody | null; velocity: Vector3; spin: Vector3; partContacts: boolean;
}
interface Slot {
  root: TransformNode; vehicleId: string | null; age: number; pieces: Piece[];
  fire: InstancedMesh[]; smoke: InstancedMesh[]; rings: InstancedMesh[];
  reducedMotion: boolean; reducedFlash: boolean;
}
const LIFETIME = 2.6, CAPACITY = 8;

/** Exact car components share cached geometry/materials and bounded visual slots. */
export class WreckEffects {
  readonly ready: Promise<void>;
  private slots: Slot[] = [];
  private sources: Mesh[] = [];
  private materials: StandardMaterial[] = [];
  private played = new Map<string, number>();
  private disposed = false;
  private factory: CarFactory;
  private ownsFactory: boolean;
  private physics: WreckPhysics;

  constructor(scene: Scene, factory?: CarFactory, map?: CollisionMap) {
    this.factory = factory ?? new CarFactory(scene); this.ownsFactory = !factory;
    const assemblies = [...VEHICLE_BODIES, 'traffic-sedan', 'suspect'].map(body => this.factory.breakupParts(body, body.startsWith('traffic')));
    const pieceCapacity = Math.max(...assemblies.map(parts => parts.length));
    this.physics = new WreckPhysics(map);
    this.ready = this.physics.ready.then(() => {
      if (!this.disposed) for (const slot of this.slots) if (slot.vehicleId !== null && !slot.reducedMotion) this.createBodies(slot);
    });
    const material = (name: string, color: string, emissive = false, alpha = 1) => {
      const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor.set(.12, .12, .12); m.alpha = alpha;
      if (emissive) { m.emissiveColor = m.diffuseColor.scale(1.15); m.disableLighting = true; }
      this.materials.push(m); return m;
    };
    const flame = material('wreck-fire-orange', '#ed651f', true), core = material('wreck-fire-gold', '#ffcf60', true);
    const smoke = material('wreck-smoke-charcoal', '#536263', false, .8), ring = material('wreck-ring-gold', '#ffd777', true, .65), shadow = material('wreck-debris-shadow', '#102c30', false, .12);
    const source = (mesh: Mesh, m: StandardMaterial) => { mesh.material = m; mesh.isVisible = false; mesh.isPickable = false; this.sources.push(mesh); return mesh; };
    const fire = source(MeshBuilder.CreateIcoSphere('wreck-fire-source', { radius: 1, subdivisions: 1 }, scene), flame);
    const hot = source(MeshBuilder.CreateIcoSphere('wreck-core-source', { radius: 1, subdivisions: 1 }, scene), core);
    const cloud = source(MeshBuilder.CreateIcoSphere('wreck-smoke-source', { radius: 1, subdivisions: 1 }, scene), smoke);
    const wave = source(MeshBuilder.CreateTorus('wreck-ring-source', { diameter: 1, thickness: .055, tessellation: 24 }, scene), ring);
    const disc = source(MeshBuilder.CreateCylinder('wreck-shadow-source', { diameter: 1, height: .006, tessellation: 12 }, scene), shadow);
    const instance = (mesh: Mesh, name: string, parent: TransformNode) => { const i = mesh.createInstance(name); i.parent = parent; i.isPickable = false; return i; };
    for (let n = 0; n < CAPACITY; n++) {
      const root = new TransformNode(`wreck-slot-${n}`, scene); root.setEnabled(false);
      const slot: Slot = { root, vehicleId: null, age: LIFETIME, pieces: [], fire: [], smoke: [], rings: [], reducedMotion: false, reducedFlash: false };
      for (let i = 0; i < pieceCapacity; i++) {
        const node = new TransformNode(`wreck-${n}-component-${i}`, scene); node.parent = root; node.rotationQuaternion = Quaternion.Identity(); node.setEnabled(false);
        const mesh = new Mesh(`wreck-${n}-piece-${i}`, scene); mesh.parent = node; mesh.scaling.x = -1; mesh.isPickable = false;
        const discMesh = instance(disc, `wreck-${n}-shadow-${i}`, root); discMesh.isVisible = false;
        slot.pieces.push({ root: node, mesh, shadow: discMesh, source: null, body: null, velocity: Vector3.Zero(), spin: Vector3.Zero(), partContacts: false });
      }
      slot.fire.push(instance(hot, `wreck-${n}-fire-core`, root));
      for (let i = 0; i < 7; i++) slot.fire.push(instance(fire, `wreck-${n}-fire-${i}`, root));
      for (let i = 0; i < 8; i++) slot.smoke.push(instance(cloud, `wreck-${n}-smoke-${i}`, root));
      for (let i = 0; i < 2; i++) slot.rings.push(instance(wave, `wreck-${n}-ring-${i}`, root));
      this.slots.push(slot);
    }
  }

  private clear(slot: Slot): void {
    for (const piece of slot.pieces) {
      this.physics.remove(piece.body); piece.body = null; piece.source = null; piece.root.setEnabled(false); piece.shadow.isVisible = false;
    }
    slot.vehicleId = null; slot.root.setEnabled(false);
  }

  private createBodies(slot: Slot): void {
    for (const p of slot.pieces) {
      if (!p.source || p.body || slot.reducedMotion) continue;
      const local = p.root.position, origin = slot.root.position;
      p.body = this.physics.create({ x: origin.x + local.x, y: local.y, z: origin.z + local.z }, p.root.rotationQuaternion!, p.source.getBoundingInfo().boundingBox.extendSize, p.velocity, p.spin, p.source.metadata.componentName === 'tire' ? 'tire' : 'panel');
    }
  }

  spawn(wreck: WreckDescriptor, options: WreckOptions = {}): boolean {
    if (this.disposed || this.played.get(wreck.vehicleId) === wreck.discontinuityId) return false;
    const slot = this.slots.find(s => s.vehicleId === wreck.vehicleId) ?? this.slots.find(s => s.vehicleId === null) ?? this.slots.reduce((a, b) => a.age > b.age ? a : b);
    this.clear(slot);
    this.played.delete(wreck.vehicleId); this.played.set(wreck.vehicleId, wreck.discontinuityId);
    if (this.played.size > 64) this.played.delete(this.played.keys().next().value!);
    slot.vehicleId = wreck.vehicleId; slot.age = 0; slot.reducedMotion = !!options.reducedMotion; slot.reducedFlash = !!options.reducedFlash;
    slot.root.position.set(-wreck.pose.x, 0, wreck.pose.z); slot.root.setEnabled(true);
    let seed = 2166136261;
    for (const char of `${wreck.vehicleId}:${wreck.discontinuityId}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    const parts = this.factory.breakupParts(wreck.bodyAssetId, wreck.bodyAssetId.startsWith('traffic'), wreck.armed ?? !wreck.bodyAssetId.startsWith('traffic'));
    const sin = Math.sin(-wreck.pose.yaw), cos = Math.cos(-wreck.pose.yaw);
    for (let i = 0; i < parts.length; i++) {
      const p = slot.pieces[i]!, part = parts[i]!, center = part.position;
      p.source = part; part.geometry!.applyToMesh(p.mesh); p.mesh.material = part.material;
      p.mesh.metadata = { ...part.metadata, wreckComponent: true };
      p.root.metadata = { ...part.metadata, wreckRole: part.metadata.componentName === 'tire' ? 'wheel' : part.metadata.componentName };
      p.root.position.set(-center.x * cos + center.z * sin, center.y + .03, center.x * sin + center.z * cos);
      p.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(-wreck.pose.yaw, 0, 0); p.root.scaling.setAll(1);
      p.root.setEnabled(!slot.reducedMotion); p.mesh.isVisible = !slot.reducedMotion; p.shadow.isVisible = !slot.reducedMotion; p.partContacts = false;
      const tire = part.metadata.componentName === 'tire';
      const angle = Math.atan2(p.root.position.x, p.root.position.z) + (random() - .5) * .8, speed = tire ? 7 + random() * 6 : 3 + random() * 3;
      p.velocity.set(Math.sin(angle) * speed, tire ? 4 + random() * 3.5 : 5 + random() * 4, Math.cos(angle) * speed);
      const tumble = random() - .5;
      p.spin.set(tire ? Math.sign(tumble) * (16 + Math.abs(tumble) * 32) : tumble * 18, (random() - .5) * 15, (random() - .5) * 20);
    }
    if (!slot.reducedMotion) this.createBodies(slot);
    this.sampleCloud(slot); return true;
  }

  private sampleCloud(slot: Slot): void {
    const age = slot.age, reduced = slot.reducedMotion, flash = slot.reducedFlash, burst = Math.max(0, Math.sin(Math.min(1, age / .85) * Math.PI));
    for (let i = 0; i < slot.fire.length; i++) {
      const mesh = slot.fire[i]!, a = i * Math.PI * 2 / 7; mesh.isVisible = age < .85 && (!flash || i > 0 && i < 4);
      const scale = (i === 0 ? 1.7 : 1.2) * (reduced ? .45 : flash ? .65 : 1) * (.3 + burst * 1.35);
      mesh.scaling.set(scale, scale * (i === 0 ? 1.15 : .9), scale); mesh.position.set(i === 0 ? 0 : Math.sin(a) * burst * 1.3, i === 0 ? 1.3 : 1.1 + burst * .7, i === 0 ? 0 : Math.cos(a) * burst * 1.3);
    }
    for (let i = 0; i < slot.smoke.length; i++) {
      const mesh = slot.smoke[i]!, a = i * Math.PI * 2 / 8, progress = Math.max(0, age - .08), fade = Math.min(1, Math.max(0, (LIFETIME - age) / .5));
      mesh.isVisible = age > .06 && (!reduced || i < 4); const size = (.38 + Math.min(progress, 1.8) * .75) * (reduced ? .6 : 1) * fade;
      mesh.scaling.set(size, size * 1.2, size); mesh.position.set(Math.sin(a) * (reduced ? .7 : .8 + progress * .8), reduced ? 1.2 + i * .12 : 1.25 + progress * (1.65 + i * .08), Math.cos(a) * (reduced ? .7 : .8 + progress * .8));
    }
    for (let i = 0; i < slot.rings.length; i++) {
      const mesh = slot.rings[i]!; mesh.isVisible = !flash && !reduced && age < .8;
      const scale = .6 + age * (i === 0 ? 12 : 8); mesh.scaling.set(scale, .6, scale); mesh.position.y = .06 + i * .05;
    }
  }

  update(delta: number, options: WreckOptions = {}): void {
    if (this.disposed) return;
    const dt = this.physics.initialized ? Math.min(.1, Math.max(0, Number.isFinite(delta) ? delta : 0)) : 0;
    for (const slot of this.slots) {
      if (slot.vehicleId === null) continue;
      slot.age += dt; slot.reducedMotion ||= !!options.reducedMotion; slot.reducedFlash ||= !!options.reducedFlash;
      if (slot.age >= LIFETIME - .000001) { this.clear(slot); continue; }
      for (const p of slot.pieces) {
        if (!p.source) continue;
        if (slot.reducedMotion) { this.physics.remove(p.body); p.body = null; p.root.setEnabled(false); p.shadow.isVisible = false; }
        else if (p.body && !p.partContacts && slot.age >= .16) { this.physics.enablePartContacts(p.body); p.partContacts = true; }
      }
    }
    this.physics.step(dt);
    for (const slot of this.slots) {
      if (slot.vehicleId === null) continue;
      for (const p of slot.pieces) if (p.body) {
        const position = p.body.translation(), rotation = p.body.rotation();
        p.root.position.set(position.x - slot.root.position.x, position.y, position.z - slot.root.position.z);
        p.root.rotationQuaternion!.set(rotation.x, rotation.y, rotation.z, rotation.w);
        p.root.scaling.setAll(Math.min(1, Math.max(0, (LIFETIME - slot.age) / .35)));
        p.shadow.position.set(p.root.position.x, .035, p.root.position.z); p.shadow.scaling.setAll(Math.max(.15, 1 - position.y * .08) * Math.min(1, p.source!.getBoundingInfo().boundingBox.extendSize.length()));
      }
      this.sampleCloud(slot);
    }
  }

  remove(vehicleId: string): void { for (const slot of this.slots) if (slot.vehicleId === vehicleId) this.clear(slot); this.played.delete(vehicleId); }
  reset(): void { for (const slot of this.slots) this.clear(slot); this.played.clear(); this.physics.reset(); }
  getStats() {
    let wreckSequences = 0, wreckWheels = 0, wreckPanels = 0, wreckPieces = 0, wreckFireballs = 0, wreckSmoke = 0, wreckRings = 0;
    for (const s of this.slots) {
      if (s.vehicleId === null) continue;
      wreckSequences++;
      for (const p of s.pieces) if (p.source && p.root.isEnabled()) { wreckPieces++; if (p.source.metadata.componentName === 'tire') wreckWheels++; else wreckPanels++; }
      wreckFireballs += s.fire.filter(m => m.isVisible).length; wreckSmoke += s.smoke.filter(m => m.isVisible).length; wreckRings += s.rings.filter(m => m.isVisible).length;
    }
    return { wreckSequences, wreckWheels, wreckPanels, wreckPieces, wreckBodies: this.physics.bodyCount, wreckPartCollisions: this.physics.partCollisions, wreckPhysicsReady: this.physics.initialized, wreckFireballs, wreckSmoke, wreckRings };
  }
  dispose(): void {
    if (this.disposed) return;
    this.reset(); this.disposed = true; this.physics.dispose();
    for (const s of this.slots) s.root.dispose();
    for (const source of this.sources) source.dispose();
    for (const m of this.materials) m.dispose();
    if (this.ownsFactory) this.factory.dispose();
    this.slots = []; this.sources = []; this.materials = [];
  }
}
