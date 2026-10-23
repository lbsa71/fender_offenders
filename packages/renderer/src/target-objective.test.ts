import {afterEach,beforeEach,expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector';
import type {RenderFrame,VehicleState} from '@fender/contracts';
import {TargetObjective,TARGET_ANCHOR_HEIGHT} from './target-objective';
let engine:NullEngine,scene:Scene,objective:TargetObjective,frame:RenderFrame;
const car=(id:string,x:number,z:number):VehicleState=>({entityId:id,playerId:id,bodyAssetId:'patrol',pose:{x,z,yaw:0},velocity:{x:0,z:0,yawRate:0},health:100,status:'active',protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0});
beforeEach(()=>{engine=new NullEngine();scene=new Scene(engine);scene.useRightHandedSystem=true;const camera=new FreeCamera('camera',new Vector3(0,40,-40),scene);camera.setTarget(Vector3.Zero());scene.activeCamera=camera;objective=new TargetObjective(scene);frame={sampleTimeSeconds:0,localEntityId:'hero',vehicles:[car('hero',0,0),car('suspect',3,4)],projectiles:[],cameraTarget:null,pursuit:{state:'chasing',suspectId:'suspect',progress:0,elapsedTicks:0}};});
afterEach(()=>{objective.dispose();scene.dispose();engine.dispose();});
it('keeps one distinctive fixed-resource marker on the sampled suspect including wreck/teleport',()=>{
 objective.update(frame,1,true);const root=scene.getTransformNodeByName('wanted-objective-root');expect(root?.isEnabled()).toBe(true);expect(root?.position.x).toBe(-3);expect(root?.position.z).toBe(4);
 const meshes=scene.meshes.length,materials=scene.materials.length;
 for(let i=0;i<100;i++){frame.vehicles[1]!.pose.x=i;frame.vehicles[1]!.pose.z=-i;frame.vehicles[1]!.discontinuityId++;frame.vehicles[1]!.status='wrecked';objective.update(frame,i,true);}
 expect(root?.position.x).toBe(-99);expect(root?.position.z).toBe(-99);expect(scene.meshes.length).toBe(meshes);expect(scene.materials.length).toBe(materials);expect(meshes).toBeLessThanOrEqual(4);
});
it('projects above the car through the actual current scene matrix and reports local distance',()=>{
 objective.update(frame,1,true);scene.setTransformMatrix(scene.activeCamera!.getViewMatrix(),scene.activeCamera!.getProjectionMatrix());objective.project(1000,800);const p=objective.getIndicator();expect(p).not.toBeNull();expect(p!.distanceMeters).toBe(5);expect(p!.offscreen).toBe(false);
 const expected=Vector3.Project(new Vector3(-3,TARGET_ANCHOR_HEIGHT,4),Matrix.Identity(),scene.getTransformMatrix(),scene.activeCamera!.viewport.toGlobal(1000,800));expect(p!.x).toBeCloseTo(expected.x/1000,6);expect(p!.y).toBeCloseTo(expected.y/800,6);
});
it('hides complete/missing/absent pursuits, garage reset and disposed marker',()=>{
 objective.update(frame,1,true);objective.hide();expect(scene.getTransformNodeByName('wanted-objective-root')?.isEnabled()).toBe(false);expect(objective.getIndicator()).toBeNull();
 for(const pursuit of [{...frame.pursuit!,state:'complete' as const},{...frame.pursuit!,suspectId:'missing'},undefined]){frame.pursuit=pursuit;objective.update(frame,1,true);expect(scene.getTransformNodeByName('wanted-objective-root')?.isEnabled()).toBe(false);expect(objective.getIndicator()).toBeNull();}
 objective.dispose();objective.project(1000,800);expect(objective.getIndicator()).toBeNull();expect(scene.getTransformNodeByName('wanted-objective-root')).toBeNull();
});
it('has steady colors and no movement when motion is reduced',()=>{
 objective.update(frame,1,true);const root=scene.getTransformNodeByName('wanted-objective-root');expect(root).not.toBeNull();const positions=scene.meshes.map(m=>m.position.asArray()),colors=scene.materials.map(m=>(m as any).emissiveColor?.asArray());objective.update(frame,9,true);expect(scene.meshes.map(m=>m.position.asArray())).toEqual(positions);expect(scene.materials.map(m=>(m as any).emissiveColor?.asArray())).toEqual(colors);
});
it('hides an absent respawning car while preserving a wrecked target marker',()=>{
 objective.update(frame,1,true);frame.vehicles[1]!.status='respawning';objective.update(frame,2,true);expect(scene.getTransformNodeByName('wanted-objective-root')!.isEnabled()).toBe(false);expect(objective.getIndicator()).toBeNull();frame.vehicles[1]!.status='wrecked';objective.update(frame,3,true);expect(scene.getTransformNodeByName('wanted-objective-root')!.isEnabled()).toBe(true);
});
