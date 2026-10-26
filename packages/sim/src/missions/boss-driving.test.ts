import { expect, it } from 'vitest';
import { getBossTactics, neutralActions, type CollisionMap, type VehicleState } from '@fender/contracts';
import { newBossAi, stepBossAi } from './boss-ai.js';
import { driveVehicle, newDriver } from '../vehicles/controller.js';

const car = (id: string, playerId: string | null, z: number, speed: number): VehicleState => ({
  entityId: id, playerId, bodyAssetId: 'patrol', pose: { x: 0, z, yaw: 0 }, velocity: { x: 0, z: speed, yawRate: 0 },
  health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0,
});
const base = { ...neutralActions(), throttle: .65 };
const stages = [1, 4, 7];
const arena: CollisionMap = { id: 'evasion', revision: 'evasion-1', bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, colliders: [], surfaces: [], spawns: [], laneNodes: [], laneEdges: [] };

for (const stage of stages) {
  it.each([
    ['distant', -23, 18, 12], ['matching speed', -14, 12, 12], ['falling behind', -14, 8, 12],
    ['both parked', -14, 0, 0], ['slower despite driving fast', -14, 18, 22],
  ] as const)(`dispatch ${stage + 1} does not swerve or brake-check an officer who is %s`, (_context, gap, officerSpeed, suspectSpeed) => {
    const suspect = car('suspect', null, 0, suspectSpeed), officer = car('officer', 'player', gap, officerSpeed);
    const decision = stepBossAi(suspect, base, [officer], newBossAi(0), getBossTactics(stage), 40, 28, () => false);
    expect(decision.actions.steer).toBe(0);
    expect(decision.actions.handbrake).toBe(false);
    expect(decision.actions.brakeReverse).toBe(0);
  });
  it(`dispatch ${stage + 1} reacts immediately when an officer starts closing, independent of the old idle rhythm`, () => {
    const suspect = car('suspect', null, 0, 12), officer = car('officer', 'player', -14, 12), runtime = newBossAi(0);
    stepBossAi(suspect, base, [officer], runtime, getBossTactics(stage), 10000, 28, () => false);
    officer.velocity.z = 18;
    const active = stepBossAi(suspect, base, [officer], runtime, getBossTactics(stage), 10001, 28, () => false);
    if (stage === 1) { expect(active.actions.brakeReverse).toBe(1); expect(active.actions.throttle).toBe(0); }
    else expect(Math.abs(active.actions.steer)).toBeGreaterThanOrEqual(.95);
    officer.velocity.z = 12;
    const calm = stepBossAi(suspect, base, [officer], runtime, getBossTactics(stage), 10002, 28, () => false);
    expect(calm.actions.steer).toBe(0); expect(calm.actions.handbrake).toBe(false); expect(calm.actions.brakeReverse).toBe(0);
  });
}

it.each([1, 4])('dispatch %s responds to a closing second officer even when the nearest weapon target is not closing', stage => {
  const suspect = car('suspect', null, 0, 12), near = car('near', 'one', 10, 12), closing = car('closing', 'two', -14, 18);
  const decision = stepBossAi(suspect, base, [near, closing], newBossAi(0), getBossTactics(stage), 1, 28, () => false);
  if (stage === 1) expect(decision.actions.brakeReverse).toBe(1);
  else expect(Math.abs(decision.actions.steer)).toBeGreaterThanOrEqual(.95);
});

it('brake-checks only a closing officer behind the car, not one ahead or far alongside', () => {
  const suspect = car('suspect', null, 0, 12);
  for (const officer of [car('ahead', 'player', 14, 0), { ...car('side', 'player', -2, 18), pose: { x: 12, z: -2, yaw: 0 } }]) {
    const decision = stepBossAi(suspect, base, [officer], newBossAi(0), getBossTactics(1), 1, 28, () => false);
    expect(decision.actions.handbrake).toBe(false); expect(decision.actions.brakeReverse).toBe(0);
  }
});

