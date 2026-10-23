import {describe,it,expect} from 'vitest';
import {targetIndicatorFromClip} from './target-projection';
const closeAngle=(actual:number,expected:number)=>expect(Math.abs(Math.atan2(Math.sin(actual-expected),Math.cos(actual-expected)))).toBeLessThan(.00001);
describe('wanted target safe-border projection',()=>{
 it.each([
  ['up',{x:0,y:3,w:1},.5,.1875,0],['right',{x:3,y:0,w:1},.916,.5,Math.PI/2],['down',{x:0,y:-3,w:1},.5,.7375,Math.PI],['left',{x:-3,y:0,w:1},.084,.5,Math.PI*1.5],
 ] as const)('points %s with clockwise-from-up rotation and label-safe pixel insets',(_name,clip,x,y,angle)=>{const result=targetIndicatorFromClip(clip,1000,800,23.4)!;expect(result.offscreen).toBe(true);expect(result.x).toBeCloseTo(x,5);expect(result.y).toBeCloseTo(y,5);closeAngle(result.angle,angle);expect(result.distanceMeters).toBe(23.4);});
 it.each([[3,3],[-3,3],[3,-3],[-3,-3]])('preserves diagonal screen direction at %s,%s without forcing a corner',(x,y)=>{const p=targetIndicatorFromClip({x,y,w:1},1000,800,1)!;expect(p.offscreen).toBe(true);expect(p.x).toBeGreaterThanOrEqual(.084);expect(p.x).toBeLessThanOrEqual(.916);expect(p.y).toBeGreaterThanOrEqual(.1875);expect(p.y).toBeLessThanOrEqual(.7375);closeAngle(p.angle,(Math.atan2(x*500,y*400)+Math.PI*2)%(Math.PI*2));expect(Math.min(Math.abs(p.x-.084),Math.abs(p.x-.916),Math.abs(p.y-.1875),Math.abs(p.y-.7375))).toBeLessThan(.00001);});
 it('keeps left/right/up/down correct behind the camera and chooses down for directly behind',()=>{
  for(const [x,y,angle]of [[3,0,Math.PI/2],[-3,0,Math.PI*1.5],[0,3,0],[0,-3,Math.PI]]){const p=targetIndicatorFromClip({x:x!,y:y!,w:-1},1000,800,1)!;expect(p.offscreen).toBe(true);closeAngle(p.angle,angle!);}
  const behind=targetIndicatorFromClip({x:0,y:0,w:-1},1000,800,1)!;expect(behind.offscreen).toBe(true);closeAngle(behind.angle,Math.PI);expect(behind.y).toBeCloseTo(.7375);
 });
 it('anchors an onscreen target exactly and honors the current camera viewport',()=>{
  const p=targetIndicatorFromClip({x:.2,y:.3,z:.5,w:1},1000,800,42)!;expect(p.offscreen).toBe(false);expect(p.x).toBeCloseTo(.6);expect(p.y).toBeCloseTo(.35);
  const viewport={x:.1,y:.2,width:.6,height:.5},center=targetIndicatorFromClip({x:0,y:0,w:1},1000,800,42,viewport)!;expect(center.x).toBeCloseTo(.4);expect(center.y).toBeCloseTo(.55);
  const edge=targetIndicatorFromClip({x:3,y:0,w:1},1000,800,42,viewport)!;expect(edge.x).toBeCloseTo(.616);expect(edge.y).toBeCloseTo(.55);
 });
 it('adapts fixed pixel label clearance on resize and stays finite on tiny canvases/camera plane',()=>{
  const wide=targetIndicatorFromClip({x:3,y:0,w:1},1000,800,1)!,small=targetIndicatorFromClip({x:3,y:0,w:1},400,300,1)!;expect(wide.x*1000).toBeCloseTo(916);expect(small.x*400).toBeCloseTo(316);
  const tiny=targetIndicatorFromClip({x:2,y:-3,w:0},160,100,1)!;expect([tiny.x,tiny.y,tiny.angle].every(Number.isFinite)).toBe(true);expect(tiny.x).toBeGreaterThan(0);expect(tiny.x).toBeLessThan(1);expect(tiny.y).toBeGreaterThan(0);expect(tiny.y).toBeLessThan(1);
  const mobileNorth=targetIndicatorFromClip({x:0,y:3,w:1},700,800,1)!;expect(mobileNorth.y*800).toBeCloseTo(104);
 });
 it('rejects invalid geometry instead of leaking NaN into CSS',()=>{expect(targetIndicatorFromClip({x:NaN,y:0,w:1},1000,800,1)).toBeNull();expect(targetIndicatorFromClip({x:1,y:0,w:1},0,800,1)).toBeNull();});
});
