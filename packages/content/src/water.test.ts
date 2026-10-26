import { describe, expect, it } from 'vitest';
import * as content from './index';
import { PEDESTRIAN_ROUTES } from './pedestrian-routes';

interface WaterSite { id: string; kind: 'puddle' | 'pond' | 'pool'; x: number; z: number; width: number; depth: number; shallow: boolean }
const sites = () => (content as unknown as { DISTRICT_WATER?: readonly WaterSite[] }).DISTRICT_WATER ?? [];
const distanceToSegment = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};

describe('authored shallow water', () => {
  it('uses the full authored rectangular swimming-pool footprint', () => {
    const pool = content.DISTRICT_WATER.find(site => site.kind === 'pool')!;
    const polygon = content.waterFootprint(pool), xs = polygon.filter((_, i) => i % 2 === 0), zs = polygon.filter((_, i) => i % 2 === 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(pool.width);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(pool.depth);
  });
  it('shares exact road-puddle polygons with driving physics while leaving ponds and pools decorative',()=>{
    const zones=content.districtMap.wetSurfaces??[];
    expect(zones).toHaveLength(4);
    expect(zones.map(z=>z.id).sort()).toEqual(sites().filter(s=>s.kind==='puddle').map(s=>s.id).sort());
    for(const zone of zones){expect(zone.polygonXZ.length).toBeGreaterThanOrEqual(8);expect(zone.polygonXZ.every(Number.isFinite)).toBe(true);}
  });
  it('includes road puddles, one visibly shallow park pond and one decorative pool', () => {
    expect(sites().filter(s => s.kind === 'puddle').length).toBeGreaterThanOrEqual(4);
    expect(sites().filter(s => s.kind === 'pond')).toHaveLength(1);
    expect(sites().filter(s => s.kind === 'pool')).toHaveLength(1);
    expect(sites().every(s => s.shallow)).toBe(true);
  });
  it('keeps the entire water footprint outside buildings, spawn clearance and walking/shortcut routes', () => {
    expect(sites().length).toBeGreaterThan(0);
    for (const s of sites()) {
      const radius = Math.hypot(s.width / 2, s.depth / 2);
      for (const b of content.buildings) expect(Math.abs(s.x - b.x) > (s.width + b.width) / 2 + .5 || Math.abs(s.z - b.z) > (s.depth + b.depth) / 2 + .5, `${s.id}/${b.id}`).toBe(true);
      for (const spawn of content.districtMap.spawns) expect(Math.hypot(s.x - spawn.pose.x, s.z - spawn.pose.z) - radius, `${s.id}/${spawn.id}`).toBeGreaterThan(spawn.clearanceRadius);
      for (const route of PEDESTRIAN_ROUTES) for (let i = 0; i < route.points.length; i++) {
        const a = route.points[i]!, b = route.points[(i + 1) % route.points.length]!;
        expect(distanceToSegment(s.x, s.z, a.x, a.z, b.x, b.z) - radius, `${s.id}/${route.id}`).toBeGreaterThan(1);
      }
      for (const surface of content.districtMap.surfaces.filter(s => s.surface === 'dirt')) {
        const p = surface.polygonXZ;
        for (let i = 0; i < p.length; i += 2) {
          const j = (i + 2) % p.length;
          expect(distanceToSegment(s.x, s.z, p[i]!, p[i + 1]!, p[j]!, p[j + 1]!) - radius, `${s.id}/${surface.id}`).toBeGreaterThan(1.1);
        }
      }
      expect(content.districtMap.colliders.some(c => c.id === s.id)).toBe(false);
      expect(content.districtMap.surfaces.some(surface => surface.id === s.id)).toBe(false);
    }
  });
});
