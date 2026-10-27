import { expect, it } from 'vitest';
import { getDispatchFeatures, VEHICLE_BODIES, type CollisionMap, type DriverActions, type VehicleState } from '@fender/contracts';
import { driveVehicle, newDriver, neutralActions } from './controller';

const map: CollisionMap = { id:'ice-test',revision:'ice-test',bounds:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000},colliders:[],surfaces:[],spawns:[],laneNodes:[],laneEdges:[] };
const frozenMap: CollisionMap = {...map,wetSurfaces:[{id:'frozen-puddle',polygonXZ:[-500,-500,500,-500,500,500,-500,500]}]};
const car = (bodyAssetId='patrol',playerId:string|null='officer'):VehicleState => ({entityId:'test-car',playerId,bodyAssetId,pose:{x:0,z:0,yaw:0},velocity:{x:4,z:20,yawRate:0},health:100,status:'active',protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0});
function run(stage:number,frozen=false,steps=15,actions:DriverActions=neutralActions(),body='patrol',playerId:string|null='officer',lateral=4) {
 const vehicle=car(body,playerId),driver=newDriver();
 vehicle.velocity.x=lateral;
 for(let tick=1;tick<=steps;tick++){driver.simulatedTick=tick;driveVehicle(vehicle,driver,actions,frozen?frozenMap:map,[],undefined,undefined,getDispatchFeatures(stage));}
 return vehicle;
}
it('retains pronounced sideways momentum once a drift has started, with frozen puddles even slicker',()=>{
 const drift=(stage:number,frozen=false)=>run(stage,frozen,15,neutralActions(),'patrol','officer',6);
 const dry=drift(7),snow=drift(8),ice=drift(8,true);
 expect(snow.velocity.x).toBeGreaterThan(dry.velocity.x+1.5);
 expect(ice.velocity.x).toBeGreaterThan(snow.velocity.x+.35);
 expect(drift(7,true).velocity.x).toBeLessThan(snow.velocity.x);
});

it('recovers a small steering slip while keeping less grip than a dry road',()=>{
 const dry=run(7),snow=run(8);expect(snow.velocity.x).toBeGreaterThan(dry.velocity.x);expect(snow.velocity.x).toBeLessThan(1.5);
});

it.each(VEHICLE_BODIES)('lets %s make an ordinary snowy intersection turn at 10 m/s without sliding off the far curb',body=>{
 for(const direction of [-1,1]){
  const vehicle=car(body),driver=newDriver();vehicle.pose={x:0,z:-10,yaw:0};vehicle.velocity={x:0,z:10,yawRate:0};
  for(let tick=0;tick<360;tick++){
   const error=Math.atan2(Math.sin(direction*Math.PI/2-vehicle.pose.yaw),Math.cos(direction*Math.PI/2-vehicle.pose.yaw));
   const forward=vehicle.velocity.x*Math.sin(vehicle.pose.yaw)+vehicle.velocity.z*Math.cos(vehicle.pose.yaw);
   driveVehicle(vehicle,driver,{...neutralActions(),steer:Math.max(-1,Math.min(1,error*2)),throttle:Math.max(0,Math.min(1,(10-forward)*.2))},map,[],undefined,undefined,getDispatchFeatures(8));
   expect(vehicle.pose.z,'A 16 m carriageway must leave room for the car after a normal corner').toBeLessThan(6);
  }
  expect(Math.abs(vehicle.pose.z)).toBeLessThan(6);expect(direction*vehicle.pose.x).toBeGreaterThan(25);expect(vehicle.pose.yaw).toBeCloseTo(direction*Math.PI/2,1);
 }
});
it.each(VEHICLE_BODIES)('greatly lengthens braking distance for %s, and lengthens it again on frozen puddles',body=>{
 const stop=(stage:number,frozen:boolean)=>{const vehicle=car(body),driver=newDriver();vehicle.velocity.x=0;for(let tick=1;tick<=600&&vehicle.velocity.z>1;tick++){driver.simulatedTick=tick;driveVehicle(vehicle,driver,{...neutralActions(),brakeReverse:1},frozen?frozenMap:map,[],undefined,undefined,getDispatchFeatures(stage));}expect(vehicle.velocity.z).toBeLessThanOrEqual(1);return vehicle.pose.z;};
 const dry=stop(7,false),snow=stop(8,false),ice=stop(8,true);expect(snow).toBeGreaterThan(dry*2);expect(ice).toBeGreaterThan(snow*1.3);
});
it('applies the same ice handling to suspects and officers and thaws on the next dispatch',()=>{
 expect(run(8,true,15,neutralActions(),'patrol',null).velocity).toEqual(run(8,true).velocity);
 expect(run(9).velocity).toEqual(run(7).velocity);
 const slide=run(8,true),control=structuredClone(slide),driver=newDriver();slide.pose.x=control.pose.x=700;
 driveVehicle(slide,driver,neutralActions(),frozenMap,[],undefined,undefined,getDispatchFeatures(8));
 driveVehicle(control,newDriver(),neutralActions(),map,[],undefined,undefined,getDispatchFeatures(8));expect(slide).toEqual(control);
});
