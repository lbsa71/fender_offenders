import {describe,expect,it} from 'vitest';
import {CAMPAIGN_TARGETS} from './campaign';
import {getCampaignMugshot} from './campaign-mugshots';
describe('original self-contained campaign mugshots',()=>{
 it('returns a distinct compact accessible SVG portrait for each named target',()=>{
  expect(CAMPAIGN_TARGETS).toHaveLength(10);const portraits=CAMPAIGN_TARGETS.map(t=>getCampaignMugshot(t.id));expect(new Set(portraits).size).toBe(10);
  expect(new Set(portraits.map(svg=>svg.replace(/<title>.*?<\/title>|aria-label="[^"]*"|data-accessory="[^"]*"/g,''))).size).toBe(10);
  for(const [i,svg]of portraits.entries()){expect(svg).toMatch(/^<svg\s/);expect(svg).toContain('viewBox="0 0 160 160"');expect(svg).toContain('<title>');expect(svg).toContain(CAMPAIGN_TARGETS[i]!.name);expect(svg.length).toBeLessThan(12000);expect(svg.length).toBeGreaterThan(1000);}
 });
 it('contains only authored local vector geometry, never external resources or executable markup',()=>{
  const svg=getCampaignMugshot('nico-nickel');expect(svg.length).toBeGreaterThan(1000);for(const target of CAMPAIGN_TARGETS){const portrait=getCampaignMugshot(target.id);expect(portrait).not.toMatch(/<(script|foreignObject|image|iframe|style|text)\b/i);expect(portrait).not.toMatch(/\son[a-z]+\s*=|(?:href|src)\s*=|url\(|javascript:|data:/i);expect(portrait.replace('http://www.w3.org/2000/svg','')).not.toMatch(/https?:|\/\//);expect(portrait).toContain('data-accessory=');}
 });
 it('uses a safe authored fallback without interpolating arbitrary IDs into SVG',()=>{
  const first=getCampaignMugshot('nico-nickel');expect(first).toContain('<svg');for(const id of ['missing','__proto__','constructor','<script>alert(1)</script>']){expect(getCampaignMugshot(id)).toBe(first);expect(getCampaignMugshot(id)).not.toContain(id);}
 });
});
