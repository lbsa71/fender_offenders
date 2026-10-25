import { GAMEPLAY_REVISION, type GameplayConfig } from '@fender/contracts';
export const TICK_RATE = 60;
export const FIXED_DELTA = 1 / TICK_RATE;

/** All gameplay numbers are shared by browser practice, prediction, and authority. */
const INTERNAL_DEFAULTS = {
  revision: GAMEPLAY_REVISION,
  // Lateral handling is a mass-normalised bicycle model: tyre force = -corneringStiffness * slipAngle, capped by grip (m/s^2).
  // Handbrake or power drops rear grip; past driftEntryAngle a servo holds a stick-controlled drift angle (see controller.ts).
  vehicle: { maxSpeed: 28, reverseSpeed: 8, acceleration: 26, reverseAcceleration: 9, braking: 36, drag: 0.45, corneringStiffness: 60, frontGrip: 18, rearGrip: 20, handbrakeGrip: 3, throttleGripLoss: 0.5, steerLock: 0.6, steerLockFalloff: 40, cgToFront: 1.1, cgToRear: 1.1, yawInertia: 1, yawDamping: 4, slipSpeedFloor: 5, handbrakeDecel: 9, driftSteerGain: 3, driftServoRate: 12, driftSteerWindow: 0.3, driftAngle: 0.65, driftEntryAngle: 0.22, driftEntryWidth: 0.1, kinematicBlendSpeed: 6, steeringResponse: 14, reverseHoldTicks: 15 },
  weapon: { damage: 10, cooldownTicks: 12, projectileSpeed: 70, lifetimeTicks: 39, recoilImpulse: 3.4, recoilBuildup: .32, recoilRecovery: .8, recoilSteeringLoss: .4, recoilGripLoss: .15 },
  rules: { health: 100, respawnTicks: 180, protectionTicks: 120, recoveryCooldownTicks: 600, recoveryDamageDelayTicks: 180, creditTicks: 300, countdownTicks: 180, roundTicks: 18000, maxPlayers: 8, maxTraffic: 16, arrestTicks: 180 },
};

export const DEFAULT_GAMEPLAY_CONFIG: GameplayConfig = {
  revision: GAMEPLAY_REVISION,
  vehicle: { acceleration: 26, reverseAcceleration: 9, braking: 36, topSpeed: 28, reverseSpeed: 8, drag: 0.45, grip: 20, handbrakeGrip: 3, steeringRate: 0.6, halfWidth: 0.95, halfLength: 2.15 },
  weapon: { damage: 10, shotsPerSecond: 5, speed: 70, lifetimeSeconds: 0.65 },
  roundSeconds: 300, countdownSeconds: 3, respawnSeconds: 3,
  spawnProtectionSeconds: 2, recoveryCooldownSeconds: 10, maxHealth: 100, trafficCount: 8,
};

export type SimulationConfig = typeof INTERNAL_DEFAULTS;
export type GameplayOverrides = {
  revision?: string;
  vehicle?: Partial<SimulationConfig['vehicle']>;
  weapon?: Partial<SimulationConfig['weapon']>;
  rules?: Partial<SimulationConfig['rules']>;
};

export function resolveConfig(overrides: GameplayOverrides = {}): SimulationConfig {
  const config = { revision: overrides.revision ?? INTERNAL_DEFAULTS.revision, vehicle: { ...INTERNAL_DEFAULTS.vehicle, ...overrides.vehicle }, weapon: { ...INTERNAL_DEFAULTS.weapon, ...overrides.weapon }, rules: { ...INTERNAL_DEFAULTS.rules, ...overrides.rules } };
  for (const group of [config.vehicle, config.weapon, config.rules]) {
    for (const [key, value] of Object.entries(group)) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid gameplay tuning: ${key}`);
      if ((key.endsWith('Ticks') || key.startsWith('max')) && key !== 'maxSpeed' && !Number.isInteger(value)) throw new Error(`Expected integer tuning: ${key}`);
    }
  }
  if (config.rules.maxPlayers > 8 || config.rules.maxTraffic > 16) throw new Error('Entity caps exceed supported budgets');
  return config;
}

export function normalizeGameplay(config: GameplayConfig = DEFAULT_GAMEPLAY_CONFIG): SimulationConfig {
  if (config.vehicle.halfWidth !== 0.95 || config.vehicle.halfLength !== 2.15) throw new Error('Unsupported vehicle collision dimensions');
  return resolveConfig({ revision: config.revision,
    vehicle: { acceleration: config.vehicle.acceleration, reverseAcceleration: config.vehicle.reverseAcceleration, braking: config.vehicle.braking, maxSpeed: config.vehicle.topSpeed, reverseSpeed: config.vehicle.reverseSpeed, drag: config.vehicle.drag, rearGrip: config.vehicle.grip, handbrakeGrip: config.vehicle.handbrakeGrip, steerLock: config.vehicle.steeringRate },
    weapon: { damage: config.weapon.damage, cooldownTicks: Math.ceil(60 / config.weapon.shotsPerSecond), projectileSpeed: config.weapon.speed, lifetimeTicks: Math.ceil(config.weapon.lifetimeSeconds * 60) },
    rules: { health: config.maxHealth, respawnTicks: Math.ceil(config.respawnSeconds * 60), protectionTicks: Math.ceil(config.spawnProtectionSeconds * 60), recoveryCooldownTicks: Math.ceil(config.recoveryCooldownSeconds * 60), countdownTicks: Math.ceil(config.countdownSeconds * 60), roundTicks: Math.ceil(config.roundSeconds * 60) },
  });
}
