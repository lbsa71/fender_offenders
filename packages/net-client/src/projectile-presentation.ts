import type { CollisionMap, GameEvent, ProjectileState, WorldSnapshot } from '@fender/contracts';

export type PresentedProjectile = ProjectileState & { presentationAgeSeconds: number };
type Point = { x: number; z: number };
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

/** XZ convex hull also removes duplicate upper/lower vertices of exported 3D solids. */
function solidPolygon(collider: CollisionMap['colliders'][number]): Point[] {
  const local: Point[] = [];
  if (collider.shape === 'box') {
    const { x, z } = collider.halfExtents!;
    local.push({ x: -x, z: -z }, { x, z: -z }, { x, z }, { x: -x, z });
  } else {
    for (let i = 0; i < (collider.vertices?.length ?? 0); i += 3) local.push({ x: collider.vertices![i]!, z: collider.vertices![i + 2]! });
  }
  const sin = Math.sin(collider.pose.yaw), cos = Math.cos(collider.pose.yaw);
  const sorted = local.map(p => ({ x: collider.pose.x + p.x * cos + p.z * sin, z: collider.pose.z - p.x * sin + p.z * cos }))
    .sort((a, b) => a.x - b.x || a.z - b.z).filter((p, i, points) => !i || p.x !== points[i - 1]!.x || p.z !== points[i - 1]!.z);
  const half = (points: Point[]) => {
    const hull: Point[] = [];
    for (const point of points) { while (hull.length > 1 && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, point) <= 0) hull.pop(); hull.push(point); }
    return hull.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** Earliest entry into a CCW convex solid, including a point on/inside its boundary. */
function segmentEntry(start: Point, end: Point, polygon: Point[]): number | null {
  let entry = 0, exit = 1;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const from = cross(a, b, start), delta = cross(a, b, end) - from;
    if (Math.abs(delta) < 1e-10) { if (from < -1e-10) return null; continue; }
    const at = -from / delta;
    if (delta > 0) entry = Math.max(entry, at); else exit = Math.min(exit, at);
    if (entry > exit) return null;
  }
  return entry <= 1 && exit >= 0 ? Math.max(0, entry) : null;
}

/** Presentation-only sampling; all poses are copies and authoritative hits remain server-owned. */
export class ProjectilePresentation {
  private latest: WorldSnapshot | null = null;
  private history: WorldSnapshot[] = [];
  private matchId: string | null = null;
  private progress = new Map<string, { tick: number; point: Point }>();
  private retired = new Set<string>();
  private disposed = false;
  private solids: Point[][];

  constructor(map: CollisionMap) {
    this.solids = map.colliders.filter(c => c.layer === 'world-solid').map(solidPolygon).filter(p => p.length >= 3);
  }

  receive(snapshot: WorldSnapshot, reset = false): void {
    if (this.disposed) return;
    const previous = this.latest, newMatch = this.matchId !== null && this.matchId !== snapshot.matchId;
    const newEpoch = previous !== null && previous.sessionEpoch !== snapshot.sessionEpoch;
    if (!newMatch && !newEpoch && previous && snapshot.serverTick < previous.serverTick) return;
    if (newMatch || newEpoch) this.retired.clear();
    const newLife = previous?.local?.vehicle.discontinuityId !== snapshot.local?.vehicle.discontinuityId;
    if (reset || newMatch || newEpoch || newLife) { this.history = []; this.progress.clear(); }
    this.matchId = snapshot.matchId; this.latest = snapshot;
    this.history.push(snapshot); if (this.history.length > 40) this.history.shift();
    // Current authority wins over any buffered history, and bookkeeping stays bounded by live shots.
    const live = new Set(snapshot.projectiles.map(p => p.entityId));
    for (const id of this.progress.keys()) if (!live.has(id)) this.progress.delete(id);
  }

  present(events: readonly GameEvent[]): void {
    if (this.disposed) return;
    for (const event of events) {
      if (this.matchId !== null && event.matchId !== this.matchId) continue;
      if (event.kind !== 'hit' && event.kind !== 'projectile-impact') continue;
      this.matchId ??= event.matchId;
      this.retire(event.payload.projectileId);
    }
  }

