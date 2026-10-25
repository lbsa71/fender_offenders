import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { DISTRICT_WATER } from '@fender/content';

/** One opaque PBR material, analytic broad ripples, zero reflection targets or depth illusion. */
export class WetSurfaces {
  readonly material: PBRMaterial;
  readonly meshes: Mesh[] = [];
  private readonly borders: Mesh[] = [];
  private readonly borderMaterial: StandardMaterial;
  time = 0;
  ripples = true;
  private disposed = false;

  constructor(scene: Scene) {
    this.material = new PBRMaterial('shallow-water', scene);
    this.material.albedoColor = Color3.FromHexString('#477d87');
    this.material.metallic = 0; this.material.roughness = .22;
    this.material.indexOfRefraction = 1.333;
    this.borderMaterial = new StandardMaterial('shallow-water-stone', scene);
    this.borderMaterial.diffuseColor = Color3.FromHexString('#cdc9b2'); this.borderMaterial.specularColor.set(.03, .03, .03);
    new WaterFinish(this.material, this);
    for (const site of DISTRICT_WATER) {
      const mesh = new Mesh(`wet-${site.id}`, scene), data = new VertexData();
      const count = site.kind === 'pool' ? 4 : 12;
      data.positions = [0, 0, 0]; data.normals = [0, 1, 0]; data.uvs = [.5, .5]; data.indices = [];
      for (let i = 0; i < count; i++) {
        const angle = Math.PI * 2 * i / count + (site.kind === 'pool' ? Math.PI / 4 : 0);
        const x = Math.cos(angle) * site.width / 2, z = Math.sin(angle) * site.depth / 2;
        data.positions.push(x, 0, z); data.normals.push(0, 1, 0); data.uvs.push(x / site.width + .5, z / site.depth + .5);
        data.indices.push(0, i + 1, (i + 1) % count + 1);
      }
      data.applyToMesh(mesh); mesh.position.set(-site.x, site.y, site.z); mesh.material = this.material;
      mesh.isPickable = false; mesh.receiveShadows = true; mesh.freezeWorldMatrix(); this.meshes.push(mesh);
      if (site.kind !== 'puddle') {
        const border = new Mesh(`shallow-border-${site.id}`, scene), ring = new VertexData();
        ring.positions = []; ring.normals = []; ring.indices = [];
        for (let i = 0; i < count; i++) {
          const x = data.positions[(i + 1) * 3]!, z = data.positions[(i + 1) * 3 + 2]!;
          ring.positions.push(x, -.006, z, x * (1 + .44 / site.width), -.006, z * (1 + .44 / site.depth));
          ring.normals.push(0, 1, 0, 0, 1, 0);
          const a = i * 2, b = (i + 1) % count * 2;
          ring.indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
        ring.applyToMesh(border); border.position.copyFrom(mesh.position); border.material = this.borderMaterial;
        border.isPickable = false; border.receiveShadows = true; border.freezeWorldMatrix(); this.borders.push(border);
      }
    }
  }
  update(dt: number, quality: 'low' | 'medium' | 'high', reducedMotion: boolean): void {
    if (this.disposed) return;
    this.ripples = quality !== 'low';
    if (!reducedMotion && this.ripples) this.time += Math.max(0, Math.min(.1, dt));
  }
  getStats() { return { waterSurfaces: this.disposed ? 0 : this.meshes.length, waterTime: this.time, waterRipples: this.ripples, waterReflectionPasses: 0 }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; for (const mesh of [...this.meshes, ...this.borders]) mesh.dispose(); this.material.dispose(); this.borderMaterial.dispose(); }
}

class WaterFinish extends MaterialPluginBase {
  constructor(material: PBRMaterial, private water: WetSurfaces) { super(material, 'ShallowWaterFinish', 200, {}, true, true); }
  override getUniforms() { return { externalUniforms: ['waterTime', 'waterRippleStrength'] }; }
  override bindForSubMesh(_buffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, mesh: SubMesh): void {
    mesh.effect?.setFloat('waterTime', this.water.time); mesh.effect?.setFloat('waterRippleStrength', this.water.ripples ? 1 : 0);
  }
  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'uniform float waterTime; uniform float waterRippleStrength;',
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        vec2 broadRipples = vec2(sin(vPositionW.x * 0.8 + vPositionW.z * 0.35 + waterTime * 0.45),
          cos(vPositionW.z * 0.7 - vPositionW.x * 0.3 + waterTime * 0.35));
        normalW = normalize(normalW + vec3(broadRipples.x, 0.0, broadRipples.y) * 0.035 * waterRippleStrength);
        float waterEdge = pow(1.0 - max(0.0, dot(normalW, viewDirectionW)), 3.0);
        surfaceAlbedo = mix(surfaceAlbedo, vec3(0.64, 0.75, 0.72), waterEdge * 0.35);
      `,
    };
  }
}
