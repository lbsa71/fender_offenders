import { expect, it } from 'vitest';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import { InputController } from '@fender/input';
import { newDriver, predictVehicle } from '@fender/sim';
import type { CollisionMap, VehicleState } from '@fender/contracts';
import * as projection from '../../packages/renderer/src/target-projection';

const map:CollisionMap={id:'directional',revision:'directional',bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},colliders:[],surfaces:[],spawns:[],laneNodes:[],laneEdges:[]};
it.each([0,Math.PI/2,Math.PI,-Math.PI/2])('a held direction converges through real car physics from heading %s',yaw=>{
  const input=new InputController({controlScheme:'touch'});input.setEnabled(true);
  input.touch({driveX:1,driveY:0,handbrake:false,fire:false,siren:false,recover:false});
  let vehicle:VehicleState={entityId:'officer',playerId:'officer',bodyAssetId:'patrol',pose:{x:0,z:0,yaw},velocity:{x:0,z:0,yawRate:0},health:100,status:'active',protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0},driver=newDriver();
  for(let tick=0;tick<480;tick++){
    const actions=input.sample(tick*1000/60,vehicle.pose.yaw);
    ({vehicle,driver}=predictVehicle(map,vehicle,driver,actions));
    if(tick===0)expect(Math.abs(vehicle.pose.yaw-yaw),'Direction input must not teleport the heading').toBeLessThan(.02);
  }
  expect(Math.sin(vehicle.pose.yaw),'The car must keep heading right, not keep rotating').toBeGreaterThan(.99);
  expect(vehicle.velocity.x).toBeGreaterThan(2);expect(Math.abs(vehicle.velocity.z)).toBeLessThan(2);
});
it.each([[740,580],[375,667],[667,290]])('camera mapping keeps cardinal and diagonal pulls aligned with pixels at %s x %s',(width,height)=>{
  expect(projection).toHaveProperty('screenDirectionToHeading',expect.any(Function));
  const view=Matrix.LookAtRH(new Vector3(8,43,-36),new Vector3(0,0,4),Vector3.Up());
  const transform=view.multiply(Matrix.PerspectiveFovRH(.69,width/height,.5,330)),viewport=new Viewport(0,0,width,height);
  for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
    const yaw=projection.screenDirectionToHeading(transform.m,{x:0,z:0},width,height,x!,y!);
    const start=Vector3.Project(Vector3.Zero(),Matrix.Identity(),transform,viewport);
    const end=Vector3.Project(new Vector3(-Math.sin(yaw)*.01,0,Math.cos(yaw)*.01),Matrix.Identity(),transform,viewport);
    const angle=Math.atan2(end.y-start.y,end.x-start.x)-Math.atan2(y!,x!);
    expect(Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))).toBeLessThan(.001);
  }
});
