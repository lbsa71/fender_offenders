import { expect, it } from 'vitest';
import { InputController, type PadState } from './index';
import type { TouchControls } from '@fender/contracts';

const touch=(x:number,y:number)=>({driveX:x,driveY:y,handbrake:false,fire:false,siren:false,recover:false}) as TouchControls;
const pad=(x=0,y=0):PadState=>({id:'Directional pad',index:0,mapping:'standard',connected:true,axes:[x,y],buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
function ready(device:'touch'|'gamepad'){
  const input=new InputController({controlScheme:device});input.setEnabled(true);input.poll([pad()],0);return input;
}
it.each(['touch','gamepad'] as const)('%s points toward the requested screen heading rather than rotating relative to the car',device=>{
  const input=ready(device);
  if(device==='touch')input.touch(touch(1,0));else input.poll([pad(1,0)],16);
  expect(input.sample(16,Math.PI/2)).toMatchObject({steer:0,throttle:1,brakeReverse:0});
  expect(input.sample(32,Math.PI).steer,'Facing down, a rightward request must turn left toward right').toBeLessThan(-.9);
});
it.each(['touch','gamepad'] as const)('%s pulling down drives toward down instead of requesting reverse',device=>{
  const input=ready(device);
  if(device==='touch')input.touch(touch(0,1));else input.poll([pad(0,1)],16);
  expect(input.sample(16,Math.PI)).toMatchObject({steer:0,throttle:1,brakeReverse:0});
  const turn=input.sample(32,0);expect(Math.abs(turn.steer)).toBe(1);expect(turn.throttle).toBeGreaterThan(0);expect(turn.brakeReverse).toBe(0);
});
it.each(['touch','gamepad'] as const)('%s preserves radial precision, has no diagonal boost, and coasts when released',device=>{
  const input=ready(device);
  const set=(x:number,y:number)=>device==='touch'?input.touch(touch(x,y)):input.poll([pad(x,y)],16);
  set(.58,0);expect(input.sample(16,Math.PI/2).throttle).toBeCloseTo(.5);
  set(1,-1);expect(input.sample(32,Math.PI/4).throttle).toBeCloseTo(1);
  set(.1,.1);expect(input.sample(48,0)).toMatchObject({steer:0,throttle:0,brakeReverse:0});
  set(0,0);expect(input.sample(64,0)).toMatchObject({steer:0,throttle:0,brakeReverse:0});
});
it('uses the supplied camera mapping before resolving the shortest turn',()=>{
  const input=ready('touch');input.touch(touch(1,0));
  expect(input.sample(16,-Math.PI/2,()=>-Math.PI/2)).toMatchObject({steer:0,throttle:1});
  expect(input.sample(32,Math.PI-.01,()=>-Math.PI+.01).steer).toBeGreaterThan(0);
  expect(input.sample(48,Math.PI-.01,()=>-Math.PI+.01).steer).toBeLessThan(.1);
});
it.each(['touch','gamepad'] as const)('%s clears the directional request on focus loss and requires fresh input',device=>{
  const input=ready(device);
  if(device==='touch')input.touch(touch(1,0));else input.poll([pad(1,0)],16);
  expect(input.sample(16,Math.PI/2).throttle).toBe(1);
  input.setFocused(false);input.setFocused(true);
  if(device==='gamepad')input.poll([pad(1,0)],32);
  expect(input.sample(32,Math.PI/2)).toMatchObject({steer:0,throttle:0});
});
it('keeps keyboard steering when an idle controller is connected',()=>{
  const input=new InputController();input.setEnabled(true);input.poll([pad()],0);input.key('KeyD',true);
  expect(input.sample(16).steer).toBeGreaterThan(0);
});
it('uses the same radial dead zone for automatic takeover and held-stick focus recovery',()=>{
  const input=new InputController();input.setEnabled(true);input.poll([pad()],0);
  input.poll([pad(.12,-.12)],16);expect(input.device).toBe('gamepad');
  expect(input.sample(16,Math.PI/4).throttle).toBeGreaterThan(0);
  input.setFocused(false);input.setFocused(true);input.poll([pad(.12,-.12)],32);
  expect(input.sample(32,Math.PI/4).throttle).toBe(0);
  input.poll([pad()],48);input.poll([pad(.12,-.12)],64);
  expect(input.sample(64,Math.PI/4).throttle).toBeGreaterThan(0);
});
