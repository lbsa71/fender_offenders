import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Engine } from '@babylonjs/core/Engines/engine';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from './primitives';
import { districtMap, districtScene, ROAD_BUMPS } from '@fender/content';
import { getVehicleProfile, type CollisionMap, type GameEvent, type RenderFrame, type SceneManifest } from '@fender/contracts';
import { MotorAudio } from './audio';
import { buildCity } from './city';
import { CarFactory, updateCarStatus, type CarVisual } from './cars';
import {crossedRoadBump,newCartoonMotion,stepCartoonMotion} from './deformation';
import {createGaragePreview,type GaragePreview} from './garage';
import {newVehicleFeedback,kickImpact,kickRecoil,stepVehicleFeedback} from './feedback';
import {CombatEffects} from './combat-effects';

export interface RendererSettings {
  quality: 'low' | 'medium' | 'high'; masterVolume: number; effectsVolume: number;
  muted: boolean; reducedShake: boolean; reducedFlash: boolean;
  cameraDistance: number; cameraLookAhead: number; cameraSmoothing: number;
}
export type RendererOptions = Partial<RendererSettings>;
interface Particle { mesh: Mesh; vx:number;vy:number;vz:number;life:number;duration:number;size:number }
const defaults:RendererSettings={quality:'high',masterVolume:.65,effectsVolume:.75,muted:false,reducedShake:false,reducedFlash:false,cameraDistance:1,cameraLookAhead:1,cameraSmoothing:6};

