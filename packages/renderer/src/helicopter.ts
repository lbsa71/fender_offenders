import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { HELICOPTER_RULES, helicopterPoseAt, type CollisionMap, type HelicopterState, type PlanarPose } from '@fender/contracts';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from './primitives';
import { WreckPhysics } from './wreck-physics';
import components from '../../content/runtime/models/helicopter/components.json';

const MODEL_URL = new URL('../../content/runtime/models/helicopter/helicopter.glb', import.meta.url).href;
const DEBRIS_SECONDS = 3.2, GROUND_CLEARANCE = 1.3;
interface Component {
 node: TransformNode; parent: TransformNode | null; position: Vector3; rotation: Quaternion; scale: Vector3;
 fragment: TransformNode; center: Vector3; half: Vector3; body: RigidBody | null;
}

/** One imported aircraft and ten reusable cosmetic fragments; authority owns flight and damage. */
export class HelicopterVisual {
 readonly ready: Promise<void>;
 private root: TransformNode; private rotor: TransformNode | null = null; private tailRotor: TransformNode | null = null;
 private marker: Mesh; private health: Mesh; private healthBack: Mesh;
 private materials: StandardMaterial[] = []; private asset: AssetContainer | null = null; private parts: Component[] = [];
 private physics: WreckPhysics; private debrisAge = DEBRIS_SECONDS;
 private retired = new Set<string>(); private crashed = new Set<string>();
 private visible = false; private hp = 0; private disposed = false;
 private modelStatus: 'loading' | 'ready' | 'failed' = 'loading'; private modelError: string | null = null;

