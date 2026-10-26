import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { Particle } from '@babylonjs/core/Particles/particle';
import type { Scene } from '@babylonjs/core/scene';
import type { GrenadeOptions } from './grenade-effects';

/** Original soft, turbulent sprite shared by all blast particles; no downloaded assets. */
export function createGrenadeParticleTexture(scene: Scene): RawTexture {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const turbulence = .78 + .12 * Math.sin(u * 17 + Math.sin(v * 11)) + .1 * Math.sin(v * 23 + u * 9);
    const alpha = Math.pow(Math.max(0, 1 - Math.hypot(u, v)), 1.6) * turbulence;
    const offset = (y * size + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
    pixels[offset + 3] = Math.round(alpha * 255);
  }
  const texture = RawTexture.CreateRGBATexture(pixels, size, size, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
  texture.name = 'grenade-soft-particle'; texture.hasAlpha = true;
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

type Kind = 'fire' | 'smoke' | 'embers';
const COUNTS: Record<Kind, number> = { fire: 36, smoke: 20, embers: 24 };
/** Fixed GPU resources; the authority presentation clock also owns particle motion. */
export class GrenadeBlastParticles {
  private systems: Array<{ kind: Kind; system: ParticleSystem }> = [];
  private origin = Vector3.Zero();
  private age = 0; private radius = 1; private options: GrenadeOptions = {};
  constructor(scene: Scene, index: number, texture: RawTexture) {
    for (const kind of ['smoke', 'fire', 'embers'] as const) {
      const system = new ParticleSystem(`grenade-blast-${index}-${kind}`, COUNTS[kind], scene);
      system.particleTexture = texture; system.emitter = this.origin;
      system.blendMode = kind === 'smoke' ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ADD;
      system.renderingGroupId = 1; system.emitRate = 0; system.updateSpeed = 0;
      system.minLifeTime = system.maxLifeTime = 1.6;
      system.color1 = system.color2 = new Color4(1, 1, 1, 1);
      system.startPositionFunction = (_world, position) => position.copyFrom(this.origin);
      system.startDirectionFunction = (_world, direction) => direction.setAll(0);
      system.updateFunction = particles => this.sampleParticles(kind, particles);
      this.systems.push({ kind, system });
    }
  }
  start(x: number, z: number, radius: number, options: GrenadeOptions) {
    this.clear(); this.origin.set(x, .45, z); this.radius = radius; this.age = 0; this.options = options;
    for (const { kind, system } of this.systems) {
      system.manualEmitCount = COUNTS[kind]; system.start();
      // Emit without waiting for shader compilation or the next scene frame. This
      // preserves the first visible burst at low FPS and in zero-delta snapshots.
      system.animate(true); this.sampleParticles(kind, system.particles);
    }
  }
  sample(age: number, options: GrenadeOptions) {
    this.age = age; this.options = options;
    for (const { kind, system } of this.systems) this.sampleParticles(kind, system.particles);
  }
  private sampleParticles(kind: Kind, particles: Particle[]) {
    const reduced = !!this.options.reducedMotion, dim = !!this.options.reducedFlash;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!, variation = (i * .61803398875) % 1, angle = i * 2.39996323;
      const t = this.age, motion = reduced ? .15 : 1, r = this.radius;
      p.age = t; p.angle = angle + t * (variation - .5); p.scale.set(1, 1);
      if (kind === 'fire') {
        const life = .28 + variation * .3, progress = Math.min(1, t / life);
        // Vary radial speed independently of lifetime so the burst fills a
        // turbulent volume rather than resolving into a tidy expanding ring.
        const spread = (i * .754877666) % 1;
        const distance = r * (.02 + t * 1.4 * spread) * motion;
        p.position.set(this.origin.x + Math.sin(angle) * distance, this.origin.y + (.3 + t * (1.8 + variation * 3)) * motion, this.origin.z + Math.cos(angle) * distance);
        p.size = r * (.24 + variation * .25) * (1 + progress * .8) * (reduced ? .45 : 1);
        p.color.set(1, .72 - progress * .5, .28 * (1 - progress), (1 - progress) * (dim ? .12 : .85));
        if (dim && i >= 3) p.color.a = 0;
      } else if (kind === 'smoke') {
        const distance = r * (.08 + t * (.12 + variation * .23)) * motion;
        p.position.set(this.origin.x + Math.sin(angle) * distance + t * .3 * motion, this.origin.y + .35 + t * (1.8 + variation * 1.7) * motion, this.origin.z + Math.cos(angle) * distance);
        p.size = r * (.18 + variation * .18 + t * .32) * (reduced ? .55 : 1);
        const shade = .19 + variation * .08 + t * .11;
        const fade = Math.min(1, Math.max(0, (1.6 - t) / .65));
        p.color.set(shade, shade * .98, shade * .94, (.3 + Math.min(t, .2)) * fade);
        if (reduced && i >= 4) p.color.a = 0;
      } else {
        const life = .5 + variation * .5, distance = r * t * (.6 + variation);
        p.position.set(this.origin.x + Math.sin(angle) * distance, Math.max(.08, this.origin.y + t * (4 + variation * 5) - 4.9 * t * t), this.origin.z + Math.cos(angle) * distance);
        p.size = .09 + variation * .1; p.scale.set(1, 2.5);
        p.color.set(1, .6 - t * .3, .12, reduced || dim ? 0 : Math.max(0, 1 - t / life));
      }
    }
  }
  counts() {
    const counts = { fire: 0, smoke: 0, embers: 0 };
    for (const { kind, system } of this.systems) for (const p of system.particles) if (p.color.a > 0) counts[kind]++;
    return counts;
  }
  clear() { for (const { system } of this.systems) { system.stop(); system.reset(); } }
  dispose() { for (const { system } of this.systems) system.dispose(false); this.systems = []; }
}