export function createGameRenderer(canvas:HTMLCanvasElement,map:CollisionMap=districtMap,options:RendererOptions={}) {
  const settings:RendererSettings={...defaults,...options};
  const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance'},true);
  engine.setHardwareScalingLevel(Math.max(1,(window.devicePixelRatio||1)/Math.min(window.devicePixelRatio||1,settings.quality==='low'?1:1.5)));
  const scene=new Scene(engine);scene.useRightHandedSystem=true;
  scene.clearColor=Color4.FromHexString('#b8d1ceff');scene.ambientColor=Color3.FromHexString('#bdcbb7');
  scene.fogMode=Scene.FOGMODE_LINEAR;scene.fogColor=Color3.FromHexString('#b8d1ce');scene.fogStart=110;scene.fogEnd=235;
  scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure=1;scene.imageProcessingConfiguration.contrast=1.1;
  const camera=new FreeCamera('district-camera',new Vector3(4,41,-78),scene);camera.setTarget(new Vector3(4,0,-43));camera.fov=.69;camera.minZ=.5;camera.maxZ=330;scene.activeCamera=camera;
  const hemi=new HemisphericLight('sky',new Vector3(0,1,0),scene);hemi.intensity=.7;hemi.diffuse=Color3.FromHexString('#d4e4df');hemi.groundColor=Color3.FromHexString('#8c9c82');
  const sun=new DirectionalLight('afternoon-sun',new Vector3(-.65,-1,.45),scene);sun.position.set(60,100,-50);sun.intensity=1.2;sun.diffuse=Color3.FromHexString('#ffe1ad');
  sun.shadowMinZ=1;sun.shadowMaxZ=220;sun.autoCalcShadowZBounds=true;
  const shadows=new ShadowGenerator(settings.quality==='low'?512:2048,sun);shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;shadows.bias=.003;shadows.normalBias=.18;shadows.darkness=.23;
  const city=buildCity(scene);
  // Shared driving coordinates use +Z front, +X right, positive yaw right.
  // Reflect X once at this adapter boundary to preserve that convention in Babylon RHS.
  const mapRoot=new TransformNode('map-coordinate-adapter',scene);mapRoot.scaling.x=-1;
  for(const m of scene.meshes){m.unfreezeWorldMatrix();m.parent=mapRoot;m.freezeWorldMatrix();}
  for(const m of city)if(m.getBoundingInfo().boundingBox.maximumWorld.y>3)shadows.addShadowCaster(m);
  shadows.getShadowMap()!.refreshRate=1;
  const factory=new CarFactory(scene),cars=new Map<string,CarVisual>(),audio=new MotorAudio(),combat=new CombatEffects(scene);
  const prefersReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let garage:GaragePreview|null=null,garageBody:string|null=null;
  const effectMaterial=(name:string,color:string,emissive=false)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(0,0,0);if(emissive)m.emissiveColor=m.diffuseColor;return m;};
  const spark=effectMaterial('spark','#ffe0a0',true),smoke=effectMaterial('smoke','#798882'),fire=effectMaterial('fire','#f26932',true),skid=effectMaterial('skid','#354a4f');
  const particles:Particle[]=Array.from({length:96},(_,i)=>{const mesh=MeshBuilder.CreateIcoSphere(`pooled-effect-${i}`,{radius:1,subdivisions:0},scene);mesh.material=spark;mesh.isVisible=false;return{mesh,vx:0,vy:0,vz:0,life:0,duration:1,size:1};});
  const marks=Array.from({length:128},(_,i)=>{const mesh=MeshBuilder.CreateBox(`pooled-skid-${i}`,{width:.2,height:.012,depth:.85},scene);mesh.material=skid;mesh.isVisible=false;return{mesh,life:0};});
  let markIndex=0,particleIndex=0,time=0,shake=0,disposed=false,lastSmoke=0,lastSkid=0,lastFrame:RenderFrame|null=null,frameCpuMs=0,frameDrawCalls=0;
  const seen=new Set<string>(),eventQueue:string[]=[],retiredMatches:string[]=[];let activeMatch:string|null=null;
  const target=new Vector3(4,0,-43),desired=new Vector3(),eye=new Vector3();
  function emit(x:number,y:number,z:number,count:number,type:'spark'|'smoke'|'fire') {
    const cap=settings.reducedFlash?Math.min(count,4):count;
    for(let i=0;i<cap;i++){
      const p=particles[particleIndex++%particles.length]!;
      p.mesh.position.set(x,y,z);p.mesh.material=type==='spark'?spark:type==='fire'?fire:smoke;
      p.size=type==='spark'?.1:type==='fire'?.45:.35;p.duration=type==='spark'?.2+Math.random()*.3:type==='fire'?.5+Math.random()*.4:1.1;
      p.life=p.duration;const angle=Math.random()*Math.PI*2;const speed=type==='smoke'?1:2+Math.random()*5;
      p.vx=Math.sin(angle)*speed;p.vz=Math.cos(angle)*speed;p.vy=type==='spark'?2+Math.random()*5:type==='fire'?4:2.4;p.mesh.isVisible=true;
    }
  }
  function resetCombatPresentation():void{
    combat.reset();shake=0;
    for(const p of particles){p.life=0;p.mesh.isVisible=false;}
    for(const mark of marks){mark.life=0;mark.mesh.isVisible=false;}
    for(const car of cars.values()){car.feedback=newVehicleFeedback();car.lastCrashAt=-10;car.lastCrashTick=-1;}
  }
  function removeCar(v:CarVisual){for(const p of v.parts)shadows.removeShadowCaster(p);v.root.dispose(false);}
  function setGaragePreview(bodyAssetId:string|null):void{
    if(disposed)return;
    const selected=bodyAssetId===null?null:getVehicleProfile(bodyAssetId).id;
    if(selected===garageBody)return;
    if(selected&&garageBody===null){activeMatch=null;retiredMatches.length=0;seen.clear();eventQueue.length=0;resetCombatPresentation();}
    garageBody=selected;
    if(selected){garage??=createGaragePreview(engine,settings.quality);garage.setBody(selected);}else garage?.setBody(null);
  }
  function setSettings(next:RendererOptions):void{
    Object.assign(settings,next);audio.volume=Math.max(0,Math.min(1,settings.masterVolume*settings.effectsVolume));audio.muted=settings.muted;
    scene.shadowsEnabled=settings.quality!=='low';garage?.setQuality(settings.quality);engine.setHardwareScalingLevel(Math.max(1,(window.devicePixelRatio||1)/Math.min(window.devicePixelRatio||1,settings.quality==='low'?1:1.5)));
  }
  setSettings(options);
  function render(frame:RenderFrame,dt:number):void{
    if(disposed)return;const cpuStart=performance.now();lastFrame=frame;dt=Math.min(Math.max(dt,0),.1);time+=dt;
    const reducedMotion=settings.reducedShake||prefersReducedMotion.matches;
    if(garageBody&&garage){
      audio.update(0,false,time,false);garage.update(dt,reducedMotion);
      const drawStart=engine._drawCalls.current;engine.beginFrame();garage.scene.render();engine.endFrame();frameCpuMs=performance.now()-cpuStart;frameDrawCalls=engine._drawCalls.current-drawStart;return;
    }
    const active=new Set<string>();let cameraJump=false;
    for(const v of frame.vehicles){
      active.add(v.entityId);let car=cars.get(v.entityId);
      if(car&&(car.bodyAssetId!==v.bodyAssetId||car.traffic!==(v.playerId===null))){removeCar(car);cars.delete(v.entityId);car=undefined;}
      if(!car){car=factory.create(v.entityId,v.bodyAssetId,v.playerId===null);cars.set(v.entityId,car);for(const part of car.parts)shadows.addShadowCaster(part);}
      const speed=Math.hypot(v.velocity.x,v.velocity.z),isLocal=v.entityId===frame.localEntityId;
      const discontinuity=car.discontinuity!==v.discontinuityId;
      if(isLocal&&discontinuity)cameraJump=true;
      if(discontinuity){car.motion=newCartoonMotion();car.feedback=newVehicleFeedback();car.lastBumpId=null;car.lastCrashAt=-10;car.lastCrashTick=-1;}
      let bump=false;
      if(!discontinuity&&v.status==='active'&&speed>2)for(const hump of ROAD_BUMPS){
        if((car.lastBumpId!==hump.id||time-car.lastBumpAt>1.5)&&crossedRoadBump({x:car.previousX,z:car.previousZ},v.pose,hump)){bump=true;car.lastBumpId=hump.id;car.lastBumpAt=time;break;}
      }
      car.motion=stepCartoonMotion(car.motion,{speed:v.status==='active'?speed:0,yawRate:v.velocity.yawRate,bump,reducedMotion},dt);
      car.root.position.set(-v.pose.x,.03,v.pose.z);car.root.rotation.set(0,-v.pose.yaw,0);car.root.scaling.x=-1;
      car.suspension.position.y=car.motion.heave;car.suspension.rotation.x=car.motion.pitch;
      car.feedback=stepVehicleFeedback(car.feedback,dt,reducedMotion);
      car.body.position.set(car.feedback.offsetX,0,car.feedback.offsetZ);car.body.rotation.set(car.feedback.pitch,0,car.motion.lean+car.feedback.roll);
      car.body.scaling.set(Math.max(.6,Math.min(1.4,car.motion.scaleX*car.feedback.scaleX)),Math.max(.65,Math.min(1.35,car.motion.scaleY*car.feedback.scaleY)),Math.max(.6,Math.min(1.4,car.motion.scaleZ*car.feedback.scaleZ)));
      if(isLocal&&car.motion.cue)audio.cartoon(car.motion.cue);
      car.root.setEnabled(v.status!=='respawning');
      const healthRatio=Math.max(0,Math.min(1,v.health/Math.max(1,v.maxHealth??getVehicleProfile(v.bodyAssetId).maxHealth)));
      car.health.scaling.x=Math.max(.01,healthRatio);car.health.position.x=-(1-healthRatio);
      car.health.rotation.y=v.pose.yaw;car.healthBack.rotation.y=v.pose.yaw;
      car.health.isVisible=!isLocal&&v.playerId!==null;car.healthBack.isVisible=car.health.isVisible;
      const protectedSpawn=v.protectedUntilTick>frame.sampleTimeSeconds*60;
      car.marker.isVisible=isLocal||protectedSpawn;car.marker.scaling.setAll(1+Math.sin(time*3)*.025);
      updateCarStatus(car,protectedSpawn,time,settings.reducedFlash);
      if(car.sirenRed)car.sirenRed.isVisible=car.sirenRed.isVisible&&v.sirenOn&&(settings.reducedFlash||Math.sin(time*17)>0);
      if(car.sirenBlue)car.sirenBlue.isVisible=car.sirenBlue.isVisible&&v.sirenOn&&(settings.reducedFlash||Math.sin(time*17)<=0);
      if(time-lastSmoke>.12&&healthRatio<.4&&v.status!=='respawning')emit(-v.pose.x,1.5,v.pose.z,1,'smoke');
      if(time-lastSkid>.055&&speed>9&&Math.abs(v.velocity.yawRate)>.55){
        for(const side of [-1,1]){const mark=marks[markIndex++%marks.length]!;mark.mesh.position.set(-(v.pose.x+Math.cos(v.pose.yaw)*side*.78-Math.sin(v.pose.yaw)*1.3),.047,v.pose.z-Math.sin(v.pose.yaw)*side*.78-Math.cos(v.pose.yaw)*1.3);mark.mesh.rotation.y=-v.pose.yaw;mark.mesh.isVisible=true;mark.life=8;}
      }
      car.previousX=v.pose.x;car.previousZ=v.pose.z;car.previousYaw=v.pose.yaw;car.discontinuity=v.discontinuityId;
      if(isLocal)audio.update(speed,v.sirenOn,time,v.status==='active');
    }
    if(!frame.localEntityId)audio.update(0,false,time,false);
    if(time-lastSmoke>.12)lastSmoke=time;if(time-lastSkid>.055)lastSkid=time;
    for(const [id,car]of cars)if(!active.has(id)){removeCar(car);cars.delete(id);}
    combat.renderProjectiles(frame.projectiles);combat.update(dt,settings.reducedFlash);
    for(const p of particles)if(p.life>0){p.life-=dt;p.mesh.isVisible=p.life>0;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.vy-=p.mesh.material===smoke?-.3*dt:9*dt;const f=Math.max(0,p.life/p.duration);p.mesh.scaling.setAll(p.size*(p.mesh.material===smoke?2-f:f));p.mesh.visibility=f;}
    for(const mark of marks)if(mark.life>0){mark.life-=dt;mark.mesh.isVisible=mark.life>0;mark.mesh.visibility=Math.min(1,mark.life);}
    const local=frame.vehicles.find((v)=>v.entityId===frame.localEntityId);
    const pose=frame.cameraTarget??local?.pose;
    if(pose){const vx=local?.velocity.x??0,vz=local?.velocity.z??0;desired.set(-(pose.x+vx*.45*settings.cameraLookAhead),0,pose.z+vz*.45*settings.cameraLookAhead);}
    else desired.set(7+Math.sin(time*.07)*9,0,-29+Math.cos(time*.07)*9);
    Vector3.LerpToRef(target,desired,cameraJump?1:1-Math.exp(-Math.max(1,settings.cameraSmoothing)*dt),target);
    const distance=Math.max(.75,Math.min(1.6,settings.cameraDistance));eye.set(target.x+8*distance,target.y+43*distance,target.z-36*distance);
    if(shake>0){if(!reducedMotion){eye.x+=(Math.random()-.5)*shake;eye.z+=(Math.random()-.5)*shake;}shake=Math.max(0,shake-dt*3);}
    camera.position.copyFrom(eye);camera.setTarget(new Vector3(target.x,0,target.z+4));
    const drawStart=engine._drawCalls.current;engine.beginFrame();scene.render();engine.endFrame();frameCpuMs=performance.now()-cpuStart;frameDrawCalls=engine._drawCalls.current-drawStart;
  }
  function combatVolume(position:{x:number;z:number},ownShot=false):number{
    if(ownShot)return 1;
    const local=lastFrame?.vehicles.find(v=>v.entityId===lastFrame?.localEntityId);if(!local)return 0;
    const distance=Math.hypot(position.x-local.pose.x,position.z-local.pose.z);return Math.max(0,1-distance/45)**1.4;
  }
  function present(events:GameEvent[]):void{
    if(disposed)return;
    for(const event of events){
      if(retiredMatches.includes(event.matchId))continue;
      if(activeMatch!==event.matchId){
        if(activeMatch){retiredMatches.push(activeMatch);if(retiredMatches.length>4)retiredMatches.shift();}
        activeMatch=event.matchId;resetCombatPresentation();
      }
      const key=`${event.matchId}:${event.eventId}`;if(seen.has(key))continue;seen.add(key);eventQueue.push(key);if(eventQueue.length>512)seen.delete(eventQueue.shift()!);
      if(garageBody)continue;
      if(event.kind==='crash'){
        const p=event.payload,car=cars.get(p.vehicleId),vehicle=lastFrame?.vehicles.find(v=>v.entityId===p.vehicleId);
        if(!car||!vehicle||vehicle.status!=='active'||p.discontinuityId!==vehicle.discontinuityId||p.discontinuityId!==car.discontinuity||p.speed<3||!Number.isFinite(p.speed)||event.serverTick<=car.lastCrashTick||time-car.lastCrashAt<.22)continue;
        car.feedback=kickImpact(car.feedback,p.normal,vehicle.pose.yaw,p.speed);car.lastCrashAt=time;car.lastCrashTick=event.serverTick;
        const strength=Math.min(1,p.speed/22),contact={x:p.position.x-p.normal.x*1.5,z:p.position.z-p.normal.z*1.5,yaw:p.position.yaw};
        combat.impact(contact,strength,settings.reducedFlash);emit(-contact.x,1,contact.z,Math.round(5+strength*9),'spark');
        const local=lastFrame?.vehicles.find(v=>v.entityId===lastFrame?.localEntityId),isLocal=p.vehicleId===lastFrame?.localEntityId;
        const distance=local?Math.hypot(p.position.x-local.pose.x,p.position.z-local.pose.z):Infinity,volumeScale=isLocal?1:Math.max(0,1-distance/35)*.65;
        if(volumeScale>0)audio.crash(strength,volumeScale);if(isLocal)shake=Math.max(shake,strength*.42);
      }else if(event.kind==='shot'){
        const p=event.payload.origin,car=cars.get(event.payload.shooterId);if(car)car.feedback=kickRecoil(car.feedback);
        combat.muzzle(p,settings.reducedFlash);emit(-p.x,1.2,p.z,4,'spark');const volume=combatVolume(p,event.payload.shooterId===lastFrame?.localEntityId);if(volume>0)audio.effect('shot',volume);
      }else if(event.kind==='hit'){
        const p=event.payload.position;combat.impact(p,.7,settings.reducedFlash);emit(-p.x,1,p.z,14,'spark');emit(-p.x,1,p.z,2,'smoke');const volume=combatVolume(p);if(volume>0)audio.effect('hit',volume);if(event.payload.targetId===lastFrame?.localEntityId)shake=Math.max(shake,.3);
      }else if(event.kind==='projectile-impact'){
        const p=event.payload.position;combat.impact(p,.55,settings.reducedFlash);emit(-p.x,1,p.z,10,'spark');emit(-p.x,1,p.z,2,'smoke');const volume=combatVolume(p);if(volume>0)audio.effect('hit',volume);
      }else if(event.kind==='wreck'){
        const car=cars.get(event.payload.vehicleId);if(car){const p={x:-car.root.position.x,z:car.root.position.z,yaw:car.previousYaw};combat.impact(p,2,settings.reducedFlash);emit(car.root.position.x,1,car.root.position.z,28,'fire');emit(car.root.position.x,1.3,car.root.position.z,14,'smoke');const volume=combatVolume(p);if(volume>0)audio.effect('wreck',volume);shake=Math.max(shake,.6*volume);}
      }else if(event.kind==='respawn'){
        const car=cars.get(event.payload.vehicleId);if(car){car.feedback=newVehicleFeedback();car.motion=newCartoonMotion();car.lastCrashAt=-10;car.lastCrashTick=-1;}
      }
    }
  }
  async function loadScene(manifest:SceneManifest):Promise<void>{
    if(manifest.mapRevision!==map.revision)throw new Error(`Renderer map mismatch: ${manifest.mapRevision}`);
    scene.clearColor=Color4.FromColor3(Color3.FromHexString(manifest.environment.skyColor),1);scene.fogColor=Color3.FromHexString(manifest.environment.fogColor);sun.direction=Vector3.FromArray(manifest.environment.sunDirection);
  }
  function resize(width?:number,height?:number,pixelRatio?:number):void{if(disposed)return;if(width&&height){engine.setSize(Math.max(1,width*(pixelRatio??1)),Math.max(1,height*(pixelRatio??1)));}else engine.resize();}
  function dispose():void{if(disposed)return;disposed=true;audio.dispose();for(const c of cars.values())removeCar(c);cars.clear();factory.dispose();seen.clear();garage?.dispose();combat.dispose();scene.dispose();engine.dispose();}
  void loadScene(districtScene);
  return {render,present,resize,dispose,loadScene,setSettings,setGaragePreview,unlockAudio:()=>audio.unlock(),getStats:()=>({fps:engine.getFps(),frameCpuMs,drawCalls:frameDrawCalls,activeMeshes:(garageBody&&garage?garage.scene:scene).getActiveMeshes().length,totalMeshes:scene.meshes.length+(garage?.scene.meshes.length??0),particles:particles.filter((p)=>p.life>0).length,garageBody,garageAngle:garage?.getStats().angle??0,...combat.getStats()})};
}
export type FenderRenderer=ReturnType<typeof createGameRenderer>;
