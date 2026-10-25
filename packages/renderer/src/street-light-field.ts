import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import type { Material } from '@babylonjs/core/Materials/material';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { Scene } from '@babylonjs/core/scene';
import type { PropState } from '@fender/contracts';

const SIZE = 512;
interface LampSource { id: string; position: Vector3; radius: number }

/** Cached world-space diffuse lighting: one sample per surface, independent of camera and lamp count. */
export class StreetLightField {
  readonly texture: RawTexture;
  readonly sources: LampSource[] = [];
  readonly bounds = [-1, -1, 2, 2];
  strength = 0;
  disposed = false;
  private signature = '';
  private readonly pixels = new Uint8Array(SIZE * SIZE * 4);
  private readonly energy = new Float32Array(SIZE * SIZE);
  private readonly height = new Float32Array(SIZE * SIZE);
  private readonly materials = new WeakSet<Material>();

  constructor(private scene: Scene) {
    this.texture = RawTexture.CreateRGBATexture(this.pixels, SIZE, SIZE, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
    this.texture.name = 'street-light-field'; this.texture.wrapU = this.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  }

  update(props: readonly PropState[]): void {
    if (this.disposed) return;
    const lamps = props.slice(0, 192).filter(p => p.kind === 'lamp' && p.mode === 'fixed' && Math.abs(p.rotation.x) < .1 && Math.abs(p.rotation.z) < .1);
    const signature = lamps.map(p => `${p.entityId}:${p.position.x},${p.position.y},${p.position.z},${p.scale},${p.rotation.x},${p.rotation.y},${p.rotation.z},${p.rotation.w}`).join(';');
    if (signature !== this.signature) {
      this.signature = signature; this.sources.length = 0;
      const q = Quaternion.Identity();
      for (const p of lamps) {
        q.set(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w).normalize();
        const head = new Vector3(-1.4 * p.scale, 2.3 * p.scale, 0).rotateByQuaternionToRef(q, new Vector3());
        head.addInPlaceFromFloats(p.position.x, p.position.y, p.position.z); head.x = -head.x;
        this.sources.push({ id: p.entityId, position: head, radius: 14 * p.scale });
      }
      this.rebuild();
    }
    for (const material of this.scene.materials) {
      if (this.materials.has(material)) continue;
      this.materials.add(material);
      const type = material.getClassName();
      if (type === 'StandardMaterial' || type === 'PBRMaterial') new StreetLightMaterial(material, this, type === 'PBRMaterial');
    }
  }

  private rebuild(): void {
    const minX = Math.min(0, ...this.sources.map(l => l.position.x - l.radius - 1)), minZ = Math.min(0, ...this.sources.map(l => l.position.z - l.radius - 1));
    const maxX = Math.max(1, ...this.sources.map(l => l.position.x + l.radius + 1)), maxZ = Math.max(1, ...this.sources.map(l => l.position.z + l.radius + 1));
    this.bounds.splice(0, 4, minX, minZ, maxX - minX, maxZ - minZ);
    this.energy.fill(0); this.height.fill(0); this.pixels.fill(0);
    const sx = SIZE / this.bounds[2]!, sz = SIZE / this.bounds[3]!;
    for (const l of this.sources) {
      const x0 = Math.max(0, Math.floor((l.position.x - l.radius - minX) * sx)), x1 = Math.min(SIZE - 1, Math.ceil((l.position.x + l.radius - minX) * sx));
      const z0 = Math.max(0, Math.floor((l.position.z - l.radius - minZ) * sz)), z1 = Math.min(SIZE - 1, Math.ceil((l.position.z + l.radius - minZ) * sz));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const dx = minX + (x + .5) / sx - l.position.x, dz = minZ + (z + .5) / sz - l.position.z;
        const edge = Math.max(0, 1 - (dx * dx + dz * dz) / (l.radius * l.radius)), value = edge * edge, i = z * SIZE + x;
        this.energy[i]! += value; this.height[i]! += value * l.position.y;
      }
    }
    for (let i = 0; i < this.energy.length; i++) if (this.energy[i]! > 0) {
      this.pixels[i * 4] = Math.round(Math.min(1, this.energy[i]!) * 255);
      this.pixels[i * 4 + 1] = Math.round(Math.min(1, this.height[i]! / this.energy[i]! / 16) * 255);
      this.pixels[i * 4 + 3] = 255;
    }
    this.texture.update(this.pixels);
  }

  dispose(): void { if (this.disposed) return; this.disposed = true; this.strength = 0; this.sources.length = 0; this.texture.dispose(); }
}

class StreetLightMaterial extends MaterialPluginBase {
  constructor(material: Material, private field: StreetLightField, private pbr: boolean) { super(material, 'StreetLightField', 210, {}, true, true); }
  override getSamplers(samplers: string[]): void { samplers.push('streetFieldSampler'); }
  override getUniforms() { return { externalUniforms: ['streetFieldBounds', 'streetFieldStrength'] }; }
  override bindForSubMesh(_buffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, subMesh: SubMesh): void {
    const b = this.field.bounds, effect = subMesh.effect;
    effect?.setTexture('streetFieldSampler', this.field.disposed ? null : this.field.texture);
    effect?.setFloat4('streetFieldBounds', b[0]!, b[1]!, b[2]!, b[3]!); effect?.setFloat('streetFieldStrength', this.field.strength);
  }
  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform sampler2D streetFieldSampler;
        uniform vec4 streetFieldBounds;
        uniform float streetFieldStrength;
        vec3 streetRadiance(vec3 positionW, vec3 surfaceNormal) {
          vec2 uv = (positionW.xz - streetFieldBounds.xy) / streetFieldBounds.zw;
          vec4 field = texture2D(streetFieldSampler, clamp(uv, 0.0, 1.0));
          float headHeight = max(0.1, field.g * 16.0);
          float vertical = clamp(1.0 - pow(max(0.0, positionW.y) / headHeight, 2.0), 0.0, 1.0);
          float facing = 0.2 + 0.8 * max(0.0, surfaceNormal.y);
          return vec3(1.0, 0.78, 0.44) * field.r * vertical * facing * streetFieldStrength;
        }`,
      CUSTOM_FRAGMENT_BEFORE_FOG: this.pbr ? 'finalColor.rgb += streetRadiance(vPositionW, normalW) * surfaceAlbedo;' : 'color.rgb += streetRadiance(vPositionW, normalW) * baseColor.rgb * diffuseColor;',
    };
  }
}
