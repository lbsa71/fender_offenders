import { createGameRenderer } from '../../packages/renderer/src/index';
import { districtMap } from '../../packages/content/src/index';
import type { RenderFrame, VehicleState } from '../../packages/contracts/src/index';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { Matrix,Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
const canvas=document.querySelector<HTMLCanvasElement>('canvas')!;
const renderer=createGameRenderer(canvas,districtMap,{muted:true});
function car(entityId:string,x:number,z:number,yaw:number,bodyAssetId:string,playerId:string|null):VehicleState{return{entityId,pose:{x,z,yaw},bodyAssetId,playerId,velocity:{x:0,z:0,yawRate:0},health:100,status:'active',protectedUntilTick:0,respawnAtTick:null,sirenOn:true,discontinuityId:0};}
const frame:RenderFrame={sampleTimeSeconds:5,localEntityId:'hero',cameraTarget:{x:4,z:-40,yaw:0},vehicles:[car('hero',4,-43,0,'patrol','local'),car('rival',4,-23,Math.PI,'interceptor','rival'),car('roadster',-4,-32,Math.PI,'roadster','friend'),car('traffic-a',-76,-30,0,'traffic',null),car('traffic-b',31,-76,Math.PI/2,'traffic',null)],projectiles:[]};
let previous=performance.now();function draw(now:number){renderer.render(frame,(now-previous)/1000);previous=now;requestAnimationFrame(draw);}requestAnimationFrame(draw);
addEventListener('resize',()=>renderer.resize());
Object.assign(window,{artFixture:{renderer,frame,setCamera:(x:number,z:number,distance=1)=>{frame.cameraTarget={x,z,yaw:0};renderer.setSettings({cameraDistance:distance});},stats:()=>renderer.getStats(),sampleGroundAt:(x:number,z:number)=>EngineStore.LastCreatedScene!.pickWithRay(new Ray(new Vector3(-x,100,z),new Vector3(0,-1,0),120),(mesh)=>mesh.name.startsWith('city-'))?.pickedMesh?.material?.name,projectVehicle:(entityId:string)=>{const scene=EngineStore.LastCreatedScene!,root=scene.getTransformNodeByName(`vehicle-${entityId}`)!;root.computeWorldMatrix(true);const viewport=scene.activeCamera!.viewport.toGlobal(scene.getEngine().getRenderWidth(),scene.getEngine().getRenderHeight());const project=(point:Vector3)=>{const p=Vector3.Project(Vector3.TransformCoordinates(point,root.getWorldMatrix()),Matrix.Identity(),scene.getTransformMatrix(),viewport);return{x:p.x,y:p.y};};return{center:project(Vector3.Zero()),nose:project(new Vector3(0,0,2))};}}});
