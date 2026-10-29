/** Room-owned equipment and road conditions, derived from the authoritative dispatch. */
export interface DispatchDrivingContext {
  gunsEnabled: boolean; wetRoads: boolean; winterRoads?: boolean;
  bombsEnabled?: boolean; oilEnabled?: boolean; bladesEnabled?: boolean; smogEnabled?: boolean;
  oilSlicks?: readonly { ownerEntityId: string; pose: { x: number; z: number }; radius: number }[];
}
export interface DispatchFeatures extends DispatchDrivingContext {
  arrestOnly: boolean; lessonTitle: string; lesson: string;
}
const lessons = [
  ['ROOKIE PATROL', 'Catch up → match speed → stay close for 3 seconds. Arresting is automatic.'],
  ['SUSPECT GUNS', 'The suspect has forward guns first. Approach from behind or a flank, cut in front and match speed to arrest. Police guns arrive next dispatch.'],
  ['UNLOCKED: GUNS!', 'Police guns are approved. Fire forward in short bursts: recoil affects handling. Enemy bombs predict your route, then lock the marked circle for 1 second. Change speed or direction.'],
  ['WET ROADS', 'Ease off. Steer gently. Wet tyres have opinions. Puddles reduce grip.'],
] as const;
export function getDispatchFeatures(index: number): DispatchFeatures {
  const stage = Number.isFinite(index) ? Math.max(0, Math.min(9, Math.floor(index))) : 0;
  const titles = ['ROOKIE PATROL','SUSPECT GUNS','UNLOCKED: GUNS!','WET ROADS','UNLOCKED: BOMBS!','OIL SLICKS','BLADED HUBCAPS','UNLOCKED: OIL!','UNLOCKED: HUBCAP BLADES!','UNLOCKED: SMOG!'];
  const reminders: string[] = [];
  if(stage>=2)reminders.push('Fire guns forward in short bursts.');
  if([3,4,8,9].includes(stage))reminders.push('Enemy bombs predict your route: change speed or direction before the fixed 0.8-second blast.');
  if([4,8,9].includes(stage))reminders.push('A black chopper makes slow passes ahead: shoot toward its amber ground marker to down it for this dispatch.');
  if(stage>=4)reminders.push('Throw a bomb ahead; leave its marked circle. Bombs, oil and blades share a 12-second cooldown.');
  if(stage>=7)reminders.push('Drop oil behind after a cutoff. Oil briefly reduces grip; steer around marked patches.');
  if(stage>=7)reminders.push('Smog: avoid the amber exhaust cloud. Entering it obscures your view for 2.5 seconds.');
  if(stage>=9)reminders.push('Release smog behind after a cutoff; it briefly blinds the suspect. Smog shares the equipment cooldown and takes 18 seconds to reload.');
  if(stage>=8)reminders.push('Extend side blades after their amber warning; front cutoffs still work.');
  const introduction = stage===8?'SNOW DISPATCH: the whole district is covered in snow. Brake early and counter-steer gently. Frozen puddles are even slicker.':lessons[stage]?.[1] ?? (stage===5?'Suspect oil: steer around marked patches. Normal grip returns on exit.':stage===6?'Suspect blades: amber hubcaps warn for a full second. Leave side clearance until they retract.':'');
  return { gunsEnabled: stage >= 2, bombsEnabled: stage >= 4, oilEnabled: stage >= 7, bladesEnabled: stage >= 8, smogEnabled: stage >= 9, wetRoads: stage >= 3, winterRoads: stage === 8, arrestOnly: stage === 0,
    lessonTitle: titles[stage]!, lesson: [introduction,...reminders].filter(Boolean).join(' ') };

}
/** Legacy combat fixtures have guns; wet-road fixtures explicitly enable their context. */
export const DEFAULT_DRIVING_CONTEXT: Readonly<DispatchDrivingContext> = Object.freeze({ gunsEnabled: true, wetRoads: false });

/** Winter affects every car; frozen authored water is the slickest surface. */
export const WINTER_ROAD_RULES = Object.freeze({ snowGrip:.36, frozenGrip:.07, snowDrive:.65, frozenDrive:.28, snowBrake:.35, frozenBrake:.12 });
