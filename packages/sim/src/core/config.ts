import { GAMEPLAY_REVISION, type GameplayConfig } from '@fender/contracts';
export const TICK_RATE = 60;
export const FIXED_DELTA = 1 / TICK_RATE;

/** All gameplay numbers are shared by browser practice, prediction, and authority. */
const INTERNAL_DEFAULTS = {
  revision: GAMEPLAY_REVISION,
  vehicle: { maxSpeed: 24, reverseSpeed: 8, acceleration: 18, reverseAcceleration: 9, braking: 32, drag: 0.45, grip: 9, driftGrip: 2.2, steeringRate: 2.1, steeringResponse: 9, reverseHoldTicks: 15 },
  weapon: { damage: 10, cooldownTicks: 12, projectileSpeed: 70, lifetimeTicks: 39 },
  rules: { health: 100, respawnTicks: 180, protectionTicks: 120, recoveryCooldownTicks: 600, recoveryDamageDelayTicks: 180, creditTicks: 300, countdownTicks: 180, roundTicks: 18000, maxPlayers: 8, maxTraffic: 16, arrestTicks: 180 },
};

export const DEFAULT_GAMEPLAY_CONFIG: GameplayConfig = {
  revision: GAMEPLAY_REVISION,
  vehicle: { acceleration: 18, reverseAcceleration: 9, braking: 32, topSpeed: 24, reverseSpeed: 8, drag: 0.45, grip: 9, handbrakeGrip: 2.2, steeringRate: 2.1, halfWidth: 0.95, halfLength: 2.15 },
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
    vehicle: { acceleration: config.vehicle.acceleration, reverseAcceleration: config.vehicle.reverseAcceleration, braking: config.vehicle.braking, maxSpeed: config.vehicle.topSpeed, reverseSpeed: config.vehicle.reverseSpeed, drag: config.vehicle.drag, grip: config.vehicle.grip, driftGrip: config.vehicle.handbrakeGrip, steeringRate: config.vehicle.steeringRate },
    weapon: { damage: config.weapon.damage, cooldownTicks: Math.ceil(60 / config.weapon.shotsPerSecond), projectileSpeed: config.weapon.speed, lifetimeTicks: Math.ceil(config.weapon.lifetimeSeconds * 60) },
    rules: { health: config.maxHealth, respawnTicks: Math.ceil(config.respawnSeconds * 60), protectionTicks: Math.ceil(config.spawnProtectionSeconds * 60), recoveryCooldownTicks: Math.ceil(config.recoveryCooldownSeconds * 60), countdownTicks: Math.ceil(config.countdownSeconds * 60), roundTicks: Math.ceil(config.roundSeconds * 60) },
  });
}
