import {expect,it} from 'vitest';
import {ALL_CAMPAIGN_TARGETS} from './campaign';
import {getCampaignMugshot} from './campaign-mugshots';

it('gives all fifty named suspects a distinct local portrait rather than the opening fallback',()=>{
 expect(ALL_CAMPAIGN_TARGETS).toHaveLength(50);
 const visuals=ALL_CAMPAIGN_TARGETS.map(target=>{
  const svg=getCampaignMugshot(target.id);expect(svg).toContain(target.name);expect(svg).toContain('viewBox="0 0 160 160"');
  expect(svg).not.toMatch(/<(script|foreignObject|image|iframe|style|text)\b|\son[a-z]+\s*=|(?:href|src)\s*=|url\(|javascript:/i);
  return svg.replace(/<title>.*?<\/title>/,'').replace(/aria-label="[^"]*"/,'').replace(/data-accessory="[^"]*"/,'');
 });
 expect(new Set(visuals).size,'Distinct text alone cannot stand in for distinct suspect art').toBe(50);
});
