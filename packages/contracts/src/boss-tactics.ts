export interface BossTactics {
  readonly id: string; readonly label: string;
  readonly drivingStyle: 'runner' | 'brake-check' | 'weaver' | 'interceptor';
  readonly weapon: 'none' | 'burst' | 'grenades' | 'mixed'; readonly difficulty: number; readonly description: string;
  readonly engageRange: number; readonly cruiseSpeed: number; readonly weaveAmplitude: number; readonly weavePeriodTicks: number;
  readonly bulletDamage: number; readonly burstShots: number; readonly burstIntervalTicks: number; readonly burstRecoveryTicks: number;
  readonly windupTicks: number; readonly grenadeCooldownTicks: number; readonly grenadeFlightTicks: number; readonly grenadeFuseTicks: number;
  readonly grenadeDamage: number; readonly grenadeRadius: number;
  readonly gadget?: 'oil' | 'blades';
}
const profile = (id: string, label: string, drivingStyle: BossTactics['drivingStyle'], weapon: BossTactics['weapon'], difficulty: number, description: string, overrides: Partial<BossTactics> = {}): BossTactics => Object.freeze({
  id, label, drivingStyle, weapon, difficulty, description,
  engageRange: 22 + difficulty, cruiseSpeed: 9 + difficulty * .4,
  weaveAmplitude: .2 + difficulty * .04, weavePeriodTicks: 240 - difficulty * 8,
  bulletDamage: Math.min(10, 6 + Math.floor(difficulty / 2)), burstShots: 1 + Math.floor((difficulty - 1) / 3), burstIntervalTicks: Math.max(12, 22 - difficulty), burstRecoveryTicks: Math.max(120, 300 - difficulty * 18),
  windupTicks: 96 - difficulty * 6, grenadeCooldownTicks: 420 - difficulty * 22, grenadeFlightTicks: 24, grenadeFuseTicks: 90,
  grenadeDamage: Math.round(16 + difficulty * 1.8), grenadeRadius: 4 + difficulty * .2,
  ...overrides,
});
/** Deterministic authored difficulty, not player-stat scaling or an adaptive damage handicap. */
export const BOSS_TACTICS: readonly BossTactics[] = Object.freeze([
  profile('loose-change', 'Nervous getaway', 'runner', 'none', 1, 'Nico is unarmed. Catch up, match his speed and stay close with a clear path for three seconds to arrest him.'),
  profile('clamp-down', 'Clamp and counter', 'brake-check', 'burst', 2, 'Mabel brakes hard when you close in behind, then floors it briefly. Cut in front and match speed to arrest her; watch for short forward bursts.', { burstShots: 2, weavePeriodTicks: 240 }),
  profile('duplicate-trouble', 'Courier lob', 'weaver', 'grenades', 3, 'Pip swerves when you close in and throws a slow grenade lob. The landing ring stays fixed: move away before the fuse expires.', { grenadeFuseTicks: 150 }),
  profile('express-distress', 'Express detour', 'weaver', 'grenades', 4, 'Rosa swerves sharply when you close in and drops marked grenades more often. Cross behind her and leave the landing ring during its visible fuse.'),
  profile('stamp-duty', 'Hot-stamp grenadier', 'weaver', 'grenades', 5, 'Hector makes broad swerves when you close in while lobbing marked grenades. Match his movement, leave each fixed blast ring, then arrest during recovery.', { weaveAmplitude: .48, weavePeriodTicks: 180 }),
  profile('false-alarm', 'Siren drive-by', 'runner', 'burst', 6, 'Otis drops small oil slicks when you close behind. Steer around the amber-edged patches; they briefly reduce grip. His guns point forward, so approach the flanks during recovery.', { gadget: 'oil' }),
  profile('cone-of-silence', 'Rolling roadblock', 'brake-check', 'burst', 7, 'Tess brake-checks, then floors it briefly. Amber hubcaps warn before short side blades extend: leave side clearance, cut in front and match speed during her long cooldown.', { burstShots: 3, gadget: 'blades' }),
  profile('premium-care', 'Serpentine drive-by', 'weaver', 'burst', 8, 'Iris cuts sharp, fast swerves when you close in and fires four forward drive-by volleys. Follow the rhythm, stay off her nose, and match speed during recovery.', { weaveAmplitude: .88, weavePeriodTicks: 120, burstShots: 4 }),
  profile('paper-trail', 'Accountant crossfire', 'runner', 'mixed', 9, 'Juno alternates escape bursts and fixed grenade zones. Move out of the marked landing area and catch the pause between attacks.'),
  profile('green-light', 'Chairman intercept', 'interceptor', 'mixed', 10, 'Aldo steers toward your route and alternates five forward volleys with grenades. Break his firing line, dodge the fixed blast ring, then exploit recovery.', { burstShots: 5, engageRange: 36 }),
]);
export function getBossTactics(dispatchIndex: number): BossTactics {
  return BOSS_TACTICS[Number.isFinite(dispatchIndex) ? Math.max(0, Math.min(9, Math.floor(dispatchIndex))) : 0]!;
}
