import {STORYLINES} from './campaign';
import { expect, it } from 'vitest';
import { getDispatchFeatures } from './dispatch-features';
it('teaches the two new suspect gadgets with explicit avoidance and recovery cues',()=>{
 expect(getDispatchFeatures(5)).toMatchObject({lessonTitle:'OIL SLICKS'});expect(getDispatchFeatures(5).lesson).toContain('grip');
 expect(getDispatchFeatures(6)).toMatchObject({lessonTitle:'BLADED HUBCAPS'});expect(getDispatchFeatures(6).lesson).toContain('side');
});
it('introduces room equipment and hazards in order and keeps them available for later dispatches',()=>{
 expect(getDispatchFeatures(0)).toMatchObject({gunsEnabled:false,wetRoads:false,arrestOnly:true});
 expect(getDispatchFeatures(1)).toMatchObject({gunsEnabled:false,wetRoads:false,arrestOnly:false,lessonTitle:'SUSPECT GUNS'});
 expect(getDispatchFeatures(2).lesson).toContain('marked circle');
 for(let stage=3;stage<10;stage++)expect(getDispatchFeatures(stage)).toMatchObject({gunsEnabled:true,wetRoads:true,arrestOnly:false});
 for(const invalid of [-1,NaN])expect(getDispatchFeatures(invalid)).toEqual(getDispatchFeatures(0));
 expect(getDispatchFeatures(100)).toEqual(getDispatchFeatures(9));
});

it('unlocks every police weapon one or two dispatches after its suspect introduction and keeps it unlocked',()=>{
 for(let stage=0;stage<10;stage++)expect(getDispatchFeatures(stage)).toMatchObject({gunsEnabled:stage>=2,bombsEnabled:stage>=4,oilEnabled:stage>=7,bladesEnabled:stage>=8});
 expect(getDispatchFeatures(2).lessonTitle).toBe('UNLOCKED: GUNS!');expect(getDispatchFeatures(4).lessonTitle).toBe('UNLOCKED: BOMBS!');expect(getDispatchFeatures(7).lessonTitle).toBe('UNLOCKED: OIL!');expect(getDispatchFeatures(8).lessonTitle).toBe('UNLOCKED: HUBCAP BLADES!');
 for(let stage=4;stage<10;stage++)expect(getDispatchFeatures(stage).lesson).toContain('bomb');
 for(let stage=7;stage<10;stage++)expect(getDispatchFeatures(stage).lesson).toContain('oil');
 for(let stage=8;stage<10;stage++)expect(getDispatchFeatures(stage).lesson).toContain('blades');
});

it('makes only dispatch nine snowy, explains ice and retains every police weapon reminder',()=>{
 for(let stage=0;stage<10;stage++)expect(getDispatchFeatures(stage)).toHaveProperty('winterRoads',stage===8);
 const winter=getDispatchFeatures(8);expect(winter.lesson).toMatch(/snow/i);expect(winter.lesson).toMatch(/puddles.*slicker/i);expect(winter.lesson).toMatch(/brake early/i);
 for(const weapon of ['guns','bomb','oil','blades'])expect(winter.lesson).toContain(weapon);
});
it('keeps predictive bomb and helicopter counterplay in compact equipment lessons',()=>{
 for(const stage of [2,3,4,8,9])expect(getDispatchFeatures(stage).lesson).toContain('Enemy bombs predict your route');
 for(let stage=0;stage<10;stage++){
  const lesson=getDispatchFeatures(stage).lesson;
  if([4,8,9].includes(stage)){expect(lesson).toContain('black chopper');expect(lesson).toContain('amber ground marker');expect(lesson).toContain('this dispatch');}
  else expect(lesson).not.toContain('black chopper');
 }
});

it('authors a snow theme for the ninth dispatch of every case',()=>{for(const story of STORYLINES)expect(story.dispatches[8]!.theme).toBe('snow');});
