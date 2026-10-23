import type { BossTactics, DriverActions, PlanarPose, VehicleState } from '@fender/contracts';
import { clamp, wrapAngle } from '../physics/geometry.js';
export interface BossAiRuntime {
  targetId: string | null; attackKind: 'burst' | 'grenade' | null; windupUntilTick: number;
  nextAttackTick: number; burstRemaining: number; nextShotTick: number; nextGrenadeTick: number;
  styleStartedTick: number; attackOrdinal: number;
}
export interface BossDecision { actions: DriverActions; fire: boolean; grenadeTarget: PlanarPose | null }
export function newBossAi(tick: number): BossAiRuntime { return { targetId: null, attackKind: null, windupUntilTick: 0, nextAttackTick: 0, burstRemaining: 0, nextShotTick: 0, nextGrenadeTick: 0, styleStartedTick: tick, attackOrdinal: 0 }; }
export function stepBossAi(vehicle: VehicleState, base: DriverActions, officers: readonly VehicleState[], runtime: BossAiRuntime, tactics: BossTactics, tick: number, speedLimit: number, blocked: (start: PlanarPose, end: PlanarPose) => boolean): BossDecision {
  const result: BossDecision = { actions: { ...base, fire: false }, fire: false, grenadeTarget: null };
  const targets = vehicle.status !== 'active' || vehicle.protectedUntilTick > tick ? [] : officers.filter(officer => officer.playerId !== null && officer.status === 'active' && officer.protectedUntilTick <= tick
    && Math.hypot(officer.pose.x - vehicle.pose.x, officer.pose.z - vehicle.pose.z) <= tactics.engageRange && !blocked(vehicle.pose, officer.pose));
  targets.sort((a, b) => Math.hypot(a.pose.x - vehicle.pose.x, a.pose.z - vehicle.pose.z) - Math.hypot(b.pose.x - vehicle.pose.x, b.pose.z - vehicle.pose.z) || (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
  const target = targets[0];
  if (!target) { runtime.targetId = null; runtime.attackKind = null; runtime.burstRemaining = 0; return result; }
  if (runtime.targetId !== target.entityId) { runtime.targetId = target.entityId; runtime.attackKind = null; runtime.burstRemaining = 0; }
  const dx = target.pose.x - vehicle.pose.x, dz = target.pose.z - vehicle.pose.z;
  const angle = wrapAngle(Math.atan2(dx, dz) - vehicle.pose.yaw), speed = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
  const forward = dx * Math.sin(vehicle.pose.yaw) + dz * Math.cos(vehicle.pose.yaw);
  const cycle = tick - runtime.styleStartedTick;
  switch (tactics.drivingStyle) {
    case 'runner': {
      const side = dx * Math.cos(vehicle.pose.yaw) - dz * Math.sin(vehicle.pose.yaw);
      result.actions.steer = clamp(base.steer - Math.sign(side) * tactics.weaveAmplitude * .4, -1, 1); break;
    }
    case 'brake-check':
      if (forward < 0 && Math.hypot(dx, dz) < 22 && cycle % tactics.weavePeriodTicks < 90) { result.actions.throttle = 0; result.actions.brakeReverse = 0; result.actions.handbrake = true; }
      else result.actions.steer = clamp(base.steer + (Math.abs(angle) < Math.PI / 2 ? angle * .5 : 0), -1, 1);
      break;
    case 'weaver': result.actions.steer = clamp(base.steer + Math.sin(cycle * Math.PI * 2 / tactics.weavePeriodTicks) * tactics.weaveAmplitude, -1, 1); break;
    case 'interceptor': {
      const lead = { x: target.pose.x + target.velocity.x * .6, z: target.pose.z + target.velocity.z * .6 };
      result.actions.steer = clamp(wrapAngle(Math.atan2(lead.x - vehicle.pose.x, lead.z - vehicle.pose.z) - vehicle.pose.yaw) * 1.8, -1, 1);
      result.actions.throttle = .85; break;
    }
  }
  if (speed >= Math.min(tactics.cruiseSpeed, speedLimit)) result.actions.throttle = 0;
  if (runtime.attackOrdinal && runtime.attackKind === null && tick < runtime.nextAttackTick) result.actions.throttle *= .45;
  if (!runtime.attackKind && tick >= runtime.nextAttackTick) {
    runtime.attackKind = tactics.weapon === 'grenades' || tactics.weapon === 'mixed' && runtime.attackOrdinal % 2 === 1 && tick >= runtime.nextGrenadeTick ? 'grenade' : 'burst';
    runtime.attackOrdinal++; runtime.windupUntilTick = tick + tactics.windupTicks; runtime.burstRemaining = tactics.burstShots; runtime.nextShotTick = runtime.windupUntilTick;
  }
  if (!runtime.attackKind || tick < runtime.windupUntilTick) return result;
  const recover = () => { runtime.attackKind = null; runtime.burstRemaining = 0; runtime.nextAttackTick = tick + tactics.burstRecoveryTicks; };
  if (runtime.attackKind === 'grenade') {
    if (tick >= runtime.nextGrenadeTick) { result.grenadeTarget = { ...target.pose }; runtime.nextGrenadeTick = tick + tactics.grenadeCooldownTicks; }
    recover();
  } else if (tick >= runtime.nextShotTick && Math.abs(angle) <= Math.PI / 30) {
    result.fire = true; runtime.burstRemaining--; runtime.nextShotTick = tick + tactics.burstIntervalTicks;
    if (!runtime.burstRemaining) recover();
  } else if (tick > runtime.windupUntilTick + 120) recover();
  return result;
}
