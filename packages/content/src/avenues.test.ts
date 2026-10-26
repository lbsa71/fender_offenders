import { expect, it } from 'vitest';
import { districtMap, roadCenters } from './index';

it('extends the district to 400 metres with unobstructed long avenues in both directions', () => {
  expect(districtMap.bounds).toEqual({ minX: -200, maxX: 200, minZ: -200, maxZ: 200 });
  expect(roadCenters).toContain(-160); expect(roadCenters).toContain(160);
  for (const axis of ['x', 'z'] as const) for (const center of roadCenters) {
    const road = districtMap.surfaces.find(surface => surface.id === `road-${axis}-${center}`)!;
    const along = road.polygonXZ.filter((_, index) => index % 2 === (axis === 'x' ? 1 : 0));
    expect(Math.max(...along) - Math.min(...along)).toBe(400);
    for (let distance = -180; distance <= 180; distance += 4) {
      const x = axis === 'x' ? center + 4 : distance, z = axis === 'x' ? distance : center + 4;
      for (const collider of districtMap.colliders) {
        if (!collider.halfExtents) continue;
        const dx = Math.max(0, Math.abs(x - collider.pose.x) - collider.halfExtents.x);
        const dz = Math.max(0, Math.abs(z - collider.pose.z) - collider.halfExtents.z);
        expect(Math.hypot(dx, dz), `${road.id}/${collider.id}`).toBeGreaterThan(1.1);
      }
    }
  }
});

it('gives the pursuit route long straights while retaining connected turn-offs and clear original spawns', () => {
  const nodes = new Map(districtMap.laneNodes.map(node => [node.id, node]));
  expect(districtMap.laneEdges.filter(edge => {
    const a = nodes.get(edge.from)!, b = nodes.get(edge.to)!;
    return Math.hypot(a.x - b.x, a.z - b.z) >= 300;
  }).length).toBeGreaterThanOrEqual(4);
  for (const node of nodes.values()) {
    expect(districtMap.laneEdges.some(edge => edge.from === node.id)).toBe(true);
    expect(districtMap.laneEdges.some(edge => edge.to === node.id)).toBe(true);
  }
  expect(districtMap.spawns.find(spawn => spawn.id === 'bureau-start')!.pose).toEqual({ x: 4, z: -48, yaw: 0 });
});
