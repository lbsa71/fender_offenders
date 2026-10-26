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

it('keeps the default bomb key distinct from the common remapped F gun key',()=>{
 const hints=controlHints('keyboard',{fire:['KeyF']},true,{bombsEnabled:true});expect(hints.find(h=>h.action==='fire')!.glyph).toBe('F');expect(hints.find(h=>h.action==='bomb')!.glyph).toBe('B');
});

it('keeps a tall unlocked-controls card clear of a suspect marker near the local car',()=>{
 const target={x:.505,y:.67},card=placeControlCard({x:.513,y:.78},960,640,330,270,target);
 const width=Math.max(0,Math.min(card.x+330,target.x*960+100)-Math.max(card.x,target.x*960-100));const height=Math.max(0,Math.min(card.y+270,target.y*640+50)-Math.max(card.y,target.y*640-50));expect(width*height).toBe(0);expect(card.x+330).toBeLessThanOrEqual(948);expect(card.y+270).toBeLessThanOrEqual(640);
});
