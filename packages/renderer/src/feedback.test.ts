import {describe,it,expect} from 'vitest';
import {newVehicleFeedback,kickImpact,kickRecoil,stepVehicleFeedback} from './feedback';
describe('directional cosmetic impact spring and confirmed recoil',()=>{
 it('shows initial crash compression and recoil before large10FPS frame steps can skip their peak',()=>{
  const crash=stepVehicleFeedback(kickImpact(newVehicleFeedback(),{x:0,z:-1},0,22),.1,false),shot=stepVehicleFeedback(kickRecoil(newVehicleFeedback()),.1,false);
  expect(crash.scaleZ).toBeLessThan(.85);expect(shot.offsetZ).toBeLessThan(-.02);
 });
 it('squashes along the impact normal, supports rotated cars, and distinguishes front/back lean',()=>{
  const front=stepVehicleFeedback(kickImpact(newVehicleFeedback(),{x:0,z:-1},0,22),.03,false),side=stepVehicleFeedback(kickImpact(newVehicleFeedback(),{x:1,z:0},0,22),.03,false),rear=stepVehicleFeedback(kickImpact(newVehicleFeedback(),{x:0,z:1},0,22),.03,false);
  expect(front.scaleZ).toBeLessThan(.8);expect(front.scaleX).toBeGreaterThan(1);expect(side.scaleX).toBeLessThan(.8);expect(side.scaleZ).toBeGreaterThan(1);expect(front.pitch*rear.pitch).toBeLessThan(0);
  const rotated=stepVehicleFeedback(kickImpact(newVehicleFeedback(),{x:-1,z:0},Math.PI/2,22),.03,false);expect(rotated.scaleZ).toBeCloseTo(front.scaleZ,5);
 });
 it('overshoots, settles, and keeps violent or malformed impacts within finite bounds',()=>{
  let state=kickImpact(newVehicleFeedback(),{x:0,z:-1},0,100000),overshoot=false;
  for(let i=0;i<180;i++){state=stepVehicleFeedback(state,1/60,false);if(state.scaleZ>1.04)overshoot=true;for(const key of ['scaleX','scaleY','scaleZ'] as const){expect(state[key]).toBeGreaterThanOrEqual(.62);expect(state[key]).toBeLessThanOrEqual(1.36);}expect(Math.abs(state.offsetZ)).toBeLessThanOrEqual(.18);}
  expect(overshoot).toBe(true);expect(state.scaleZ).toBeCloseTo(1,5);expect(state.pitch).toBeCloseTo(0,5);
  const bad=stepVehicleFeedback(kickImpact(newVehicleFeedback(),{x:NaN,z:Infinity},NaN,Infinity),.1,false);expect(bad.scaleX).toBe(1);expect(bad.scaleZ).toBe(1);
 });
 it('gives meaningful fast crashes stronger squash, never animates an idle impact',()=>{
  const slow=stepVehicleFeedback(kickImpact(newVehicleFeedback(),{x:0,z:-1},0,4),.04,false),fast=stepVehicleFeedback(kickImpact(newVehicleFeedback(),{x:0,z:-1},0,22),.04,false);
  expect(fast.scaleZ).toBeLessThan(slow.scaleZ);expect(kickImpact(newVehicleFeedback(),{x:0,z:-1},0,0)).toEqual(newVehicleFeedback());
 });
 it('kicks confirmed shots backwards with bounded rapid settling and obeys motion reduction/reset',()=>{
  let state=stepVehicleFeedback(kickRecoil(newVehicleFeedback()),.01,false);expect(state.offsetZ).toBeLessThan(-.03);expect(Math.abs(state.offsetZ)).toBeLessThan(.18);
  state=stepVehicleFeedback(state,0,false);expect(state.recoilAge).toBe(.01);for(let i=0;i<90;i++)state=stepVehicleFeedback(state,1/60,false);expect(state.offsetZ).toBeCloseTo(0,5);
  const reset=stepVehicleFeedback(kickImpact(kickRecoil(newVehicleFeedback()),{x:0,z:-1},0,22),.02,true);expect(reset).toEqual(newVehicleFeedback());
 });
});
