import { expect, it } from 'vitest';
import { controlHints, placeControlCard } from './tutorial';
it('uses touch gestures and button names while preserving the campaign gun unlock',()=>{
 const hints=controlHints('touch',{},false);
 expect(hints.find(h=>h.action==='throttle')!.glyph).toBe('DRAG ↑');
 expect(hints.find(h=>h.action==='handbrake')!.glyph).toBe('DRIFT');
 expect(hints.some(h=>h.action==='fire')).toBe(false);
 expect(controlHints('touch',{},true).find(h=>h.action==='fire')!.glyph).toBe('FIRE');
});
it('shows actual remapped driving keys and only unlocked weapon controls',()=>{
 const hints=controlHints('keyboard',{throttle:['KeyI'],fire:['KeyF']},false);
 expect(hints.find(h=>h.action==='throttle')!.glyph).toBe('I');expect(hints.some(h=>h.action==='fire')).toBe(false);
 expect(controlHints('keyboard',{fire:['KeyF']},true).find(h=>h.action==='fire')!.glyph).toBe('F');
 expect(controlHints('gamepad',{},true).find(h=>h.action==='fire')!.glyph).toBe('RB');
 expect(controlHints('gamepad',{},false).find(h=>h.action==='throttle')!.glyph).toBe('RT / ↑');
});
it('clamps the floating controls inside the viewport and chooses the other side of a nearby suspect marker',()=>{
 const result=placeControlCard({x:.5,y:.5},960,720,220,110,{x:.8,y:.5});
 expect(result.x+220).toBeLessThan(480);expect(result.y).toBeGreaterThanOrEqual(12);
 const edge=placeControlCard({x:1,y:1},390,844,220,110,null);
 expect(edge.x).toBeGreaterThanOrEqual(12);expect(edge.x+220).toBeLessThanOrEqual(378);expect(edge.y+110).toBeLessThanOrEqual(832);
});

it('shows every unlocked deploy control on all devices, retaining remapped keys in later dispatches',()=>{
 const weapons={bombsEnabled:true,oilEnabled:true,bladesEnabled:true};
 for(const device of ['keyboard','gamepad','touch'] as const){const hints=controlHints(device,{bomb:['KeyJ'],oil:['KeyK'],blades:['KeyL']},true,weapons);expect(hints.filter(h=>['bomb','oil','blades'].includes(h.action)).map(h=>h.action)).toEqual(['bomb','oil','blades']);if(device==='keyboard')expect(hints.find(h=>h.action==='bomb')!.glyph).toBe('J');}
 expect(controlHints('keyboard',{},false,{bombsEnabled:false,oilEnabled:false,bladesEnabled:false}).some(h=>h.action==='bomb')).toBe(false);
});
