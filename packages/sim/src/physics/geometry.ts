import type { CollisionMap, PlanarPose } from '@fender/contracts';

export type Point = { x: number; z: number };
export const HALF_WIDTH = 0.95;
export const HALF_LENGTH = 2.15;
export const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const polygonBounds = new WeakMap<Point[], { minX: number; maxX: number; minZ: number; maxZ: number }>();
export function nearPolygon(pose: Point, polygon: Point[], radius = 2.4): boolean {
  let bounds = polygonBounds.get(polygon);
  if (!bounds) {
    bounds = { minX: Math.min(...polygon.map(p => p.x)), maxX: Math.max(...polygon.map(p => p.x)), minZ: Math.min(...polygon.map(p => p.z)), maxZ: Math.max(...polygon.map(p => p.z)) };
    polygonBounds.set(polygon, bounds);
  }
  return pose.x + radius >= bounds.minX && pose.x - radius <= bounds.maxX && pose.z + radius >= bounds.minZ && pose.z - radius <= bounds.maxZ;
}

export function box(pose: PlanarPose, hx = HALF_WIDTH, hz = HALF_LENGTH): Point[] {
  const s = Math.sin(pose.yaw), c = Math.cos(pose.yaw);
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => ({ x: pose.x + x! * c + z! * s, z: pose.z - x! * s + z! * c }));
}

export function colliderPolygon(collider: CollisionMap['colliders'][number]): Point[] {
  if (collider.shape === 'box') return box(collider.pose, collider.halfExtents!.x, collider.halfExtents!.z);
  const s = Math.sin(collider.pose.yaw), c = Math.cos(collider.pose.yaw);
  const vertices = collider.vertices!;
  const points: Point[] = [];
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i]!, z = vertices[i + 2]!;
    points.push({ x: collider.pose.x + x * c + z * s, z: collider.pose.z - x * s + z * c });
  }
  // Convex hull discards duplicate top/bottom vertices from exported 3D meshes.
  const sorted = points.sort((a, b) => a.x - b.x || a.z - b.z).filter((p, i, a) => i === 0 || p.x !== a[i - 1]!.x || p.z !== a[i - 1]!.z);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const half = (list: Point[]) => { const h: Point[] = []; for (const p of list) { while (h.length > 1 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop(); h.push(p); } return h; };
  return half(sorted).slice(0, -1).concat(half([...sorted].reverse()).slice(0, -1));
}

/** Minimum separating translation from convex polygon B to A. */
export function overlap(a: Point[], b: Point[]): Point | null {
  let depth = Infinity, normal = { x: 0, z: 0 };
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!;
      const length = Math.hypot(q.x - p.x, q.z - p.z);
      if (length < 1e-8) continue;
      const axis = { x: -(q.z - p.z) / length, z: (q.x - p.x) / length };
      const pa = a.map(v => v.x * axis.x + v.z * axis.z), pb = b.map(v => v.x * axis.x + v.z * axis.z);
      const left = Math.max(...pb) - Math.min(...pa), right = Math.max(...pa) - Math.min(...pb);
      if (left <= 0 || right <= 0) return null;
      const signed = left < right ? left : -right;
      if (Math.abs(signed) < depth) { depth = Math.abs(signed); normal = { x: axis.x * signed, z: axis.z * signed }; }
    }
  }
  return Number.isFinite(depth) ? normal : null;
}

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Earliest segment intersection, including a segment beginning inside. */
export function segmentPolygon(start: Point, end: Point, polygon: Point[]): number | null {
  if (pointInPolygon(start, polygon)) return 0;
  const dx = end.x - start.x, dz = end.z - start.z;
  let earliest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const ex = b.x - a.x, ez = b.z - a.z, denominator = dx * ez - dz * ex;
    if (Math.abs(denominator) < 1e-9) continue;
    const ax = a.x - start.x, az = a.z - start.z;
    const t = (ax * ez - az * ex) / denominator, u = (ax * dz - az * dx) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) earliest = Math.min(earliest, t);
  }
  return earliest === Infinity ? null : earliest;
}

export function isPoseClear(map: CollisionMap, solids: Point[][], pose: PlanarPose): boolean {
  const shape = box(pose), b = map.bounds;
  return shape.every(p => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ) && solids.every(s => !overlap(shape, s));
}
