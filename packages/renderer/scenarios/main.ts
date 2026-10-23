import {createGameRenderer} from '../src/index';
import {MotorAudio} from '../src/audio';
import {EngineStore} from '@babylonjs/core/Engines/engineStore';
import type {RenderFrame,VehicleState} from '@fender/contracts';
const cues:string[]=[];const audioLog:Array<{kind:string;strength?:number;volumeScale?:number}>=[];
const audioProto=MotorAudio.prototype as any;for(const method of ['crash','effect']){const original=audioProto[method];audioProto[method]=function(kind:string|number,volumeScale=1,...rest:unknown[]){audioLog.push(method==='crash'?{kind:'crash',strength:kind as number,volumeScale}:{kind:kind as string,volumeScale});original?.call(this,kind,volumeScale,...rest);};}
const proto=MotorAudio.prototype as unknown as {cartoon?:(kind:string)=>void};const original=proto.cartoon;
proto.cartoon=function(kind:string){cues.push(kind);original?.call(this,kind);};
const canvas=document.querySelector('canvas')!;
const renderer=createGameRenderer(canvas,undefined,{muted:false});const gameScene=EngineStore.LastCreatedScene!;
const car=(id:string,body:string,x:number,z:number):VehicleState=>({entityId:id,playerId:id,bodyAssetId:body,pose:{x,z,yaw:0},velocity:{x:0,z:0,yawRate:0},health:100,status:'active',protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0});
const frame:RenderFrame={sampleTimeSeconds:10,localEntityId:'hero',vehicles:[car('hero','patrol',4,-43),car('peer','army',-4,-30)],projectiles:[],cameraTarget:{x:4,z:-40,yaw:0}};
let running=true,previous=performance.now();
function loop(now:number){if(running)renderer.render(frame,Math.min(.05,(now-previous)/1000));previous=now;requestAnimationFrame(loop);}requestAnimationFrame(loop);
document.querySelector('button')!.onclick=()=>renderer.unlockAudio();
Object.assign(window,{fixture:{renderer,frame,cues,audioLog,gameScene,pause:()=>running=false,step:(dt=1/60)=>renderer.render(frame,dt),state:(id='hero')=>{const root=gameScene.getTransformNodeByName(`vehicle-${id}`)!,body=gameScene.getTransformNodeByName(`body-${id}`)!,suspension=gameScene.getTransformNodeByName(`suspension-${id}`)!;return{markerVisible:gameScene.getMeshByName(id+'-marker')?.isVisible,root:{x:root.position.x,z:root.position.z,scaleY:root.scaling.y},wheelScale:root.getChildMeshes().find(m=>(m as any).sourceMesh?.metadata?.role==='wheel')?.scaling.x,healthY:gameScene.getMeshByName(id+'-health')!.position.y,body:{scaleX:body.scaling.x,scaleY:body.scaling.y,scaleZ:body.scaling.z,offsetZ:body.position.z,lean:body.rotation.z},heave:suspension.position.y,paint:root.getChildMeshes().filter(m=>m.material?.name.startsWith('paint-')).map(m=>m.material!.name),healthScale:gameScene.getMeshByName(`${id}-health`)!.scaling.x};}}});