 constructor(scene: Scene, map?: CollisionMap, source: string | ArrayBufferView = MODEL_URL) {
  this.root = new TransformNode('black-chopper', scene); this.root.scaling.x = -1;
  this.physics = new WreckPhysics(map);
  const material = (name: string, color: string) => {
   const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color);
   m.specularColor.set(0, 0, 0); m.disableLighting = true; m.emissiveColor = m.diffuseColor;
   this.materials.push(m); return m;
  };
  const box = (name: string, y: number, width: number, height: number, depth: number, m: StandardMaterial) => {
   const mesh = MeshBuilder.CreateBox(name, {width, height, depth}, scene);
   mesh.parent = this.root; mesh.position.y = y; mesh.material = m; mesh.isPickable = false; return mesh;
  };
  this.healthBack = box('chopper-health-back', 3, 4.2, .3, .15, material('chopper-health-back', '#182327'));
  this.health = box('chopper-health', 3.07, 4, .22, .18, material('chopper-health-fill', '#86c67b'));
  this.marker = MeshBuilder.CreateTorus('chopper-ground-marker', {diameter: 5.3, thickness: .08, tessellation: 32}, scene);
  this.marker.material = material('chopper-flight-marker', '#d6b86f'); this.marker.isPickable = false;
  this.reset();
  this.ready = Promise.all([this.load(scene, source), this.physics.ready]).then(() => undefined);
 }

 private async load(scene: Scene, source: string | ArrayBufferView): Promise<void> {
  let asset: AssetContainer | null = null;
  try {
   asset = await LoadAssetContainerAsync(source, scene, {pluginExtension: '.glb', name: 'helicopter.glb'});
   if (this.disposed) { asset.dispose(); return; }
   for (const spec of components.components) {
    const node = [...asset.transformNodes, ...asset.meshes].find(n => n.name === spec.name);
    if (!node) throw new Error(`Helicopter component missing: ${spec.name}`);
    const fragment = new TransformNode(`chopper-fragment-${spec.name}`, scene);
    fragment.rotationQuaternion = Quaternion.Identity(); fragment.metadata = {helicopterFragment: spec.name}; fragment.setEnabled(false);
    this.parts.push({node, parent: node.parent as TransformNode | null, position: node.position.clone(),
     rotation: node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation), scale: node.scaling.clone(),
     fragment, center: Vector3.FromArray(spec.collider.localCenter), half: Vector3.FromArray(spec.collider.halfExtents), body: null});
   }
   this.rotor = this.parts.find(p => p.node.name === 'rotor_main')!.node;
   this.tailRotor = this.parts.find(p => p.node.name === 'rotor_tail')!.node;
   // Own rotor angles on the presentation clock; do not also play the exported clips.
   for (const group of asset.animationGroups) group.stop();
   for (const mesh of asset.meshes) mesh.isPickable = false;
   asset.addAllToScene();
   for (const root of asset.rootNodes) root.parent = this.root;
   this.asset = asset; this.modelStatus = 'ready';
  } catch (error) {
   asset?.dispose(); for (const part of this.parts) part.fragment.dispose(); this.parts = [];
   if (!this.disposed) { this.modelStatus = 'failed'; this.modelError = String(error); }
  }
 }

 private clearDebris(): void {
  for (const part of this.parts) {
   this.physics.remove(part.body); part.body = null;
   part.node.parent = part.parent; part.node.position.copyFrom(part.position);
   part.node.rotationQuaternion = part.rotation.clone(); part.node.rotation.setAll(0); part.node.scaling.copyFrom(part.scale);
   part.fragment.setEnabled(false); part.fragment.scaling.setAll(1);
  }
  this.debrisAge = DEBRIS_SECONDS; this.physics.reset();
 }

 private explode(id: string): void {
  if (!this.physics.initialized || this.modelStatus !== 'ready') return;
  if (this.debrisAge < DEBRIS_SECONDS) this.clearDebris();
  this.debrisAge = 0;
  let seed = 2166136261;
  for (const c of id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (const part of this.parts) {
   part.node.computeWorldMatrix(true);
   const scale = new Vector3(), rotation = new Quaternion(), translation = new Vector3();
   part.node.getWorldMatrix().decompose(scale, rotation, translation);
   const position = Vector3.TransformCoordinates(part.center, part.node.getWorldMatrix());
   const angle = Math.atan2(position.x - this.root.position.x, position.z - this.root.position.z) + (random() - .5) * .6;
   const speed = 4 + random() * 5;
   part.body = this.physics.create(position, rotation, part.half.multiply(new Vector3(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z))),
    new Vector3(Math.sin(angle) * speed, 5 + random() * 5, Math.cos(angle) * speed),
    new Vector3((random() - .5) * 12, (random() - .5) * 12, (random() - .5) * 12));
   part.fragment.position.copyFrom(position); part.fragment.rotationQuaternion!.copyFrom(rotation); part.fragment.setEnabled(true);
   part.node.parent = part.fragment; part.node.position.copyFrom(part.center.multiply(scale).negate());
   part.node.scaling.copyFrom(scale); part.node.rotationQuaternion = Quaternion.Identity(); part.node.rotation.setAll(0);
  }
 }

 private updateDebris(delta: number, reducedMotion: boolean): void {
  if (this.debrisAge >= DEBRIS_SECONDS) return;
  if (reducedMotion) { this.clearDebris(); return; }
  const previousAge = this.debrisAge;
  this.debrisAge += Math.min(.1, Math.max(0, Number.isFinite(delta) ? delta : 0));
  if (this.debrisAge >= DEBRIS_SECONDS) { this.clearDebris(); return; }
  if (previousAge < .16 && this.debrisAge >= .16) for (const part of this.parts) if (part.body) this.physics.enablePartContacts(part.body);
  this.physics.step(delta);
  for (const part of this.parts) if (part.body) {
   const p = part.body.translation(), q = part.body.rotation();
   part.fragment.position.set(p.x, p.y, p.z); part.fragment.rotationQuaternion!.set(q.x, q.y, q.z, q.w);
   part.fragment.scaling.setAll(Math.min(1, (DEBRIS_SECONDS - this.debrisAge) / .4));
  }
 }

 private keepAboveRoad(): void {
  const bounds = this.root.getHierarchyBoundingVectors(true);
  if (Number.isFinite(bounds.min.y)) this.root.position.y += Math.max(0, .04 - bounds.min.y);
 }

 render(state: HelicopterState | undefined, tick: number, reducedMotion: boolean, delta = 1 / 60): PlanarPose | null {
  if (this.disposed) return null;
  this.updateDebris(delta, reducedMotion); this.visible = false; this.hp = state?.health ?? 0;
  if (!state || state.phase === 'away' || state.phase !== 'downed' && this.retired.has(state.entityId)) {
   this.root.setEnabled(false); this.marker.isVisible = false; return null;
  }
  const pose = helicopterPoseAt(state, tick), down = state.phase === 'downed';
  const age = Math.max(0, (tick - state.startedAtTick) / Math.max(1, state.endsAtTick - state.startedAtTick));
  this.root.position.set(-pose.x, down ? Math.max(GROUND_CLEARANCE, HELICOPTER_RULES.altitude * (1 - age * age)) : HELICOPTER_RULES.altitude, pose.z);
  if (down) { this.retired.add(state.entityId); if (this.retired.size > 32) this.retired.delete(this.retired.values().next().value!); }
  if (down && age >= 1) {
   this.keepAboveRoad();
   this.root.setEnabled(false); this.marker.isVisible = false;
   if (!this.crashed.has(state.entityId)) {
    this.crashed.add(state.entityId); if (this.crashed.size > 32) this.crashed.delete(this.crashed.values().next().value!);
    if (tick - state.endsAtTick <= 12) {
     if (!reducedMotion) this.explode(state.entityId);
     return pose;
    }
   }
   return null;
  }
  if (this.modelStatus !== 'ready' || this.debrisAge < DEBRIS_SECONDS) {
   this.root.setEnabled(false); this.marker.isVisible = false; return null;
  }
  this.visible = true; this.root.setEnabled(true);
  this.root.rotation.set(down && !reducedMotion ? age * .6 : 0, -pose.yaw, down && !reducedMotion ? age * 6 : 0);
  if (!reducedMotion) {
   this.rotor!.rotationQuaternion = null; this.rotor!.rotation.y = tick * .32;
   this.tailRotor!.rotationQuaternion = null; this.tailRotor!.rotation.x = tick * .5;
  }
  if (down) this.keepAboveRoad();
  this.marker.isVisible = !down; this.marker.position.set(-pose.x, .065, pose.z);
  this.health.isVisible = this.healthBack.isVisible = !down;
  this.health.scaling.x = Math.max(.001, state.health / HELICOPTER_RULES.health);
  this.health.position.x = -(1 - state.health / HELICOPTER_RULES.health) * 2;
  this.health.rotation.y = this.healthBack.rotation.y = pose.yaw; return null;
 }

 reset(): void {
  this.visible = false; this.hp = 0; this.root.setEnabled(false); this.marker.isVisible = false; this.clearDebris();
 }
 getStats() {
  return {helicopterVisible: this.visible, helicopterHealth: this.hp, helicopterModelStatus: this.modelStatus,
   helicopterModelError: this.modelError, helicopterComponents: this.parts.length, helicopterDebrisBodies: this.physics.bodyCount};
 }
 dispose(): void {
  if (this.disposed) return;
  this.reset(); this.disposed = true; this.physics.dispose(); this.asset?.dispose();
  for (const part of this.parts) part.fragment.dispose(); this.parts = [];
  this.root.dispose(); this.marker.dispose(); for (const m of this.materials) m.dispose(); this.retired.clear(); this.crashed.clear();
 }
}
