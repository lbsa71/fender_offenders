/** Room-owned equipment and road conditions, derived from the authoritative dispatch. */
export interface DispatchDrivingContext {
  gunsEnabled: boolean; wetRoads: boolean;
  oilSlicks?: readonly { ownerEntityId: string; pose: { x: number; z: number }; radius: number }[];
}
export interface DispatchFeatures extends DispatchDrivingContext {
  arrestOnly: boolean; lessonTitle: string; lesson: string;
}
const lessons = [
  ['ROOKIE PATROL', 'Catch up → match speed → stay close for 3 seconds. Arresting is automatic.'],
  ['UNLOCKED: GUNS!', 'Procurement finally approved the noisy accessories. Fire forward in short bursts: recoil affects handling.'],
  ['BOMBS AHEAD', 'Leave the marked circle before it explodes. Bombs stay where the suspect aimed them.'],
  ['WET ROADS', 'Ease off. Steer gently. Wet tyres have opinions. Puddles reduce grip.'],
] as const;
export function getDispatchFeatures(index: number): DispatchFeatures {
  const stage = Number.isFinite(index) ? Math.max(0, Math.min(9, Math.floor(index))) : 0;
  const lesson = lessons[stage] ?? (stage === 5 ? ['OIL SLICKS', 'Steer around the marked oil. It briefly reduces grip; normal grip returns as soon as you leave.'] : stage === 6 ? ['BLADED HUBCAPS', 'Amber hubcaps give a full second of warning. Leave side clearance until the short blades retract; a front cutoff still works.'] : undefined);
  return { gunsEnabled: stage >= 1, wetRoads: stage >= 3, arrestOnly: stage === 0,
    lessonTitle: lesson?.[0] ?? 'ON PATROL', lesson: lesson?.[1] ?? 'Arrest for 3 points. Wreck the suspect for 1. Stay out of marked blast circles.' };
}
/** Legacy combat fixtures have guns; wet-road fixtures explicitly enable their context. */
export const DEFAULT_DRIVING_CONTEXT: Readonly<DispatchDrivingContext> = Object.freeze({ gunsEnabled: true, wetRoads: false });
