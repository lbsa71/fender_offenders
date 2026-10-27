import {expect,it} from 'vitest';
import * as campaign from './campaign';
import {VEHICLE_BODIES} from './vehicle-profiles';

const catalog=()=>campaign.STORYLINES;

it('offers five distinct complete storylines with ten dispatches and their own cast',()=>{
 const stories=catalog();expect(stories,'The current single case must expand into five playable storylines').toHaveLength(5);
 expect(new Set(stories.map(s=>s.id)).size).toBe(5);expect(new Set(stories.map(s=>s.title)).size).toBe(5);
 expect(new Set(stories.flatMap(s=>s.dispatches.map(d=>d.id))).size).toBe(50);
 expect(new Set(stories.flatMap(s=>s.targets.map(t=>t.id))).size).toBe(50);
 for(const story of stories){
  expect(story.dispatches).toHaveLength(10);expect(story.targets).toHaveLength(10);
  expect(story.targets.filter(t=>t.isBoss)).toHaveLength(4);
  expect(story.dispatches.flatMap((d,i)=>story.targets.find(t=>t.id===d.targetId)?.isBoss?[i+1]:[])).toEqual([2,5,8,10]);
  for(const target of story.targets){expect(VEHICLE_BODIES).toContain(target.vehicleBodyId);expect(story.targets.some(t=>t.id===target.bossId&&t.isBoss)).toBe(true);expect(campaign.getCampaignTarget(target.id)).toBe(target);}
 }
});

it('keeps all fifty briefings concise and gives each earned clue a coherent next lead and ending',()=>{
 const stories=catalog();expect(stories).toHaveLength(5);
 const reveals=stories.flatMap(s=>s.dispatches.map(d=>d.reveal));expect(new Set(reveals).size).toBe(50);
 for(const story of stories)for(const [i,d]of story.dispatches.entries()){
  expect(d.briefing.split(/\s+/).length).toBeLessThanOrEqual(55);expect(d.briefing.length).toBeGreaterThan(60);
  expect(d.reveal.split(/\s+/).length).toBeLessThanOrEqual(65);expect(d.reveal.length).toBeGreaterThan(60);
  expect(d.theme).toBe(['noon','noon','dusk','dusk','night','noon','dusk','night','snow','night'][i]);
  if(i<9)expect(d.reveal).toContain(story.targets.find(t=>t.id===story.dispatches[i+1]!.targetId)!.alias);
  else for(const boss of story.targets.filter(t=>t.isBoss))expect(d.reveal).toContain(boss.alias);
 }
});

it('resolves the authoritative case safely while retaining the original campaign aliases',()=>{
 const stories=catalog();expect(stories).toHaveLength(5);
 const get=campaign.getStoryline;
 expect(stories[0]!.id).toBe(campaign.CAMPAIGN_ID);expect(stories[0]!.dispatches).toBe(campaign.CAMPAIGN_DISPATCHES);
 for(const story of stories){expect(get(story.id)).toBe(story);expect(Object.isFrozen(story)).toBe(true);expect(Object.isFrozen(story.targets)).toBe(true);expect(Object.isFrozen(story.dispatches)).toBe(true);expect(story.targets.every(Object.isFrozen)).toBe(true);expect(story.dispatches.every(Object.isFrozen)).toBe(true);}
 for(const bad of ['','__proto__','constructor','missing','<script>'])expect(get(bad)).toBe(stories[0]);
});

it('resolves every dispatch ID back to its own storyline and local equipment stage',()=>{
 const lookup=campaign.findCampaignDispatch;
 expect(lookup,'New case IDs must resolve for weapon fittings and lighting').toBeTypeOf('function');
 for(const story of catalog())for(const [index,dispatch]of story.dispatches.entries())expect(lookup!(dispatch.id)).toEqual({storylineId:story.id,index,dispatch});
 expect(lookup!(null)).toBeNull();expect(lookup!('missing')).toBeNull();
});
