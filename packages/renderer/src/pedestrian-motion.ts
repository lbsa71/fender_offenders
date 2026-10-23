import type { VehicleState } from '@fender/contracts';
import { buildings, roadCenters } from '@fender/content';
import { PEDESTRIAN_ROUTES, type PedestrianRoute } from '../../content/src/pedestrian-routes';
export interface PedestrianState { id: number; x: number; z: number; yaw: number; mode: 'walking' | 'waiting' | 'running'; hiddenSafety: boolean; gait: number }
interface Point { x: number; z: number }
interface Refuge extends Point { route: number; segment: number; progress: number }
interface Walker extends PedestrianState { route: number; segment: number; progress: number; calm: number; target: Refuge | null }
interface CarPath { now: Point; swept: Point; future: Point[] }
// Includes the maximum cartoon car stretch and the figure's swinging arms.
const FIXED = 1 / 60, CLEARANCE = 4.7;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
function pointSegment(p: Point, a: Point, b: Point) { const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz; return distance(p, mix(a, b, length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length)) : 0)); }
/** Refuges are authored pavement, outside every building footprint with body clearance. */
export function isPedestrianSidewalk(p: Point) {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > 72 || Math.abs(p.z) > 72) return false;
  const dx = Math.min(...roadCenters.map(x => Math.abs(p.x - x))), dz = Math.min(...roadCenters.map(z => Math.abs(p.z - z)));
  if (dx < 8.8 || dz < 8.8 || !(dx <= 14.1 || dz <= 14.1)) return false;
  return buildings.every(b => Math.abs(p.x - b.x) > b.width / 2 + .65 || Math.abs(p.z - b.z) > b.depth / 2 + .65);
}
export class PedestrianMotion {
  private walkers: Walker[] = []; private refuges: Refuge[] = []; private previous = new Map<string, Point>(); private accumulator = 0; private disposed = false; private emergencyRetreats = 0;
  constructor(private routes: readonly PedestrianRoute[] = PEDESTRIAN_ROUTES, private count = 24) {
    routes.forEach((route, r) => route.points.forEach((a, segment) => {
      if (a.crossingToNext) return; const b = route.points[(segment + 1) % route.points.length]!, steps = Math.ceil(distance(a, b) / 2.5);
      for (let i = 0; i <= steps; i++) for (const offset of [-3.2, 0, 3.2]) {
        const point = mix(a, b, i / steps); if (a.x === b.x) point.x += offset; else point.z += offset;
        if (isPedestrianSidewalk(point)) this.refuges.push({ ...point, route: r, segment, progress: i / steps });
      }
    })); this.reset();
  }
  reset() {
    if (this.disposed) return; this.previous.clear(); this.accumulator = 0; this.emergencyRetreats = 0;
    this.walkers = this.routes.length ? Array.from({ length: Math.min(36, Math.max(0, this.count)) }, (_, id) => {
      const route = id % this.routes.length, path = this.routes[route]!, sidewalks = path.points.map((p, i) => p.crossingToNext ? -1 : i).filter(i => i >= 0);
      const segment = id === 0 ? 0 : sidewalks[Math.floor(id / this.routes.length) % sidewalks.length] ?? 0;
      const progress = id === 0 || path.points[segment]!.crossingToNext ? 0 : (id * 17 % 43) / 43;
      return { id, route, segment, progress, ...mix(path.points[segment]!, path.points[(segment + 1) % path.points.length]!, progress), yaw: 0, mode: 'walking', hiddenSafety: false, gait: id * .71, calm: 0, target: null };
    }) : [];
  }
  private paths(vehicles: readonly VehicleState[]): CarPath[] {
    return vehicles.filter(v => v.status !== 'respawning' && Number.isFinite(v.pose.x) && Number.isFinite(v.pose.z)).map(v => {
      const now = { x: v.pose.x, z: v.pose.z }, future = [now]; let x = now.x, z = now.z, vx = Number.isFinite(v.velocity.x) ? v.velocity.x : 0, vz = Number.isFinite(v.velocity.z) ? v.velocity.z : 0;
      const turn = Math.max(-3, Math.min(3, v.velocity.yawRate || 0)), step = .2;
      for (let i = 0; i < 20; i++) { const angle = turn * step, nx = vx * Math.cos(angle) + vz * Math.sin(angle); vz = vz * Math.cos(angle) - vx * Math.sin(angle); vx = nx; x += vx * step; z += vz * step; future.push({ x, z }); }
      return { now, swept: this.previous.get(v.entityId) ?? now, future };
    });
  }
  private clear(point: Point, paths: CarPath[], predict = 0) {
    return paths.every(car => pointSegment(point, car.swept, car.now) > CLEARANCE && car.future.slice(1, 1 + predict).every((next, i) => pointSegment(point, car.future[i]!, next) > CLEARANCE + .25));
  }
  private threatened(point: Point, paths: CarPath[]) { return paths.some(car => car.future.slice(1, 9).some((next, i) => pointSegment(point, car.future[i]!, next) < 8)); }
  private sidewalkPath(a: Point, b: Point) { const steps = Math.ceil(distance(a, b) / .6); for (let i = 0; i <= steps; i++) if (!isPedestrianSidewalk(mix(a, b, i / Math.max(1, steps)))) return false; return true; }
  private refuge(walker: Walker, paths: CarPath[], emergency: boolean): Refuge | null {
    let best: Refuge | null = null, cost = Infinity;
    for (const point of this.refuges) {
      const d = distance(walker, point); if (!emergency && (d < 2 || d > 15 || !this.sidewalkPath(walker, point))) continue;
      if (!this.clear(point, paths, emergency ? 8 : 10)) continue;
      const away = paths.reduce((sum, car) => sum + Math.min(20, distance(point, car.now)), 0) / Math.max(1, paths.length);
      const score = d - away * .16 + (point.route === walker.route ? 0 : .5);
      if (score < cost) { best = point; cost = score; }
    }
    return best;
  }
  private safety(walker: Walker, paths: CarPath[]) {
    if (this.clear(walker, paths)) { walker.hiddenSafety = false; return; }
    const refuge = this.refuge(walker, paths, true); walker.mode = 'running'; walker.calm = 1.2; walker.target = null;
    if (refuge) { this.emergencyRetreats++; walker.x = refuge.x; walker.z = refuge.z; walker.route = refuge.route; walker.segment = refuge.segment; walker.progress = refuge.progress; walker.hiddenSafety = false; }
    else walker.hiddenSafety = true;
  }
  private crossingRefuge(walker: Walker, paths: CarPath[]) {
    const route = this.routes[walker.route]!, a = route.points[walker.segment]!, next = (walker.segment + 1) % route.points.length, b = route.points[next]!;
    if (!a.crossingToNext || pointSegment(walker, a, b) > .4) return null;
    return [{ ...a, route: walker.route, segment: walker.segment, progress: 0 }, { ...b, route: walker.route, segment: next, progress: 0 }].filter(p => this.clear(p, paths, 4)).sort((a, b) => distance(a, walker) - distance(b, walker))[0] ?? null;
  }
  private alongCrossing(walker: Walker, next: Point) {
    const route = this.routes[walker.route]!, a = route.points[walker.segment]!, b = route.points[(walker.segment + 1) % route.points.length]!;
    return !!a.crossingToNext && pointSegment(walker, a, b) < .4 && pointSegment(next, a, b) < .4;
  }
  private crossClear(a: Point, b: Point, paths: CarPath[]) {
    for (let i = 0; i <= 16; i++) if (!this.clear(mix(a, b, i / 16), paths, 20)) return false; return true;
  }
  private step(walker: Walker, paths: CarPath[]) {
    const threat = this.threatened(walker, paths);
    if (threat) { walker.mode = 'running'; walker.calm = 1.2; if (!walker.target || !this.clear(walker.target, paths, 4)) walker.target = this.refuge(walker, paths, false) ?? this.crossingRefuge(walker, paths); }
    else walker.calm = Math.max(0, walker.calm - FIXED);
    if (walker.target) {
      const d = distance(walker, walker.target), t = Math.min(1, 7.4 * FIXED / Math.max(.001, d)), next = mix(walker, walker.target, t);
      if (this.sidewalkPath(walker, next) || this.alongCrossing(walker, next)) { walker.yaw = Math.atan2(next.x - walker.x, next.z - walker.z); walker.x = next.x; walker.z = next.z; walker.gait += FIXED * 15; }
      if (d < .2) { walker.route = walker.target.route; walker.segment = walker.target.segment; walker.progress = walker.target.progress; walker.target = null; }
    } else if (walker.calm <= 0) {
      const route = this.routes[walker.route]!, a = route.points[walker.segment]!, b = route.points[(walker.segment + 1) % route.points.length]!;
      const anchor = mix(a, b, walker.progress), rejoining = distance(walker, anchor);
      if (rejoining > .04 && isPedestrianSidewalk(walker)) {
        const next = mix(walker, anchor, Math.min(1, 1.35 * FIXED / rejoining));
        if (this.sidewalkPath(walker, next) && this.clear(next, paths, 8)) { walker.mode = 'walking'; walker.yaw = Math.atan2(next.x - walker.x, next.z - walker.z); walker.x = next.x; walker.z = next.z; walker.gait += FIXED * 6; }
      } else if (a.crossingToNext && walker.progress < .001 && !this.crossClear(a, b, paths)) walker.mode = 'waiting';
      else { walker.mode = 'walking'; walker.progress = Math.min(1, walker.progress + (a.crossingToNext ? 2.1 : 1.35) * FIXED / distance(a, b)); const next = mix(a, b, walker.progress); walker.yaw = Math.atan2(b.x - a.x, b.z - a.z); walker.x = next.x; walker.z = next.z; walker.gait += FIXED * 6; if (walker.progress >= 1) { walker.segment = (walker.segment + 1) % route.points.length; walker.progress = 0; } }
    }
    this.safety(walker, paths);
  }
  update(vehicles: readonly VehicleState[], dt: number) {
    if (this.disposed) return; const paths = this.paths(vehicles);
    this.accumulator += Math.max(0, Math.min(.25, Number.isFinite(dt) ? dt : 0));
    while (this.accumulator + 1e-9 >= FIXED) { for (const walker of this.walkers) this.step(walker, paths); this.accumulator -= FIXED; }
    for (const walker of this.walkers) this.safety(walker, paths);
    this.previous = new Map(vehicles.filter(v => v.status !== 'respawning').map(v => [v.entityId, { x: v.pose.x, z: v.pose.z }]));
  }
  getStates(): PedestrianState[] { return this.walkers.map(({ id, x, z, yaw, mode, hiddenSafety, gait }) => ({ id, x, z, yaw, mode, hiddenSafety, gait })); }
  getDiagnostics() { return { emergencyRetreats: this.emergencyRetreats }; }
  dispose() { this.disposed = true; this.walkers = []; this.previous.clear(); this.refuges = []; }
}
