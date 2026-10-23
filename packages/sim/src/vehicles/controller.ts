import type { CollisionMap, DriverActions, DriverRuntimeState, VehicleState } from '@fender/contracts';
import { FIXED_DELTA, normalizeGameplay, type SimulationConfig } from '../core/config.js';
import { box, clamp, nearPolygon, overlap, pointInPolygon, wrapAngle, HALF_LENGTH, HALF_WIDTH, type Point } from '../physics/geometry.js';
import { tuningForVehicle } from './profiles.js';

export const neutralActions = (): DriverActions => ({ steer: 0, throttle: 0, brakeReverse: 0, handbrake: false, fire: false, sirenToggle: false, recover: false });
export const newDriver = (): DriverRuntimeState => ({ resolvedSteering: 0, reverseHoldTicks: 0, nextFireTick: 0, shotOrdinal: 0, nextRecoveryTick: 0, lastDamageTick: null });

export function surfaceAt(map: CollisionMap, pose: Point): 'asphalt' | 'dirt' | 'grass' {
  for (const zone of [...map.surfaces].reverse()) {
    const polygon: Point[] = [];
    for (let i = 0; i < zone.polygonXZ.length; i += 2) polygon.push({ x: zone.polygonXZ[i]!, z: zone.polygonXZ[i + 1]! });
    if (pointInPolygon(pose, polygon)) return zone.surface;
  }
  return 'asphalt';
}

export function driveVehicle(vehicle: VehicleState, driver: DriverRuntimeState, actions: DriverActions, map: CollisionMap, solids: Point[][], config: SimulationConfig = normalizeGameplay()): void {
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
  if (actions.handbrake) forward -= Math.sign(forward) * Math.min(Math.abs(forward), tune.handbrakeDecel * dt);
  forward *= Math.exp(-tune.drag * dt);
  forward = clamp(forward, -tune.reverseSpeed, tune.maxSpeed * (surface === 'grass' ? 0.65 : 1));
  // Steering lock shrinks with speed so full stick is usable on the highway.
  const delta = driver.resolvedSteering * tune.steerLock / (1 + Math.abs(forward) / tune.steerLockFalloff);
  const a = tune.cgToFront, b = tune.cgToRear, floor = tune.slipSpeedFloor;
  let omega = vehicle.velocity.yawRate;
  // Tyre slip angles in each tyre's own frame; the speed floor keeps crawling stable.
  const frontLat = (side + omega * a) * Math.cos(delta) - forward * Math.sin(delta);
  const frontLong = (side + omega * a) * Math.sin(delta) + forward * Math.cos(delta);
  const slipFront = Math.atan2(frontLat, Math.max(Math.abs(frontLong), floor));
  const slipRear = Math.atan2(side - omega * b, Math.max(Math.abs(forward), floor));
  // Rear grip drops under power or handbrake; that is what starts and feeds a drift. Power-over scales with lock so a
  // gentle fast corner keeps grip while full lock plus throttle breaks the rear loose.
  const frontCap = tune.frontGrip * gripScale;
  const powerLoss = tune.throttleGripLoss * actions.throttle * (0.5 + 0.5 * Math.abs(driver.resolvedSteering));
  const rearCap = (actions.handbrake ? tune.handbrakeGrip : tune.rearGrip * (1 - powerLoss)) * gripScale;
  const frontForce = clamp(-tune.corneringStiffness * slipFront, -frontCap, frontCap) * Math.cos(delta);
  const rearForce = clamp(-tune.corneringStiffness * slipRear, -rearCap, rearCap);
  // Physics alone makes a counter-steered drift a knife edge, so once the rear is well past its grip the yaw is servoed toward
  // a drift angle set by the stick: centred or into the turn holds driftAngle, counter-steer trims it down to straight.
  const saturation = rearCap / tune.corneringStiffness, rearSlip = Math.abs(slipRear);
  const drifting = clamp((rearSlip - tune.driftEntryAngle) / tune.driftEntryWidth, 0, 1) * clamp(rearSlip / saturation - 1, 0, 1);
  const speed = Math.hypot(forward, side), slipAngle = Math.atan2(side, Math.abs(forward)) * Math.sign(forward || 1);
  const pathRate = speed > floor ? (frontForce + rearForce) * Math.cos(slipAngle) / speed * Math.sign(forward || 1) : 0;
  const into = -Math.sign(slipAngle), targetAngle = -into * tune.driftAngle * clamp(1 + driver.resolvedSteering * into, 0, 1);
  const driftRate = pathRate - tune.driftSteerGain * clamp(targetAngle - slipAngle, -tune.driftSteerWindow, tune.driftSteerWindow);
  const physicalRate = omega + (frontForce * a - rearForce * b) / tune.yawInertia * dt;
  const damped = physicalRate * Math.exp(-tune.yawDamping * Math.max(Math.abs(forward), floor) / 20 * dt);
  const servoed = omega + (driftRate - omega) * Math.min(1, tune.driftServoRate * dt);
  omega = damped + (servoed - damped) * drifting;
  // Below kinematicBlendSpeed the nose simply follows the wheels, so parking and reversing stay crisp.
  const crawl = clamp(1 - Math.abs(forward) / tune.kinematicBlendSpeed, 0, 1);
  omega += (forward * Math.tan(delta) / (a + b) - omega) * crawl;
  side += (frontForce + rearForce) * dt;
  side *= 1 - crawl * 0.5;
  // Rotate the velocity into the new heading frame; momentum keeps pointing where it was.
  const turn = omega * dt, rotatedForward = forward * Math.cos(turn) + side * Math.sin(turn), rotatedSide = side * Math.cos(turn) - forward * Math.sin(turn);
  forward = rotatedForward; side = rotatedSide;
  const cap = tune.maxSpeed * (surface === 'grass' ? 0.65 : 1), finalSpeed = Math.hypot(forward, side);
  if (finalSpeed > cap) { forward *= cap / finalSpeed; side *= cap / finalSpeed; }
  vehicle.velocity.yawRate = omega;
  vehicle.pose.yaw = wrapAngle(vehicle.pose.yaw + turn);
  vehicle.velocity.x = Math.sin(vehicle.pose.yaw) * forward + Math.cos(vehicle.pose.yaw) * side;
  vehicle.velocity.z = Math.cos(vehicle.pose.yaw) * forward - Math.sin(vehicle.pose.yaw) * side;
  // Two bounded substeps keep movement below the thinnest authored curb.
  for (let substep = 0; substep < 2; substep++) {
    vehicle.pose.x += vehicle.velocity.x * dt / 2;
    vehicle.pose.z += vehicle.velocity.z * dt / 2;
    resolveStatic(vehicle, map, solids);
  }
}

