import type { VehicleState } from '@fender/contracts';
import { DISTRICT_WATER, waterFootprint } from '@fender/content';
export interface SplashWheel { x: number; y: number; z: number; side: number }
export interface SplashCue { entityId: string; yaw: number; velocity: { x: number; z: number }; strength: number; wheels: SplashWheel[]; sound: boolean }
type Pose = VehicleState['pose'];
const zones = DISTRICT_WATER.map(site => ({ ...site, polygon: waterFootprint(site) }));
/** Exit fraction of a swept tire segment clipped to the actual convex water footprint. */
function wetContact(a: { x: number; z: number }, b: { x: number; z: number }, polygon: number[]): number | null {
  let enter = 0, exit = 1;
  for (let i = 0; i < polygon.length; i += 2) {
    const j = (i + 2) % polygon.length, x = polygon[i]!, z = polygon[i + 1]!, dx = polygon[j]! - x, dz = polygon[j + 1]! - z;
    const before = dx * (a.z - z) - dz * (a.x - x), after = dx * (b.z - z) - dz * (b.x - x);
    if (before < 0 && after < 0) return null;
    if (before < 0) enter = Math.max(enter, before / (before - after));
    if (after < 0) exit = Math.min(exit, before / (before - after));
    if (enter > exit) return null;
  }
  return exit;
}
function tire(pose: Pose, side: number, direction: number) {
  return { x: pose.x + Math.cos(pose.yaw) * side * .96 + Math.sin(pose.yaw) * direction * 1.32, z: pose.z - Math.sin(pose.yaw) * side * .96 + Math.cos(pose.yaw) * direction * 1.32 };
}
interface Previous { pose: Pose; life: number; distance: number; nextSpray: number; nextSound: number }
/** Presentation only: no authority events, collisions, grip changes or vehicle mutation. */
export class WaterCrossings {
  private previous = new Map<string, Previous>();
  private time = 0;
  update(vehicles: readonly VehicleState[], dt: number, frozen = false): SplashCue[] {
    if(frozen){this.reset();return [];}
    const delta = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0; this.time += delta;
    const cues: SplashCue[] = [], active = new Set<string>();
    for (const vehicle of vehicles.slice(0, 32)) {
      const { entityId, pose, discontinuityId: life } = vehicle;
      if (vehicle.status !== 'active') { this.previous.delete(entityId); continue; }
      active.add(entityId);
      const before = this.previous.get(entityId), distance = before ? Math.hypot(pose.x - before.pose.x, pose.z - before.pose.z) : 0;
      const state: Previous = { pose: { ...pose }, life, distance: (before?.distance ?? 0) + distance, nextSpray: before?.nextSpray ?? 0, nextSound: before?.nextSound ?? 0 };
      this.previous.set(entityId, state);
      if (!before || before.life !== life || distance > 12 || delta === 0) { state.distance = 0; continue; }
      const speed = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
      if (speed < 1.5 || distance < .005 || state.distance < .45 || this.time < state.nextSpray) continue;
      const direction = vehicle.velocity.x * Math.sin(pose.yaw) + vehicle.velocity.z * Math.cos(pose.yaw) < 0 ? -1 : 1;
      const wheels: SplashWheel[] = [];
      for (const side of [-1, 1]) {
        const a = tire(before.pose, side, direction), b = tire(pose, side, direction);
        for (const zone of zones) {
          const t = wetContact(a, b, zone.polygon); if (t === null) continue;
          wheels.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: zone.y, side }); break;
        }
      }
      if (!wheels.length) continue;
      const sound = this.time >= state.nextSound;
      cues.push({ entityId, yaw: pose.yaw, velocity: { x: vehicle.velocity.x, z: vehicle.velocity.z }, strength: Math.min(1, speed / 22), wheels, sound });
      state.distance = 0; state.nextSpray = this.time + .11; if (sound) state.nextSound = this.time + .38;
    }
    for (const id of this.previous.keys()) if (!active.has(id)) this.previous.delete(id);
    return cues;
  }
  reset(): void { this.previous.clear(); this.time = 0; }
}
