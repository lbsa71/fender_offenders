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
import { DISTRICT_WATER, waterFootprint } from '@fender/content';

/** Shared shallow-water finish with analytic sky reflections and no extra render pass. */
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
    this.material.albedoColor = Color3.FromHexString('#155762');
    this.material.metallic = 0; this.material.roughness = .16;
    this.material.indexOfRefraction = 1.333;
    this.borderMaterial = new StandardMaterial('shallow-water-stone', scene);
    this.borderMaterial.diffuseColor = Color3.FromHexString('#cdc9b2'); this.borderMaterial.specularColor.set(.03, .03, .03);
    new WaterFinish(this.material, this);
    for (const site of DISTRICT_WATER) {
      const mesh = new Mesh(`wet-${site.id}`, scene), data = new VertexData();
      const footprint = waterFootprint(site);
      const count = site.kind === 'pool' ? 4 : 12;
      data.positions = [0, 0, 0]; data.normals = [0, 1, 0]; data.uvs = [.5, .5]; data.indices = [];
      for (let i = 0; i < count; i++) {
        const x = -(footprint[i*2]! - site.x), z = footprint[i*2+1]! - site.z;
        data.positions.push(x, 0, z); data.normals.push(0, 1, 0); data.uvs.push(x / site.width + .5, z / site.depth + .5);
        // Positions already reflect X. Match the shipped right-handed scene's front faces.
        data.indices.push(0, (i + 1) % count + 1, i + 1);
      }
      data.applyToMesh(mesh); mesh.position.set(-site.x, site.y, site.z); mesh.material = this.material;
      mesh.metadata = { waterKind: site.kind };
      mesh.isPickable = false; mesh.receiveShadows = true; mesh.freezeWorldMatrix(); this.meshes.push(mesh);
      if (site.kind !== 'puddle') {
        const border = new Mesh(`shallow-border-${site.id}`, scene), ring = new VertexData();
        ring.positions = []; ring.normals = []; ring.indices = [];
        for (let i = 0; i < count; i++) {
          const x = data.positions[(i + 1) * 3]!, z = data.positions[(i + 1) * 3 + 2]!;
          ring.positions.push(x, -.006, z, x * (1 + .44 / site.width), -.006, z * (1 + .44 / site.depth));
          ring.normals.push(0, 1, 0, 0, 1, 0);
          const a = i * 2, b = (i + 1) % count * 2;
          ring.indices.push(a, b, a + 1, b, b + 1, a + 1);
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
  getStats() { return { waterSurfaces: this.disposed ? 0 : this.meshes.filter(m=>m.isEnabled()).length, waterTime: this.time, waterRipples: this.ripples, waterReflectionPasses: 0 }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; for (const mesh of [...this.meshes, ...this.borders]) mesh.dispose(); this.material.dispose(); this.borderMaterial.dispose(); }
}

class WaterFinish extends MaterialPluginBase {
  private readonly sky = new Color3();
  constructor(material: PBRMaterial, private water: WetSurfaces) { super(material, 'ShallowWaterFinish', 200, {}, true, true); }
  override getUniforms() { return { externalUniforms: ['waterTime', 'waterRippleStrength', 'waterSkyColor', 'waterBounds', 'waterRectangular'] }; }
  override bindForSubMesh(_buffer: UniformBuffer, scene: Scene, _engine: AbstractEngine, mesh: SubMesh): void {
    const surface = mesh.getRenderingMesh(), box = surface.getBoundingInfo().boundingBox;
    this.sky.set(scene.clearColor.r, scene.clearColor.g, scene.clearColor.b).toLinearSpaceToRef(this.sky);
    mesh.effect?.setColor3('waterSkyColor', this.sky);
    mesh.effect?.setFloat4('waterBounds', box.centerWorld.x, box.centerWorld.z, box.extendSizeWorld.x, box.extendSizeWorld.z);
    mesh.effect?.setFloat('waterRectangular', surface.metadata?.waterKind === 'pool' ? 1 : 0);
    mesh.effect?.setFloat('waterTime', this.water.time); mesh.effect?.setFloat('waterRippleStrength', this.water.ripples ? 1 : 0);
  }
  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `uniform float waterTime; uniform float waterRippleStrength;
        uniform vec3 waterSkyColor; uniform vec4 waterBounds; uniform float waterRectangular;`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        vec2 broadRipples = vec2(sin(vPositionW.x * 0.8 + vPositionW.z * 0.35 + waterTime * 0.45),
          cos(vPositionW.z * 0.7 - vPositionW.x * 0.3 + waterTime * 0.35));
        normalW = normalize(normalW + vec3(broadRipples.x, 0.0, broadRipples.y) * mix(0.06, 0.11, waterRippleStrength));
        vec2 waterLocal = abs((vPositionW.xz - waterBounds.xy) / waterBounds.zw);
        float shoreDistance = mix(length(waterLocal), max(waterLocal.x, waterLocal.y), waterRectangular);
        float shallowEdge = smoothstep(0.5, 1.0, shoreDistance);
        surfaceAlbedo = mix(surfaceAlbedo, vec3(0.22, 0.43, 0.36), shallowEdge * 0.65);
      `,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        vec3 waterReflection = reflect(-viewDirectionW, normalW);
        float skyHeight = smoothstep(-0.1, 0.85, waterReflection.y);
        float skyLight = max(waterSkyColor.r, max(waterSkyColor.g, waterSkyColor.b));
        vec3 reflectedSky = waterSkyColor * mix(0.45, 1.0, skyHeight);
        float skyBand = smoothstep(0.25, 0.9, sin(waterReflection.x * 9.0 + waterReflection.z * 7.0) * 0.5 + 0.5);
        reflectedSky = mix(reflectedSky, waterSkyColor * 0.7 + vec3(skyLight * 0.5), skyBand * 0.65);
        float waterFresnel = pow(1.0 - clamp(dot(normalW, viewDirectionW), 0.0, 1.0), 5.0);
        finalColor.rgb = mix(finalColor.rgb, reflectedSky, 0.28 + waterFresnel * 0.6);
        float crestPhase = vPositionW.x * 1.45 + vPositionW.z * 0.7
          + sin(vPositionW.z * 0.8) * 0.7 + waterTime * 0.45;
        float broadCrest = smoothstep(0.72, 0.96, sin(crestPhase));
        float crestLength = 0.35 + 0.65 * smoothstep(-0.3, 0.8, sin(vPositionW.z * 0.9 + sin(vPositionW.x * 0.5)));
        finalColor.rgb += waterSkyColor * broadCrest * crestLength * 0.35 * (1.0 - shallowEdge * 0.4);
      `,
    };
  }
}