it.each([0, Math.PI / 2, -Math.PI / 2])('detects a real closing pursuit in world coordinates at yaw %s', yaw => {
  const suspect = car('suspect', null, 0, 12), officer = car('officer', 'player', -14, 18);
  suspect.pose.yaw = yaw; suspect.velocity = { x: Math.sin(yaw) * 12, z: Math.cos(yaw) * 12, yawRate: 0 };
  officer.pose = { x: -Math.sin(yaw) * 14, z: -Math.cos(yaw) * 14, yaw };
  officer.velocity = { x: Math.sin(yaw) * 18, z: Math.cos(yaw) * 18, yawRate: 0 };
  const decision = stepBossAi(suspect, base, [officer], newBossAi(0), getBossTactics(1), 1, 28, () => false);
  expect(decision.actions.brakeReverse).toBe(1);
});

it('makes a clearly visible lateral swerve through the real vehicle controller', () => {
  const suspect = car('suspect', null, 0, 12), officer = car('officer', 'player', -14, 18), runtime = newBossAi(0), driver = newDriver();
  for (let tick = 1; tick <= 45; tick++) {
    officer.pose = { x: suspect.pose.x, z: suspect.pose.z - 14, yaw: 0 };
    officer.velocity = { ...suspect.velocity, z: suspect.velocity.z + 6 };
    const decision = stepBossAi(suspect, base, [officer], runtime, getBossTactics(4), tick, 28, () => false);
    driveVehicle(suspect, driver, decision.actions, arena, []);
  }
  expect(Math.abs(suspect.pose.x), 'lateral displacement after 0.75 seconds').toBeGreaterThan(1.5);
});

it('brakes decisively through the real controller without accidentally reversing while holding the check', () => {
  const suspect = car('suspect', null, 0, 12), officer = car('officer', 'player', -14, 18), runtime = newBossAi(0), driver = newDriver();
  for (let tick = 1; tick <= 90; tick++) {
    officer.pose.z = suspect.pose.z - 14; officer.velocity.z = suspect.velocity.z + 6;
    const decision = stepBossAi(suspect, base, [officer], runtime, getBossTactics(1), tick, 28, () => false);
    driveVehicle(suspect, driver, decision.actions, arena, []);
    expect(suspect.velocity.z).toBeGreaterThanOrEqual(0);
    if (tick === 30) expect(suspect.velocity.z, 'speed after half a second of a brake check').toBeLessThan(2);
  }
});

it.each([1, 6])('dispatch %s follows a half-second brake check with one second of full throttle and a six-second cooldown', stage => {
  const suspect = car('suspect', null, 0, 3), officer = car('officer', 'player', -14, 9), runtime = newBossAi(0);
  const decide = (tick: number) => stepBossAi(suspect, base, [officer], runtime, getBossTactics(stage), tick, 28, () => false).actions;
  expect(decide(1).handbrake).toBe(true);
  expect(decide(30).handbrake).toBe(true);
  for (const tick of [31, 60, 90]) {
    const actions = decide(tick); expect(actions.throttle).toBe(1); expect(actions.handbrake).toBe(false); expect(actions.brakeReverse).toBe(0);
  }
  for (const tick of [91, 180, 300, 450]) { const actions = decide(tick); expect(actions.handbrake).toBe(false); expect(actions.brakeReverse).toBe(0); expect(actions.throttle).toBeLessThan(1); }
  expect(decide(451).handbrake).toBe(true);
});

it.each(['ahead', 'matched', 'gone'] as const)('releases the brakes and commits to a short breakaway when the officer is %s', situation => {
  const suspect = car('suspect', null, 0, 3), officer = car('officer', 'player', -14, 9), runtime = newBossAi(0);
  const decide = (tick: number, officers = [officer]) => stepBossAi(suspect, base, officers, runtime, getBossTactics(1), tick, 28, () => false).actions;
  expect(decide(1).handbrake).toBe(true);
  if (situation === 'ahead') officer.pose.z = 6;
  if (situation === 'matched') officer.velocity.z = 3;
  const officers = situation === 'gone' ? [] : [officer];
  for (const tick of [10, 40, 69]) { const actions = decide(tick, officers); expect(actions.throttle).toBe(1); expect(actions.handbrake).toBe(false); }
  expect(decide(70, officers).throttle).toBeLessThan(1);
});

