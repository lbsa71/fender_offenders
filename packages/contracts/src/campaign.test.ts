import {describe,expect,it} from 'vitest';
import {CAMPAIGN_ID,CAMPAIGN_TITLE,CAMPAIGN_TARGETS,CAMPAIGN_BOSSES,CAMPAIGN_DISPATCHES,getCampaignTarget} from './campaign';
import {VEHICLE_BODIES,getVehicleProfile} from './vehicle-profiles';
describe('authored Green Light campaign',()=>{
 it('has ten distinct named targets, six crew and four connected ringleaders',()=>{
  expect(CAMPAIGN_ID).toMatch(/^[a-z0-9-]+$/);expect(CAMPAIGN_TITLE.length).toBeGreaterThan(10);expect(CAMPAIGN_TARGETS).toHaveLength(10);expect(CAMPAIGN_BOSSES).toHaveLength(4);
  expect(CAMPAIGN_TARGETS.filter(t=>!t.isBoss)).toHaveLength(6);expect(new Set(CAMPAIGN_TARGETS.map(t=>t.id)).size).toBe(10);expect(new Set(CAMPAIGN_TARGETS.map(t=>t.alias)).size).toBe(10);
  for(const target of CAMPAIGN_TARGETS){expect(target.name.length).toBeGreaterThan(5);expect(target.alias.length).toBeGreaterThan(4);expect(target.role.length).toBeGreaterThan(8);expect(CAMPAIGN_BOSSES.some(b=>b.id===target.bossId)).toBe(true);if(target.isBoss)expect(target.bossId).toBe(target.id);}
 });
 it('assigns real fleet bodies with identifiable car descriptions and varied pursuit profiles',()=>{
  expect(CAMPAIGN_TARGETS.length).toBe(10);expect(new Set(CAMPAIGN_TARGETS.map(t=>t.vehicleBodyId)).size).toBeGreaterThanOrEqual(4);
  for(const target of CAMPAIGN_TARGETS){expect(VEHICLE_BODIES).toContain(target.vehicleBodyId);expect(target.description.length).toBeGreaterThan(85);expect(target.description).toContain(getVehicleProfile(target.vehicleBodyId).name);}
 });
 it('orders ten unique dispatches with a crew introduction and bosses at stages2,5,8,10',()=>{
  expect(CAMPAIGN_DISPATCHES).toHaveLength(10);expect(new Set(CAMPAIGN_DISPATCHES.map(d=>d.id)).size).toBe(10);expect(new Set(CAMPAIGN_DISPATCHES.map(d=>d.targetId)).size).toBe(10);
  const stages=CAMPAIGN_DISPATCHES.map(d=>CAMPAIGN_TARGETS.find(t=>t.id===d.targetId));expect(stages.every(Boolean)).toBe(true);expect(stages[0]?.isBoss).toBe(false);expect(stages.flatMap((t,i)=>t?.isBoss?[i+1]:[])).toEqual([2,5,8,10]);
 });
 it('reveals one new lead after each success and closes all four bosses in the finale',()=>{
  expect(CAMPAIGN_DISPATCHES).toHaveLength(10);expect(new Set(CAMPAIGN_DISPATCHES.map(d=>d.reveal)).size).toBe(10);
  for(const [i,d]of CAMPAIGN_DISPATCHES.entries()){expect(d.title.length).toBeGreaterThan(7);expect(d.briefing.length).toBeGreaterThan(90);expect(d.briefing.length).toBeLessThan(400);expect(d.reveal.length).toBeGreaterThan(90);expect(d.reveal).not.toBe(d.briefing);if(i<9)expect(d.reveal).toContain(getCampaignTarget(CAMPAIGN_DISPATCHES[i+1]!.targetId).alias);}
  const finale=CAMPAIGN_DISPATCHES.at(-1)?.reveal??'';for(const boss of CAMPAIGN_BOSSES)expect(finale).toContain(boss.alias);expect(finale).toMatch(/refund/i);expect(finale).toMatch(/streets|roads/i);
 });
 it('returns known authored records and a deterministic safe fallback for arbitrary IDs',()=>{
  expect(CAMPAIGN_TARGETS).toHaveLength(10);for(const target of CAMPAIGN_TARGETS)expect(getCampaignTarget(target.id)).toBe(target);
  for(const id of ['missing','__proto__','constructor','<script>',''])expect(getCampaignTarget(id)).toBe(CAMPAIGN_TARGETS[0]);
 });
 it('keeps the shared authored records immutable',()=>{
  expect(Object.isFrozen(CAMPAIGN_TARGETS)).toBe(true);expect(Object.isFrozen(CAMPAIGN_BOSSES)).toBe(true);expect(Object.isFrozen(CAMPAIGN_DISPATCHES)).toBe(true);expect(CAMPAIGN_TARGETS.every(Object.isFrozen)).toBe(true);expect(CAMPAIGN_DISPATCHES.every(Object.isFrozen)).toBe(true);
 });
});