export function resolveStatic(vehicle: VehicleState, map: CollisionMap, solids: Point[][]): void {
  for (let pass = 0; pass < 3; pass++) {
    for (const solid of solids) {
      if (!nearPolygon(vehicle.pose, solid)) continue;
      const push = overlap(box(vehicle.pose), solid);
      if (!push) continue;
      const length = Math.hypot(push.x, push.z), nx = push.x / length, nz = push.z / length;
      vehicle.pose.x += push.x + nx * 0.001; vehicle.pose.z += push.z + nz * 0.001;
      const inward = vehicle.velocity.x * nx + vehicle.velocity.z * nz;
      if (inward < 0) { vehicle.velocity.x -= inward * nx * 1.1; vehicle.velocity.z -= inward * nz * 1.1; }
    }
    const s = Math.abs(Math.sin(vehicle.pose.yaw)), c = Math.abs(Math.cos(vehicle.pose.yaw));
    const hx = c * HALF_WIDTH + s * HALF_LENGTH, hz = s * HALF_WIDTH + c * HALF_LENGTH;
    const x = clamp(vehicle.pose.x, map.bounds.minX + hx, map.bounds.maxX - hx), z = clamp(vehicle.pose.z, map.bounds.minZ + hz, map.bounds.maxZ - hz);
    if (x !== vehicle.pose.x) vehicle.velocity.x = 0;
    if (z !== vehicle.pose.z) vehicle.velocity.z = 0;
    vehicle.pose.x = x; vehicle.pose.z = z;
  }
}

export function resolveVehicleContacts(vehicles: VehicleState[], map: CollisionMap, solids: Point[][]): void {
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
        const impulse = Math.min(8, -relative * 0.55);
        a.velocity.x += nx * impulse; a.velocity.z += nz * impulse; b.velocity.x -= nx * impulse; b.velocity.z -= nz * impulse;
      }
      resolveStatic(a, map, solids); resolveStatic(b, map, solids);
    }
  }
}