it('keeps the breakaway strong through weapon recovery while respecting lane speed and route braking', () => {
  const suspect = car('suspect', null, 0, 3), officer = car('officer', 'player', -14, 9), runtime = newBossAi(0), tactics = getBossTactics(1);
  const decide = (tick: number, actions = base, limit = 28) => stepBossAi(suspect, actions, [officer], runtime, tactics, tick, limit, () => false).actions;
  decide(1); runtime.attackOrdinal = 1; runtime.attackKind = null; runtime.nextAttackTick = 999;
  expect(decide(31).throttle).toBe(1);
  suspect.velocity.z = tactics.cruiseSpeed; expect(decide(32).throttle).toBe(0);
  suspect.velocity.z = 7; expect(decide(33, base, 7).throttle).toBe(0);
  suspect.velocity.z = 3;
  const turning = decide(34, { ...base, steer: -.6, brakeReverse: .5 });
  expect(turning.steer).toBe(-.6); expect(turning.brakeReverse).toBe(.5); expect(turning.throttle).toBe(0);
});

it('preserves a breakaway and its cooldown when the authority checkpoints the brain', () => {
  const suspect = car('suspect', null, 0, 3), officer = car('officer', 'player', -14, 9), runtime = newBossAi(0);
  const decide = (tick: number, brain = runtime) => stepBossAi(suspect, base, [officer], brain, getBossTactics(1), tick, 28, () => false);
  decide(1); decide(31); const checkpoint = structuredClone(runtime);
  expect(decide(60).actions.throttle).toBe(1);
  expect(decide(60, checkpoint)).toEqual(decide(60));
  expect(decide(450, checkpoint).actions.handbrake).toBe(false);
  expect(decide(451, checkpoint).actions.handbrake).toBe(true);
});

it.each(['wrecked', 'respawning', 'protected'] as const)('cancels a pending breakaway when the suspect becomes %s', situation => {
  const suspect = car('suspect', null, 0, 3), officer = car('officer', 'player', -14, 9), runtime = newBossAi(0);
  const decide = (tick: number) => stepBossAi(suspect, base, [officer], runtime, getBossTactics(1), tick, 28, () => false).actions;
  decide(1); expect(decide(31).throttle).toBe(1);
  if (situation === 'protected') suspect.protectedUntilTick = 999;
  else suspect.status = situation;
  expect(decide(32).throttle).toBeLessThan(1);
  suspect.status = 'active'; suspect.protectedUntilTick = 0; officer.pose.z = 10;
  expect(decide(33).throttle).toBeLessThan(1);
});

it('regains ordinary cruise speed through the real controller without a speed or acceleration bonus', () => {
  const suspect = car('suspect', null, 0, 12), officer = car('officer', 'player', -14, 18), runtime = newBossAi(0), driver = newDriver();
  let previousSpeed = 12;
  for (let tick = 1; tick <= 90; tick++) {
    officer.pose.z = suspect.pose.z - 14; officer.velocity.z = suspect.velocity.z + 6;
    const decision = stepBossAi(suspect, base, [officer], runtime, getBossTactics(1), tick, 28, () => false);
    driveVehicle(suspect, driver, decision.actions, arena, []);
    if (tick >= 31) { expect(suspect.velocity.z).toBeLessThan(10.3); expect(suspect.velocity.z - previousSpeed).toBeLessThan(.44); }
    if (tick === 30) expect(suspect.velocity.z).toBeLessThan(2);
    previousSpeed = suspect.velocity.z;
  }
  expect(suspect.velocity.z, 'normal cruising speed by the end of the one-second breakaway').toBeGreaterThan(9);
});
