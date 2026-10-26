import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { MirrorTexture } from '@babylonjs/core/Materials/Textures/mirrorTexture';
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

/** One bounded scene reflection shared by visible shallow water; no per-site targets. */
export class WetSurfaces {
  readonly material: PBRMaterial;
  readonly meshes: Mesh[] = [];
  private readonly borders: Mesh[] = [];
  private readonly borderMaterial: StandardMaterial;
  time = 0;
  ripples = true;
  reflection: MirrorTexture | null = null;
  private reflectionActive = false;
  private disposed = false;

  constructor(private scene: Scene) {
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
    const camera = this.scene.activeCamera;
    const planes = camera ? Frustum.GetPlanes(camera.getViewMatrix().multiply(camera.getProjectionMatrix())) : [];
    const visible = camera ? this.meshes.filter(mesh => mesh.isEnabled() && mesh.isVisible && mesh.isInFrustum(planes)) : [];
    this.reflectionActive = visible.length > 0;
    if (!this.reflectionActive) {
      const index = this.reflection ? this.scene.customRenderTargets.indexOf(this.reflection) : -1;
      if (index >= 0) this.scene.customRenderTargets.splice(index, 1);
      return;
    }
    const size = quality === 'low' ? 128 : 256;
    if (!this.reflection) {
      this.reflection = new MirrorTexture('shallow-water-reflection', size, this.scene, false);
      this.reflection.renderParticles = false; this.reflection.renderSprites = false;
    } else if (this.reflection.getSize().width !== size) this.reflection.resize(size);
    if (!this.scene.customRenderTargets.includes(this.reflection)) this.scene.customRenderTargets.push(this.reflection);
    this.reflection.refreshRate = quality === 'low' ? 2 : 1;
    this.reflection.clearColor = this.scene.clearColor.clone();
    // Pond/pool share a height. The shallow curb water differs by only 25 cm.
    const dominant = visible.find(mesh => mesh.metadata?.waterKind !== 'puddle') ?? visible[0]!;
    this.reflection.mirrorPlane = new Plane(0, -1, 0, dominant.position.y);
    this.reflection.renderList = this.scene.meshes.filter(mesh => {
      if (!mesh.isVisible || !mesh.isEnabled() || mesh.visibility <= 0 || mesh.material === this.material || this.borders.includes(mesh as Mesh)) return false;
      const box = mesh.getBoundingInfo().boundingBox;
      return box.maximumWorld.y > dominant.position.y + .1 && visible.some(surface =>
        box.maximumWorld.x > surface.position.x - 35 && box.minimumWorld.x < surface.position.x + 35 &&
        box.maximumWorld.z > surface.position.z - 35 && box.minimumWorld.z < surface.position.z + 35);
    });
  }
  getStats() { return { waterSurfaces: this.disposed ? 0 : this.meshes.filter(m=>m.isEnabled()).length, waterTime: this.time, waterRipples: this.ripples, waterReflectionPasses: this.reflectionActive && !this.disposed ? 1 : 0 }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.reflection?.dispose(); for (const mesh of [...this.meshes, ...this.borders]) mesh.dispose(); this.material.dispose(); this.borderMaterial.dispose(); }
}

class WaterFinish extends MaterialPluginBase {
  private readonly sky = new Color3();
  constructor(material: PBRMaterial, private water: WetSurfaces) { super(material, 'ShallowWaterFinish', 200, { FENDER_SHALLOW_WATER: true }, true, true); }
  override getSamplers(samplers: string[]): void { samplers.push('waterReflectionSampler'); }
  override getUniforms() { return { externalUniforms: ['waterTime', 'waterSkyColor', 'waterBounds', 'waterRectangular', 'waterViewProjection', 'waterReflectionReady'] }; }
  override bindForSubMesh(_buffer: UniformBuffer, scene: Scene, _engine: AbstractEngine, mesh: SubMesh): void {
    const surface = mesh.getRenderingMesh(), box = surface.getBoundingInfo().boundingBox;
    this.sky.set(scene.clearColor.r, scene.clearColor.g, scene.clearColor.b).toLinearSpaceToRef(this.sky);
    mesh.effect?.setColor3('waterSkyColor', this.sky);
    mesh.effect?.setFloat4('waterBounds', box.centerWorld.x, box.centerWorld.z, box.extendSizeWorld.x, box.extendSizeWorld.z);
    mesh.effect?.setFloat('waterRectangular', surface.metadata?.waterKind === 'pool' ? 1 : 0);
    mesh.effect?.setFloat('waterTime', this.water.time);
    mesh.effect?.setMatrix('waterViewProjection', scene.getTransformMatrix());
    mesh.effect?.setTexture('waterReflectionSampler', this.water.reflection);
    mesh.effect?.setFloat('waterReflectionReady', this.water.getStats().waterReflectionPasses);
  }
  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `uniform float waterTime;
        uniform vec3 waterSkyColor; uniform vec4 waterBounds; uniform float waterRectangular;
        uniform mat4 waterViewProjection; uniform sampler2D waterReflectionSampler; uniform float waterReflectionReady;`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        float waveA = dot(vPositionW.xz, vec2(3.8, 1.4)) + waterTime * 0.9;
        float waveB = dot(vPositionW.xz, vec2(-2.7, 5.1)) - waterTime * 0.7;
        float waveC = dot(vPositionW.xz, vec2(7.2, 4.3)) + waterTime * 1.1;
        vec2 waterSlope = vec2(3.8, 1.4) * cos(waveA) * 0.025
          + vec2(-2.7, 5.1) * cos(waveB) * 0.014 + vec2(7.2, 4.3) * cos(waveC) * 0.006;
        normalW = normalize(vec3(-waterSlope.x, 1.0, -waterSlope.y));
        vec2 waterLocal = abs((vPositionW.xz - waterBounds.xy) / waterBounds.zw);
        float shoreDistance = mix(length(waterLocal), max(waterLocal.x, waterLocal.y), waterRectangular);
        float shallowEdge = smoothstep(0.5, 1.0, shoreDistance);
        surfaceAlbedo = mix(surfaceAlbedo, vec3(0.22, 0.43, 0.36), shallowEdge * 0.65);
      `,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        vec3 reflectedScene = waterSkyColor;
        if (waterReflectionReady > 0.5) {
          vec4 projectedWater = waterViewProjection * vec4(vPositionW, 1.0);
          vec2 reflectionUV = projectedWater.xy / projectedWater.w * 0.5 + 0.5;
          reflectionUV += waterSlope * 0.018;
          reflectedScene = pow(texture2D(waterReflectionSampler, clamp(reflectionUV, 0.001, 0.999)).rgb, vec3(2.2));
        }
        float waterFresnel = pow(1.0 - clamp(dot(normalW, viewDirectionW), 0.0, 1.0), 5.0);
        finalColor.rgb = mix(finalColor.rgb, reflectedScene, 0.48 + waterFresnel * 0.42);
        float crease = pow(max(0.0, sin(waveA) * 0.65 + sin(waveB) * 0.35), 12.0);
        finalColor.rgb += waterSkyColor * crease * 0.12 * (1.0 - shallowEdge * 0.4);
      `,
    };
  }
}
