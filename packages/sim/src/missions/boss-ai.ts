import type { BossTactics, DriverActions, PlanarPose, VehicleState } from '@fender/contracts';
import { clamp, wrapAngle } from '../physics/geometry.js';
export interface BossAiRuntime {
  targetId: string | null; attackKind: 'burst' | 'grenade' | null; windupUntilTick: number;
  nextAttackTick: number; burstRemaining: number; nextShotTick: number; nextGrenadeTick: number;
  styleStartedTick: number; attackOrdinal: number; evasionTargetId: string | null;
  brakeCheckUntilTick: number | null; breakawayUntilTick: number; nextBrakeCheckTick: number;
  nextGadgetTick?: number;
}
export interface BossDecision { actions: DriverActions; fire: boolean; grenadeTarget: PlanarPose | null }
export function newBossAi(tick: number): BossAiRuntime { return { targetId: null, attackKind: null, windupUntilTick: 0, nextAttackTick: 0, burstRemaining: 0, nextShotTick: 0, nextGrenadeTick: 0, styleStartedTick: tick, attackOrdinal: 0, evasionTargetId: null, brakeCheckUntilTick: null, breakawayUntilTick: 0, nextBrakeCheckTick: tick }; }

function applyBrakeCheck(vehicle: VehicleState, base: DriverActions, actions: DriverActions, runtime: BossAiRuntime, tactics: BossTactics, tick: number, speedLimit: number, pursuer: boolean): void {
  if (tactics.drivingStyle !== 'brake-check') return;
  if (vehicle.status !== 'active' || vehicle.protectedUntilTick > tick) {
    runtime.brakeCheckUntilTick = null; runtime.breakawayUntilTick = 0; return;
  }
  if (runtime.brakeCheckUntilTick !== null && (!pursuer || tick >= runtime.brakeCheckUntilTick)) {
    runtime.brakeCheckUntilTick = null;
    runtime.breakawayUntilTick = tick + 60;
    runtime.nextBrakeCheckTick = runtime.breakawayUntilTick + 360;
  }
  if (runtime.brakeCheckUntilTick === null && tick >= runtime.breakawayUntilTick && pursuer && tick >= runtime.nextBrakeCheckTick) runtime.brakeCheckUntilTick = tick + 30;
  if (runtime.brakeCheckUntilTick !== null) {
    const forward = vehicle.velocity.x * Math.sin(vehicle.pose.yaw) + vehicle.velocity.z * Math.cos(vehicle.pose.yaw);
    actions.throttle = 0; actions.brakeReverse = forward > .5 ? 1 : 0; actions.handbrake = true;
  } else if (tick < runtime.breakawayUntilTick) {
    // Full pedal, ordinary engine and speed ceiling. Route braking still wins,
    // and an officer cutting in front retains the normal collision/arrest rules.
    const speed = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
    actions.handbrake = base.handbrake; actions.brakeReverse = base.brakeReverse;
    actions.throttle = !base.handbrake && base.brakeReverse <= .05 && speed < Math.min(tactics.cruiseSpeed, speedLimit) ? 1 : 0;
  }
}

export function stepBossAi(vehicle: VehicleState, base: DriverActions, officers: readonly VehicleState[], runtime: BossAiRuntime, tactics: BossTactics, tick: number, speedLimit: number, blocked: (start: PlanarPose, end: PlanarPose) => boolean): BossDecision {
  const result: BossDecision = { actions: { ...base, fire: false }, fire: false, grenadeTarget: null };
  const targets = vehicle.status !== 'active' || vehicle.protectedUntilTick > tick ? [] : officers.filter(officer => officer.playerId !== null && officer.status === 'active' && officer.protectedUntilTick <= tick
    && Math.hypot(officer.pose.x - vehicle.pose.x, officer.pose.z - vehicle.pose.z) <= tactics.engageRange && !blocked(vehicle.pose, officer.pose));
  targets.sort((a, b) => Math.hypot(a.pose.x - vehicle.pose.x, a.pose.z - vehicle.pose.z) - Math.hypot(b.pose.x - vehicle.pose.x, b.pose.z - vehicle.pose.z) || (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
  const target = targets[0];
  // Weapon targets and driving threats are independent: a nearer officer ahead
  // must not conceal a second officer gaining on the suspect from behind.
  const pursuer = targets.find(officer => {
    const x = officer.pose.x - vehicle.pose.x, z = officer.pose.z - vehicle.pose.z, distance = Math.hypot(x, z);
    const closingSpeed = -(x * (officer.velocity.x - vehicle.velocity.x) + z * (officer.velocity.z - vehicle.velocity.z)) / Math.max(.001, distance);
    if (distance >= 22 || closingSpeed <= .5) return false;
    const behind = x * Math.sin(vehicle.pose.yaw) + z * Math.cos(vehicle.pose.yaw);
    const side = x * Math.cos(vehicle.pose.yaw) - z * Math.sin(vehicle.pose.yaw);
    return tactics.drivingStyle !== 'brake-check' || behind < -2 && Math.abs(side) < 6;
  });
  const evasionTargetId = pursuer?.entityId ?? null;
  if (runtime.evasionTargetId !== evasionTargetId) { runtime.evasionTargetId = evasionTargetId; runtime.styleStartedTick = tick; }
  if (!target) {
    runtime.targetId = null; runtime.attackKind = null; runtime.burstRemaining = 0;
    applyBrakeCheck(vehicle, base, result.actions, runtime, tactics, tick, speedLimit, false); return result;
  }
  if (runtime.targetId !== target.entityId) { runtime.targetId = target.entityId; runtime.attackKind = null; runtime.burstRemaining = 0; }
  const dx = target.pose.x - vehicle.pose.x, dz = target.pose.z - vehicle.pose.z;
  const angle = wrapAngle(Math.atan2(dx, dz) - vehicle.pose.yaw), speed = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
  const cycle = tick - runtime.styleStartedTick;
  switch (tactics.drivingStyle) {
    case 'runner': {
      if (pursuer) {
        const side = (pursuer.pose.x - vehicle.pose.x) * Math.cos(vehicle.pose.yaw) - (pursuer.pose.z - vehicle.pose.z) * Math.sin(vehicle.pose.yaw);
        result.actions.steer = clamp(base.steer - Math.sign(side) * tactics.weaveAmplitude * .4, -1, 1);
      }
      break;
    }
    case 'brake-check':
      // Applied after weapon recovery so the brief escape gets full throttle.
      break;
    case 'weaver':
      if (pursuer) result.actions.steer = clamp(base.steer + Math.cos(cycle * Math.PI * 2 / tactics.weavePeriodTicks) * tactics.weaveAmplitude * 2, -1, 1);
      break;
    case 'interceptor': {
      const lead = { x: target.pose.x + target.velocity.x * .6, z: target.pose.z + target.velocity.z * .6 };
      result.actions.steer = clamp(wrapAngle(Math.atan2(lead.x - vehicle.pose.x, lead.z - vehicle.pose.z) - vehicle.pose.yaw) * 1.8, -1, 1);
      result.actions.throttle = .85; break;
    }
  }
  if (speed >= Math.min(tactics.cruiseSpeed, speedLimit)) result.actions.throttle = 0;
  if (runtime.attackOrdinal && runtime.attackKind === null && tick < runtime.nextAttackTick) result.actions.throttle *= .45;
  applyBrakeCheck(vehicle, base, result.actions, runtime, tactics, tick, speedLimit, !!pursuer);
  if (tactics.weapon === 'none') { runtime.attackKind = null; runtime.burstRemaining = 0; return result; }
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
