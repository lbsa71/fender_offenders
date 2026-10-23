import type { CollisionMap, DriverActions, DriverRuntimeState, VehicleState } from '@fender/contracts';
import { FIXED_DELTA, normalizeGameplay, type SimulationConfig } from '../core/config.js';
import { box, clamp, nearPolygon, overlap, pointInPolygon, wrapAngle, HALF_LENGTH, HALF_WIDTH, type Point } from '../physics/geometry.js';
import { tuningForVehicle } from './profiles.js';

export const neutralActions = (): DriverActions => ({ steer: 0, throttle: 0, brakeReverse: 0, handbrake: false, fire: false, sirenToggle: false, recover: false });
export const newDriver = (): DriverRuntimeState => ({ resolvedSteering: 0, reverseHoldTicks: 0, nextFireTick: 0, shotOrdinal: 0, nextRecoveryTick: 0, lastDamageTick: null });
export interface ContactImpact { vehicleId: string; normal: { x: number; z: number }; speed: number }
export type ImpactObserver = (impact: ContactImpact) => void;

export function surfaceAt(map: CollisionMap, pose: Point): 'asphalt' | 'dirt' | 'grass' {
  for (const zone of [...map.surfaces].reverse()) {
    const polygon: Point[] = [];
    for (let i = 0; i < zone.polygonXZ.length; i += 2) polygon.push({ x: zone.polygonXZ[i]!, z: zone.polygonXZ[i + 1]! });
    if (pointInPolygon(pose, polygon)) return zone.surface;
  }
  return 'asphalt';
}

export function driveVehicle(vehicle: VehicleState, driver: DriverRuntimeState, actions: DriverActions, map: CollisionMap, solids: Point[][], config: SimulationConfig = normalizeGameplay(), onImpact?: ImpactObserver): void {
  if (vehicle.status !== 'active') return;
  const tune = tuningForVehicle(config, vehicle), dt = FIXED_DELTA;
  driver.resolvedSteering += clamp(actions.steer - driver.resolvedSteering, -tune.steeringResponse * dt, tune.steeringResponse * dt);
  const fx = Math.sin(vehicle.pose.yaw), fz = Math.cos(vehicle.pose.yaw), rx = fz, rz = -fx;
  let forward = vehicle.velocity.x * fx + vehicle.velocity.z * fz;
  let side = vehicle.velocity.x * rx + vehicle.velocity.z * rz;
  const surface = surfaceAt(map, vehicle.pose), gripScale = surface === 'dirt' ? 0.62 : surface === 'grass' ? 0.42 : 1;
  if (actions.brakeReverse > 0.05) {
    if (forward > 0.5) { forward = Math.max(0, forward - tune.braking * actions.brakeReverse * dt); driver.reverseHoldTicks = 0; }
    else { driver.reverseHoldTicks++; if (driver.reverseHoldTicks >= tune.reverseHoldTicks) forward -= tune.reverseAcceleration * actions.brakeReverse * dt; }
  } else { driver.reverseHoldTicks = 0; forward += tune.acceleration * actions.throttle * dt; }
  if (actions.handbrake) forward *= Math.exp(-1.6 * dt);
  forward *= Math.exp(-tune.drag * dt);
  forward = clamp(forward, -tune.reverseSpeed, tune.maxSpeed * (surface === 'grass' ? 0.65 : 1));
  side *= Math.exp(-(actions.handbrake ? tune.driftGrip : tune.grip) * gripScale * dt);
  vehicle.velocity.yawRate = driver.resolvedSteering * tune.steeringRate * Math.min(1, Math.abs(forward) / 5) * Math.sign(forward) / (1 + Math.abs(forward) / 35);
  vehicle.pose.yaw = wrapAngle(vehicle.pose.yaw + vehicle.velocity.yawRate * dt);
  vehicle.velocity.x = Math.sin(vehicle.pose.yaw) * forward + Math.cos(vehicle.pose.yaw) * side;
  vehicle.velocity.z = Math.cos(vehicle.pose.yaw) * forward - Math.sin(vehicle.pose.yaw) * side;
  // Two bounded substeps keep movement below the thinnest authored curb.
  for (let substep = 0; substep < 2; substep++) {
    vehicle.pose.x += vehicle.velocity.x * dt / 2;
    vehicle.pose.z += vehicle.velocity.z * dt / 2;
    resolveStatic(vehicle, map, solids, onImpact);
  }
}

