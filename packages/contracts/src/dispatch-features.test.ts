import { expect, it } from 'vitest';
import { getDispatchFeatures } from './dispatch-features';
it('teaches the two new suspect gadgets with explicit avoidance and recovery cues',()=>{
 expect(getDispatchFeatures(5)).toMatchObject({lessonTitle:'OIL SLICKS'});expect(getDispatchFeatures(5).lesson).toContain('grip');
 expect(getDispatchFeatures(6)).toMatchObject({lessonTitle:'BLADED HUBCAPS'});expect(getDispatchFeatures(6).lesson).toContain('side');
});
it('introduces room equipment and hazards in order and keeps them available for later dispatches',()=>{
 expect(getDispatchFeatures(0)).toMatchObject({gunsEnabled:false,wetRoads:false,arrestOnly:true});
 expect(getDispatchFeatures(1)).toMatchObject({gunsEnabled:true,wetRoads:false,arrestOnly:false,lessonTitle:'UNLOCKED: GUNS!'});
 expect(getDispatchFeatures(2).lesson).toContain('marked circle');
 for(let stage=3;stage<10;stage++)expect(getDispatchFeatures(stage)).toMatchObject({gunsEnabled:true,wetRoads:true,arrestOnly:false});
 for(const invalid of [-1,NaN])expect(getDispatchFeatures(invalid)).toEqual(getDispatchFeatures(0));
 expect(getDispatchFeatures(100)).toEqual(getDispatchFeatures(9));
});
