export { createSimulation, predictVehicle } from './core/simulation.js';
export type { Simulation, SimulationOptions, SimulationCheckpoint, PlayerOptions } from './core/simulation.js';
export { DEFAULT_GAMEPLAY_CONFIG, TICK_RATE, FIXED_DELTA } from './core/config.js';
export { initPhysics, runPhysicsSpike } from './physics/rapier.js';
export { surfaceAt, newDriver } from './vehicles/controller.js';
export { selectAssistedYaw, AIM_ASSIST_LIMITS } from './combat/aim-assist.js';
export type { AimLineBlocked } from './combat/aim-assist.js';
export { getVolleyOrigins, MUZZLE_FORWARD, MUZZLE_LATERAL } from './combat/volleys.js';