export function resolveStatic(vehicle: VehicleState, map: CollisionMap, solids: Point[][], onImpact?: ImpactObserver): void {
  for (let pass = 0; pass < 3; pass++) {
    for (const solid of solids) {
      if (!nearPolygon(vehicle.pose, solid)) continue;
      const push = overlap(box(vehicle.pose), solid);
      if (!push) continue;
      const length = Math.hypot(push.x, push.z), nx = push.x / length, nz = push.z / length;
      vehicle.pose.x += push.x + nx * 0.001; vehicle.pose.z += push.z + nz * 0.001;
      const inward = vehicle.velocity.x * nx + vehicle.velocity.z * nz;
      if (inward < 0) { onImpact?.({ vehicleId: vehicle.entityId, normal: { x: nx, z: nz }, speed: -inward }); vehicle.velocity.x -= inward * nx * 1.1; vehicle.velocity.z -= inward * nz * 1.1; }
    }
    const s = Math.abs(Math.sin(vehicle.pose.yaw)), c = Math.abs(Math.cos(vehicle.pose.yaw));
    const hx = c * HALF_WIDTH + s * HALF_LENGTH, hz = s * HALF_WIDTH + c * HALF_LENGTH;
    const x = clamp(vehicle.pose.x, map.bounds.minX + hx, map.bounds.maxX - hx), z = clamp(vehicle.pose.z, map.bounds.minZ + hz, map.bounds.maxZ - hz);
    if (x !== vehicle.pose.x) { const nx = Math.sign(x - vehicle.pose.x); if (vehicle.velocity.x * nx < 0) onImpact?.({ vehicleId: vehicle.entityId, normal: { x: nx, z: 0 }, speed: Math.abs(vehicle.velocity.x) }); vehicle.velocity.x = 0; }
    if (z !== vehicle.pose.z) { const nz = Math.sign(z - vehicle.pose.z); if (vehicle.velocity.z * nz < 0) onImpact?.({ vehicleId: vehicle.entityId, normal: { x: 0, z: nz }, speed: Math.abs(vehicle.velocity.z) }); vehicle.velocity.z = 0; }
    vehicle.pose.x = x; vehicle.pose.z = z;
  }
}

export function resolveVehicleContacts(vehicles: VehicleState[], map: CollisionMap, solids: Point[][], onImpact?: ImpactObserver): void {
  const active = vehicles.filter(v => v.status === 'active');
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!, b = active[j]!;
      if (Math.abs(a.pose.x - b.pose.x) > 5 || Math.abs(a.pose.z - b.pose.z) > 5) continue;
      const push = overlap(box(a.pose), box(b.pose));
      if (!push) continue;
      const len = Math.hypot(push.x, push.z), nx = push.x / len, nz = push.z / len;
      a.pose.x += push.x / 2; a.pose.z += push.z / 2; b.pose.x -= push.x / 2; b.pose.z -= push.z / 2;
      const relative = (a.velocity.x - b.velocity.x) * nx + (a.velocity.z - b.velocity.z) * nz;
      if (relative < 0) {
        onImpact?.({ vehicleId: a.entityId, normal: { x: nx, z: nz }, speed: -relative });
        onImpact?.({ vehicleId: b.entityId, normal: { x: -nx || 0, z: -nz || 0 }, speed: -relative });
        const impulse = Math.min(8, -relative * 0.55);
        a.velocity.x += nx * impulse; a.velocity.z += nz * impulse; b.velocity.x -= nx * impulse; b.velocity.z -= nz * impulse;
      }
      resolveStatic(a, map, solids, onImpact); resolveStatic(b, map, solids, onImpact);
    }
  }
}
