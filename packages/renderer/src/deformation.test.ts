import {describe,it,expect} from 'vitest';
import {newCartoonMotion,stepCartoonMotion,crossedRoadBump} from './deformation';
import * as content from '@fender/content';
const straight={speed:0,yawRate:0,bump:false,reducedMotion:false};
describe('deterministic cosmetic vehicle motion',()=>{
  it('authors visible cosmetic humps on straight asphalt, away from all spawn clearances',()=>{
    expect(content).toHaveProperty('ROAD_BUMPS');
    const bumps=Reflect.get(content,'ROAD_BUMPS') as ReadonlyArray<{id:string;x:number;z:number;yaw:number;width:number;length:number;height:number}>;
    expect(bumps.length).toBeGreaterThanOrEqual(4);
    for(const bump of bumps){expect(bump.height).toBeGreaterThan(0);expect(bump.height).toBeLessThan(.3);expect(bump.width).toBeLessThanOrEqual(16);for(const spawn of content.districtMap.spawns)expect(Math.hypot(bump.x-spawn.pose.x,bump.z-spawn.pose.z)).toBeGreaterThan(8);}
  });
  it('stays neutral and silent while stationary, even if yaw input or bump is stale',()=>{
    let state=newCartoonMotion();for(let i=0;i<120;i++)state=stepCartoonMotion(state,{...straight,yawRate:8,bump:true},1/60);
    expect(state.lean).toBe(0);expect(state.scaleY).toBe(1);expect(state.heave).toBe(0);expect(state.cue).toBeNull();
  });
  it('heels and squashes into a moving corner with finite bounded deformation at extreme speeds',()=>{
    let state=newCartoonMotion();for(let i=0;i<60;i++)state=stepCartoonMotion(state,{...straight,speed:50,yawRate:20},1/60);
    expect(state.lean).toBeGreaterThan(.2);expect(state.scaleX).toBeGreaterThan(1.08);expect(state.scaleY).toBeLessThan(.95);
    expect(state.lean).toBeLessThanOrEqual(.32);expect(state.scaleY).toBeGreaterThanOrEqual(.68);expect(state.scaleX).toBeLessThanOrEqual(1.3);
  });
  it('settles naturally back to neutral after a turn and emits one squeak until steering straightens',()=>{
    let state=newCartoonMotion(),squeaks=0;
    for(let i=0;i<180;i++){state=stepCartoonMotion(state,{...straight,speed:20,yawRate:1.5},1/60);if(state.cue==='squeak')squeaks++;}
    expect(squeaks).toBe(1);
    for(let i=0;i<180;i++)state=stepCartoonMotion(state,straight,1/60);
    expect(Math.abs(state.lean)).toBeLessThan(.0001);expect(state.scaleY).toBeCloseTo(1,4);
  });
  it('compresses, stretches and rebounds from one moving bump, then settles without replaying sound',()=>{
    let state=stepCartoonMotion(newCartoonMotion(),{...straight,speed:18,bump:true},.05);
    expect(state.scaleY).toBeLessThan(.95);expect(state.cue).toBe('boing');
    state=stepCartoonMotion(state,{...straight,speed:18},.1);state=stepCartoonMotion(state,{...straight,speed:18},.05);
    expect(state.scaleY).toBeGreaterThan(1.1);expect(state.heave).toBeGreaterThan(.2);
    expect(stepCartoonMotion(state,{...straight,speed:18,bump:true},0).cue).toBeNull();
    for(let i=0;i<90;i++)state=stepCartoonMotion(state,straight,1/60);
    expect(state.heave).toBe(0);expect(state.scaleY).toBeCloseTo(1,5);expect(state.cue).toBeNull();
  });
  it('makes a faster crossing more expressive and rate limits repeated bump flags',()=>{
    const slow=stepCartoonMotion(newCartoonMotion(),{...straight,speed:4,bump:true},.05);
    const fast=stepCartoonMotion(newCartoonMotion(),{...straight,speed:22,bump:true},.05);
    expect(fast.scaleY).toBeLessThan(slow.scaleY);
    let state=newCartoonMotion(),boings=0;for(let i=0;i<30;i++){state=stepCartoonMotion(state,{...straight,speed:22,bump:true},1/60);if(state.cue==='boing')boings++;}
    expect(boings).toBe(1);
  });
  it('disables deformation and novelty cues with reduced motion',()=>{
    let state=newCartoonMotion();for(let i=0;i<60;i++)state=stepCartoonMotion(state,{speed:30,yawRate:5,bump:true,reducedMotion:true},1/60);
    expect(state.lean).toBe(0);expect(state.scaleX).toBe(1);expect(state.scaleY).toBe(1);expect(state.heave).toBe(0);expect(state.cue).toBeNull();
  });
  it('detects actual authored hump crossings, including rotated roads, without stationary/replay/teleport triggers',()=>{
    const bump={id:'hump',x:0,z:0,yaw:0,width:14,length:1.4,height:.18};
    expect(crossedRoadBump({x:4,z:-1},{x:4,z:1},bump)).toBe(true);
    expect(crossedRoadBump({x:4,z:1},{x:4,z:1},bump)).toBe(false);
    expect(crossedRoadBump({x:10,z:-1},{x:10,z:1},bump)).toBe(false);
    expect(crossedRoadBump({x:4,z:-40},{x:4,z:40},bump)).toBe(false);
    expect(crossedRoadBump({x:-1,z:4},{x:1,z:4},{...bump,yaw:Math.PI/2})).toBe(true);
  });
});
