import type { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/instancedMesh';
import type { PropKind, PropState } from '@fender/contracts';
import { MeshBuilder } from './primitives';

/** Native presentation adapter for server-owned rigid props. */
export class PropVisuals {
  private templates = new Map<PropKind, Mesh[]>();
  private materials = new Map<string, StandardMaterial>();
  private instances = new Map<string, { root: TransformNode; kind: PropKind }>();
  private dynamic = 0;
  private disposed = false;
  constructor(private scene: Scene) {}
  private template(kind: PropKind): Mesh[] {
    const cached = this.templates.get(kind); if (cached) return cached;
    const groups = new Map<StandardMaterial, Mesh[]>();
    const add = (mesh: Mesh, color: string) => {
      let material = this.materials.get(color);
      if (!material) { material = new StandardMaterial(`prop-${color}`, this.scene); material.diffuseColor = Color3.FromHexString(color); material.specularColor.set(.04, .04, .04); this.materials.set(color, material); }
      mesh.material = material; const group = groups.get(material) ?? []; group.push(mesh); groups.set(material, group); return mesh;
    };
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string) => { const mesh = MeshBuilder.CreateBox('prop-source', { width: w, height: h, depth: d }, this.scene); mesh.position.set(x, y, z); return add(mesh, color); };
    const cylinder = (x: number, y: number, z: number, diameter: number, height: number, color: string, top = diameter) => { const mesh = MeshBuilder.CreateCylinder('prop-source', { diameterBottom: diameter, diameterTop: top, height, tessellation: 10 }, this.scene); mesh.position.set(x, y, z); return add(mesh, color); };
    const metal = '#4b6669', wood = '#947b59';
    if (kind === 'tree') {
      cylinder(0, 0, 0, .55, 4.8, '#786f52', .38);
      for (let i = 0; i < 3; i++) { const mesh = MeshBuilder.CreateIcoSphere('prop-source', { radius: 2.2 - i * .3, subdivisions: 1 }, this.scene); mesh.position.set(Math.sin(i * 3) * .5, 1.4 + i * .8, Math.cos(i * 3) * .35); mesh.scaling.y = .9; add(mesh, i % 2 ? '#4e7d65' : '#638b6b'); }
    } else if (kind === 'lamp') {
      cylinder(0, 0, 0, .22, 5, metal, .14); cylinder(0, -2.3, 0, .45, .4, metal);
      box(-.7, 2.4, 0, 1.6, .15, .18, metal); box(-1.4, 2.3, 0, .9, .22, .5, '#f0d69d');
    } else if (kind === 'sign') {
      cylinder(0, 0, 0, .18, 3, metal); box(0, .9, 0, 1.2, .9, .12, '#d8b873'); box(0, .9, -.07, .7, .12, .03, '#405c63');
    } else if (kind === 'bench') {
      for (const z of [-.2, 0, .2]) box(0, 0, z, 2.4, .18, .16, wood);
      for (const y of [.25, .5, .75]) box(0, y, .28, 2.4, .18, .12, wood);
      for (const x of [-.9, .9]) { box(x, -.35, 0, .16, .5, .5, metal); box(x, .35, .28, .12, .8, .12, metal); }
    } else if (kind === 'crate') {
      box(0, 0, 0, 1, 1, 1, '#bd9b6f');
      for (const x of [-.37, .37]) { box(x, 0, -.51, .09, 1.02, .05, '#806d54'); box(x, 0, .51, .09, 1.02, .05, '#806d54'); }
      for (const y of [-.36, .36]) box(0, y, 0, 1.04, .09, 1.04, '#806d54');
    } else {
      const barrel = kind === 'barrel';
      cylinder(0, 0, 0, .8, barrel ? 1.2 : 1.1, barrel ? '#bd714b' : '#5d7d70');
      for (const y of [-.4, .4]) cylinder(0, y, 0, .84, .08, metal);
      cylinder(0, barrel ? .59 : .54, 0, .82, .09, metal);
      if (barrel) { box(0, 0, -.405, .32, .34, .025, '#e3cb83'); box(0, 0, -.42, .11, .18, .015, '#4b6669'); }
    }
    const templates: Mesh[] = [];
    for (const [material, meshes] of groups) {
      const source = Mesh.MergeMeshes(meshes, true, true)!; source.name = `prop-template-${kind}-${templates.length}`; source.material = material; source.receiveShadows = true; source.isVisible = false; templates.push(source);
    }
    this.templates.set(kind, templates); return templates;
  }
  render(states: readonly PropState[], lampGlow = 0): void {
    if (this.disposed) return;
    const alive = new Set<string>(); this.dynamic = 0;
    for (const state of states.slice(0, 192)) {
      if (alive.has(state.entityId)) continue; alive.add(state.entityId);
      let visual = this.instances.get(state.entityId);
      if (visual && visual.kind !== state.kind) { visual.root.dispose(); this.instances.delete(state.entityId); visual = undefined; }
      if (!visual) {
        const root = new TransformNode(`prop-${state.entityId}`, this.scene); root.rotationQuaternion = Quaternion.Identity();
        for (const source of this.template(state.kind)) { const part = source.createInstance(`${state.entityId}-${source.name}`); part.parent = root; }
        visual = { root, kind: state.kind }; this.instances.set(state.entityId, visual);
      }
      const { root } = visual, q = state.rotation;
      root.position.set(-state.position.x, state.position.y, state.position.z);
      root.rotationQuaternion!.set(q.x, -q.y, -q.z, q.w).normalize();
      root.scaling.set(-state.scale, state.scale, state.scale);
      if (state.mode === 'dynamic') this.dynamic++;
    }
    for (const [id, visual] of this.instances) if (!alive.has(id)) { visual.root.dispose(); this.instances.delete(id); }
    this.materials.get('#f0d69d')?.emissiveColor.set(.7 * lampGlow, .5 * lampGlow, .22 * lampGlow);
  }
  getStats() { return { props: this.instances.size, dynamicProps: this.dynamic }; }
  reset(): void { for (const visual of this.instances.values()) visual.root.dispose(); this.instances.clear(); this.dynamic = 0; }
  dispose(): void { if (this.disposed) return; this.reset(); for (const meshes of this.templates.values()) for (const mesh of meshes) mesh.dispose(); for (const material of this.materials.values()) material.dispose(); this.templates.clear(); this.materials.clear(); this.disposed = true; }
}
