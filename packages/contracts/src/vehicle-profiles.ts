export const VEHICLE_BODIES = ['patrol', 'interceptor', 'roadster', 'army', 'ambulance', 'fire-chief', 'db5', 'gangster'] as const;
export type VehicleBodyId = typeof VEHICLE_BODIES[number];
export interface VehicleProfile {
  readonly id: VehicleBodyId; readonly name: string; readonly role: string; readonly description: string;
  readonly maxHealth: number; readonly topSpeed: number; readonly acceleration: number;
  readonly steeringRate: number; readonly grip: number;
}
const profile = (value: VehicleProfile): Readonly<VehicleProfile> => Object.freeze(value);
/** Shared baseline tuning in health points, metres/second and radians/second. */
export const VEHICLE_PROFILES: Readonly<Record<VehicleBodyId, VehicleProfile>> = Object.freeze({
  gangster: profile({id:'gangster',name:'Night Courier',role:'Armored classic',description:'Black 1920s sedan with sturdy armor, broad fenders and a deliberate turn of pace.',maxHealth:120,topSpeed:21,acceleration:15,steeringRate:1.85,grip:9.2}),
  db5: profile({id:'db5',name:'Aston Martin DB5',role:'Classic GT',description:'Silver style, balanced pursuit pace and discreet grille guns when unlocked.',maxHealth:90,topSpeed:26,acceleration:19,steeringRate:1.95,grip:9}),
  patrol: profile({ id: 'patrol', name: 'Patrol', role: 'All-rounder', description: 'Steady handling and dependable armor. Ready for anything.', maxHealth: 100, topSpeed: 24, acceleration: 18, steeringRate: 2.1, grip: 9 }),
  interceptor: profile({ id: 'interceptor', name: 'Interceptor', role: 'Pursuit specialist', description: 'Quick off the line and fast in pursuit. Wider turns and lighter armor.', maxHealth: 90, topSpeed: 26, acceleration: 20, steeringRate: 1.9, grip: 9 }),
  roadster: profile({ id: 'roadster', name: 'Roadster', role: 'Speed demon', description: 'Fastest on the streets. Fragile armor and a lively rear end.', maxHealth: 80, topSpeed: 28, acceleration: 22, steeringRate: 2.05, grip: 8 }),
  army: profile({ id: 'army', name: 'Army 4×4', role: 'Heavy bruiser', description: 'Takes a beating. Slow acceleration and broad turns demand planning.', maxHealth: 130, topSpeed: 20, acceleration: 14, steeringRate: 1.8, grip: 9.5 }),
  ambulance: profile({ id: 'ambulance', name: 'Ambulance', role: 'Durable dodger', description: 'Sturdy and nimble in tight streets. Gives up straight-line speed.', maxHealth: 110, topSpeed: 22, acceleration: 16, steeringRate: 2.2, grip: 9 }),
  'fire-chief': profile({ id: 'fire-chief', name: 'Fire Chief', role: 'Street responder', description: 'Grippy and punchy out of corners. A little slower on the straights.', maxHealth: 100, topSpeed: 23, acceleration: 19, steeringRate: 1.9, grip: 9.8 }),
});
export function isVehicleBodyId(value: unknown): value is VehicleBodyId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(VEHICLE_PROFILES, value);
}
export function getVehicleProfile(id: string): VehicleProfile { return VEHICLE_PROFILES[isVehicleBodyId(id) ? id : 'patrol']; }
