import type { VehicleBodyId } from './vehicle-profiles';

export type CampaignOutcome = 'arrested' | 'wrecked';
export interface DispatchOutcome {
  dispatchIndex: number;
  outcome: CampaignOutcome;
  playerId: string;
  callsign: string;
  elapsedTicks: number;
}
/** The room owns one campaign; results are ordered, immutable dispatch resolutions. */
export interface CampaignState {
  campaignId: string;
  dispatchIndex: number;
  status: 'active' | 'complete';
  outcomes: DispatchOutcome[];
}
export interface CampaignTarget {
  readonly id: string;
  readonly name: string;
  readonly alias: string;
  readonly role: string;
  readonly bossId: string;
  readonly isBoss: boolean;
  readonly vehicleBodyId: VehicleBodyId;
  readonly description: string;
}
export interface CampaignDispatch {
  readonly id: string;
  readonly title: string;
  readonly targetId: string;
  readonly briefing: string;
  /** Shown only after this dispatch succeeds, by either method. */
  readonly reveal: string;
  readonly theme?: 'noon' | 'dusk' | 'night' | 'snow';
}
export interface CampaignStoryline {
  readonly id: string;
  readonly title: string;
  readonly targets: readonly CampaignTarget[];
  readonly dispatches: readonly CampaignDispatch[];
}
