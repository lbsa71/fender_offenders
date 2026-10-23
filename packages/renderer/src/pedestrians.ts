import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/instancedMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { VehicleState } from '@fender/contracts';
import { MeshBuilder } from './primitives';
import { PedestrianMotion } from './pedestrian-motion';
interface Person { root: TransformNode; body: TransformNode; arms: TransformNode[]; legs: TransformNode[] }
/** Cosmetic presentation only; never adds physics bodies, health, targets or combat events. */
export class PedestrianCrowd {
  private motion = new PedestrianMotion(); private people: Person[] = []; private templates = new Map<string, Mesh>(); private materials = new Map<string, StandardMaterial>(); private disposed = false;
  constructor(private scene: Scene) {
    const shirts = ['#e99c54', '#74bfb7', '#d8706d', '#c4ba72', '#8ca7ce', '#e3d8b7'], skin = ['#b87b5b', '#e5b78e', '#815741'];
    for (let id = 0; id < this.motion.getStates().length; id++) {
      const name = `pedestrian-${id}`, root = new TransformNode(name, scene), body = new TransformNode(`${name}-body`, scene); body.parent = root;
      const shirt = shirts[id % shirts.length]!, face = skin[id % skin.length]!;
      this.part(`${name}-torso`, 'torso', shirt, body, 0, 1.07, 0);
      this.part(`${name}-head`, 'head', face, body, 0, 1.6, 0);
      this.part(`${name}-hair`, 'hair', id % 4 === 0 ? '#e5c479' : '#403c38', body, 0, 1.78, -.025);
      const arms: TransformNode[] = [], legs: TransformNode[] = [];
      for (const [i, side] of [-1, 1].entries()) {
        const arm = new TransformNode(`${name}-${i === 0 ? 'left' : 'right'}-arm`, scene); arm.position.set(side * .29, 1.3, 0); arm.parent = body; arms.push(arm);
        this.part(`${name}-sleeve-${i}`, 'sleeve', shirt, arm, 0, -.21, 0); this.part(`${name}-hand-${i}`, 'hand', face, arm, 0, -.47, 0);
        const leg = new TransformNode(`${name}-leg-${i}`, scene); leg.position.set(side * .12, .78, 0); leg.parent = body; legs.push(leg);
        this.part(`${name}-trouser-${i}`, 'leg', id % 3 === 0 ? '#465b59' : '#35465b', leg, 0, -.3, 0); this.part(`${name}-shoe-${i}`, 'shoe', '#383b38', leg, 0, -.65, .035);
      }
      this.part(`${name}-shadow`, 'shadow', '#435953', root, 0, .007, 0);
      this.people.push({ root, body, arms, legs });
    }
    this.update([], 0, true);
  }
  private material(color: string, shadow: boolean) {
    const key = `${color}-${shadow}`; let material = this.materials.get(key);
    if (!material) { material = new StandardMaterial(`pedestrian-${key}`, this.scene); material.diffuseColor = Color3.FromHexString(color); material.specularColor.set(.08, .08, .08); if (shadow) { material.alpha = .3; material.disableLighting = true; material.emissiveColor = material.diffuseColor; } this.materials.set(key, material); }
    return material;
  }
  private part(name: string, shape: string, color: string, parent: TransformNode, x: number, y: number, z: number) {
    const key = `${shape}-${color}`; let template = this.templates.get(key);
    if (!template) {
      if (shape === 'head' || shape === 'hand') template = MeshBuilder.CreateIcoSphere(`ped-template-${key}`, { radius: shape === 'head' ? .23 : .085, subdivisions: 1 }, this.scene);
      else if (shape === 'shadow') template = MeshBuilder.CreateCylinder(`ped-template-${key}`, { height: .008, diameter: .68, tessellation: 12 }, this.scene);
      else { const dimensions = shape === 'torso' ? [.43, .58, .29] : shape === 'sleeve' ? [.15, .43, .18] : shape === 'leg' ? [.16, .6, .19] : shape === 'shoe' ? [.2, .12, .32] : [.4, .1, .35]; template = MeshBuilder.CreateBox(`ped-template-${key}`, { width: dimensions[0], height: dimensions[1], depth: dimensions[2] }, this.scene); }
      template.material = this.material(color, shape === 'shadow'); template.isVisible = false; template.isPickable = false; this.templates.set(key, template);
    }
    const part = template.createInstance(name); part.parent = parent; part.position.set(x, y, z); part.isVisible = true; part.isPickable = false; return part;
  }
  update(vehicles: readonly VehicleState[], dt: number, reducedMotion: boolean) {
    if (this.disposed) return; this.motion.update(vehicles, dt);
    for (const state of this.motion.getStates()) {
      const person = this.people[state.id]!; person.root.setEnabled(!state.hiddenSafety);
      // Shared driving coordinates are reflected exactly once at this renderer boundary.
      person.root.position.set(-state.x, .15, state.z); person.root.rotation.y = -state.yaw;
      const moving = state.mode !== 'waiting', running = state.mode === 'running', swing = reducedMotion || !moving ? 0 : Math.sin(state.gait) * (running ? .95 : .4);
      person.arms.forEach((arm, i) => { arm.rotation.x = swing * (i ? -1 : 1); arm.rotation.z = reducedMotion ? 0 : (running ? .3 : .08) * (i ? -1 : 1); });
      person.legs.forEach((leg, i) => { leg.rotation.x = swing * (i ? 1 : -1); });
      person.body.position.y = reducedMotion || !moving ? 0 : Math.abs(Math.sin(state.gait)) * (running ? .075 : .025);
      person.body.rotation.x = reducedMotion || !running ? 0 : -.16;
    }
  }
  reset() { if (this.disposed) return; this.motion.reset(); this.update([], 0, true); }
  getStats() { const states = this.motion.getStates(); return { total: states.length, visible: states.filter(p => !p.hiddenSafety).length, walking: states.filter(p => !p.hiddenSafety && p.mode === 'walking').length, running: states.filter(p => !p.hiddenSafety && p.mode === 'running').length, waiting: states.filter(p => !p.hiddenSafety && p.mode === 'waiting').length, hiddenSafety: states.filter(p => p.hiddenSafety).length, ...this.motion.getDiagnostics() }; }
  dispose() { if (this.disposed) return; this.disposed = true; this.motion.dispose(); for (const person of this.people) person.root.dispose(false); this.people = []; for (const template of this.templates.values()) template.dispose(); this.templates.clear(); for (const material of this.materials.values()) material.dispose(); this.materials.clear(); }
}