  sample(localEntityId: string | null, estimatedTick: number, playbackTick: number): PresentedProjectile[] {
    if (this.disposed || !this.latest) return [];
    const result: PresentedProjectile[] = [];
    for (const projectile of this.latest.projectiles) {
      const local = projectile.ownerEntityId === localEntityId;
      const target = local ? estimatedTick : playbackTick;
      if (!Number.isFinite(target) || target < projectile.bornTick || this.retired.has(projectile.entityId)) continue;
      if (target >= projectile.expiresTick) { this.retire(projectile.entityId); continue; }
      let sampleTick = Math.min(target, this.latest.serverTick + 6);
      if (local) sampleTick = Math.max(this.latest.serverTick, sampleTick);
      const previous = this.progress.get(projectile.entityId);
      sampleTick = Math.max(projectile.bornTick, sampleTick, previous?.tick ?? -Infinity);
      let anchor = projectile, anchorTick = this.latest.serverTick;
      let end: Point;
      if (!local) {
        const before = [...this.history].reverse().find(s => s.serverTick <= sampleTick && s.projectiles.some(p => p.entityId === projectile.entityId));
        const after = this.history.find(s => s.serverTick >= sampleTick && s.projectiles.some(p => p.entityId === projectile.entityId));
        if (before && after && before !== after) {
          anchor = before.projectiles.find(p => p.entityId === projectile.entityId)!; anchorTick = before.serverTick;
          const next = after.projectiles.find(p => p.entityId === projectile.entityId)!;
          const fraction = (sampleTick - anchorTick) / (after.serverTick - anchorTick);
          end = { x: anchor.pose.x + (next.pose.x - anchor.pose.x) * fraction, z: anchor.pose.z + (next.pose.z - anchor.pose.z) * fraction };
        } else {
          const source = before ?? after;
          if (source) { anchor = source.projectiles.find(p => p.entityId === projectile.entityId)!; anchorTick = source.serverTick; }
          end = this.advance(anchor, sampleTick - anchorTick);
        }
      } else end = this.advance(anchor, sampleTick - anchorTick);
      // Quantized authority coordinates can shift the line backward even at the same sample tick.
      if (previous && (end.x - previous.point.x) * projectile.velocity.x + (end.z - previous.point.z) * projectile.velocity.z < 0) end = previous.point;
      const clipped = this.clip(anchor.pose, end);
      if (!clipped) continue;
      // A wall can shorten projected travel; the tail must use that shorter visible age too.
      const visibleTick = anchorTick + (sampleTick - anchorTick) * clipped.fraction;
      const output: PresentedProjectile = { ...projectile, pose: { ...projectile.pose, ...clipped.point }, velocity: { ...projectile.velocity }, presentationAgeSeconds: Math.max(0, (visibleTick - projectile.bornTick + 1) / 60) };
      this.progress.set(projectile.entityId, { tick: sampleTick, point: clipped.point }); result.push(output);
    }
    return result;
  }

  private advance(projectile: ProjectileState, ticks: number): Point {
    return { x: projectile.pose.x + projectile.velocity.x * ticks / 60, z: projectile.pose.z + projectile.velocity.z * ticks / 60 };
  }

  private retire(id: string): void {
    this.retired.add(id); this.progress.delete(id);
    if (this.retired.size > 512) this.retired.delete(this.retired.values().next().value!);
  }

  private clip(start: Point, end: Point): { point: Point; fraction: number } | null {
    let fraction = 1;
    for (const polygon of this.solids) {
      const hit = segmentEntry(start, end, polygon);
      if (hit === 0) return null;
      if (hit !== null) fraction = Math.min(fraction, hit);
    }
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    if (fraction < 1 && length > 0) fraction = Math.max(0, fraction - .02 / length);
    return { point: { x: start.x + (end.x - start.x) * fraction, z: start.z + (end.z - start.z) * fraction }, fraction };
  }

  reset(): void { this.latest = null; this.history = []; this.matchId = null; this.progress.clear(); this.retired.clear(); }
  dispose(): void { this.reset(); this.disposed = true; }
}
