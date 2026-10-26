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
import { findCampaignDispatch, getCampaignTarget, getBossTactics, getDispatchFeatures, getVehicleProfile, type CollisionMap, type DriverActions, type GameEvent, type RenderFrame, type SceneManifest } from '@fender/contracts';
import { MotorAudio } from './audio';
import { DrivingSoundTracker } from './driving-sound';
import { buildCity } from './city';
import { CarFactory, updateCarStatus, type CarVisual } from './cars';
import {crossedRoadBump,newCartoonMotion,stepCartoonMotion} from './deformation';
import {createGaragePreview,type GaragePreview} from './garage';
import {newVehicleFeedback,kickImpact,kickRecoil,stepVehicleFeedback} from './feedback';
import {CombatEffects,type MuzzlePose} from './combat-effects';
import {PropVisuals} from './props';
import {PedestrianCrowd} from './pedestrians';
import {WreckEffects} from './wreck-effects';
import {targetIndicatorFromClip} from './target-projection';
import {TargetObjective} from './target-objective';
import {GrenadeEffects} from './grenade-effects';
import {RoadGadgetEffects} from './road-gadgets';
import {DispatchEnvironment} from './environment';
import {WetSurfaces} from './wet-surfaces';
import {WaterSplashes} from './water-splashes';
import {LightDetail} from './light-detail';
import {ContactShading} from './contact-shading';
import {isSpawnProtected} from './protection-clock';

export interface RendererSettings {
  quality: 'low' | 'medium' | 'high'; masterVolume: number; effectsVolume: number;
  muted: boolean; reducedShake: boolean; reducedFlash: boolean;
  cameraDistance: number; cameraLookAhead: number; cameraSmoothing: number;
}
export type RendererOptions = Partial<RendererSettings>;
interface MuzzleRequest{key:string;payload:Extract<GameEvent,{kind:'shot'}>['payload'];life:number|null;points:MuzzlePose[];expires:number}
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
  const environment=new DispatchEnvironment(scene,sun,hemi);
  const water=new WetSurfaces(scene);
  const splashes=new WaterSplashes(scene);
  const lightDetail=new LightDetail(scene,map);
  const contacts=new ContactShading(scene);
  const factory=new CarFactory(scene),cars=new Map<string,CarVisual>(),audio=new MotorAudio(),combat=new CombatEffects(scene),wrecks=new WreckEffects(scene,factory,map);
  const drivingSound = new DrivingSoundTracker();
  let audioActive = true;
  const syncAudioActivity = () => { audio.suspended = !audioActive || document.hidden; };
  document.addEventListener('visibilitychange', syncAudioActivity);
  const prefersReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const props=new PropVisuals(scene),pedestrians=new PedestrianCrowd(scene),objective=new TargetObjective(scene),grenades=new GrenadeEffects(scene);
  const roadGadgets=new RoadGadgetEffects(scene);
  const heardGadgets=new Set<string>();
  let dispatchIndex:number|null=null,activeDispatch:ReturnType<typeof findCampaignDispatch>=null;
  const gunsFor=(player:boolean)=>dispatchIndex===null || (player?getDispatchFeatures(dispatchIndex).gunsEnabled:!['none','grenades'].includes(getBossTactics(dispatchIndex).weapon));
  let garage:GaragePreview|null=null,garageBody:string|null=null;
  const effectMaterial=(name:string,color:string,emissive=false)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(0,0,0);if(emissive)m.emissiveColor=m.diffuseColor;return m;};
  const spark=effectMaterial('spark','#ffe0a0',true),smoke=effectMaterial('smoke','#798882'),fire=effectMaterial('fire','#f26932',true),skid=effectMaterial('skid','#354a4f');
  const particles:Particle[]=Array.from({length:96},(_,i)=>{const mesh=MeshBuilder.CreateIcoSphere(`pooled-effect-${i}`,{radius:1,subdivisions:0},scene);mesh.material=spark;mesh.isVisible=false;return{mesh,vx:0,vy:0,vz:0,life:0,duration:1,size:1};});
  const marks=Array.from({length:128},(_,i)=>{const mesh=MeshBuilder.CreateBox(`pooled-skid-${i}`,{width:.2,height:.012,depth:.85},scene);mesh.material=skid;mesh.isVisible=false;return{mesh,life:0};});
  let markIndex=0,particleIndex=0,time=0,shake=0,disposed=false,lastSmoke=0,lastSkid=0,lastFrame:RenderFrame|null=null,frameCpuMs=0,frameDrawCalls=0,grenadeTick=0;
  const seen=new Set<string>(),eventQueue:string[]=[],retiredMatches:string[]=[];let activeMatch:string|null=null;
  const seenVolleys=new Set<string>(),volleyQueue:string[]=[],pendingMuzzles:MuzzleRequest[]=[],mountedMuzzles=new Map<string,MuzzleRequest>();
  const gunPoint=new Vector3(),worldGun=new Vector3();
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
  function clearWreck(entityId:string):void{wrecks.remove(entityId);audio.stopWreck(entityId);}
  function resetCombatPresentation():void{
    roadGadgets.reset();
    heardGadgets.clear();
    combat.reset();wrecks.reset();grenades.reset();splashes.reset();audio.stopWreck();audio.stopGrenades();grenadeTick=0;shake=0;seenVolleys.clear();volleyQueue.length=0;pendingMuzzles.length=0;mountedMuzzles.clear();
    for(const p of particles){p.life=0;p.mesh.isVisible=false;}
    for(const mark of marks){mark.life=0;mark.mesh.isVisible=false;}
    for(const car of cars.values()){car.feedback=newVehicleFeedback();car.lastCrashAt=-10;car.lastCrashTick=-1;car.wreckLife=null;car.explodedLife=null;car.wreckLifeFloor=-1;}
  }
  function removeCar(v:CarVisual){clearWreck(v.entityId);for(const p of [...v.parts,...v.wreckParts])shadows.removeShadowCaster(p);v.root.dispose(false);}
  function setGaragePreview(bodyAssetId:string|null):void{
    if(disposed)return;
    const selected=bodyAssetId===null?null:getVehicleProfile(bodyAssetId).id;
    const suspect=activeDispatch?getCampaignTarget(activeDispatch.dispatch.targetId).vehicleBodyId:null;
    if(selected===garageBody){if(selected)garage?.setBody(selected,dispatchIndex!==null&&gunsFor(true),suspect,gunsFor(false));return;}
    if(selected&&garageBody===null){activeMatch=null;retiredMatches.length=0;seen.clear();eventQueue.length=0;resetCombatPresentation();props.reset();pedestrians.reset();}
    garageBody=selected;lightDetail.reset();contacts.reset();
    if(selected){objective.hide();garage??=createGaragePreview(engine,settings.quality);garage.setBody(selected,dispatchIndex!==null&&gunsFor(true),suspect,gunsFor(false));}else garage?.setBody(null);
  }
  function setSettings(next:RendererOptions):void{
    Object.assign(settings,next);audio.volume=Math.max(0,Math.min(1,settings.masterVolume*settings.effectsVolume));audio.muted=settings.muted;
    scene.shadowsEnabled=settings.quality!=='low';garage?.setQuality(settings.quality);engine.setHardwareScalingLevel(Math.max(1,(window.devicePixelRatio||1)/Math.min(window.devicePixelRatio||1,settings.quality==='low'?1:1.5)));
  }
  setSettings(options);
  function resolveMuzzles(request:MuzzleRequest):boolean{
    const origins=request.payload.origins;if(!origins?.length)return false;
    const car=cars.get(request.payload.shooterId),vehicle=lastFrame?.vehicles.find(v=>v.entityId===request.payload.shooterId);
    if(car&&(request.life!==null&&car.discontinuity!==request.life||vehicle?.status!=='active'||car.wreckLife===car.discontinuity))return false;
    const count=Math.min(2,origins.length);request.points.length=count;
    if(car){car.root.computeWorldMatrix(true);car.suspension.computeWorldMatrix(true);car.body.computeWorldMatrix(true);}
    for(let i=0;i<count;i++){
      const origin=origins[i]!,point=request.points[i]??{x:0,z:0,yaw:0,height:1.2};request.points[i]=point;point.yaw=origin.yaw;
      if(car){gunPoint.set(i===0?-.63:.63,1.17,2.45);Vector3.TransformCoordinatesToRef(gunPoint,car.body.getWorldMatrix(),worldGun);point.x=-worldGun.x;point.z=worldGun.z;point.height=worldGun.y;}
      else{point.x=origin.x;point.z=origin.z;point.height=1.2;}
    }
    return true;
  }
  function renderMuzzles():void{
    for(const [key,request]of mountedMuzzles){if(time>=request.expires||!resolveMuzzles(request)){combat.moveMuzzles(key,[]);mountedMuzzles.delete(key);}else combat.moveMuzzles(key,request.points);}
    for(const request of pendingMuzzles){
      if(request.payload.origins?.length){if(!resolveMuzzles(request))continue;combat.muzzle(request.points,settings.reducedFlash,request.key);request.expires=time+.09;mountedMuzzles.set(request.key,request);}
      else combat.muzzle(request.payload.origin,settings.reducedFlash);
      // Sparks share the exact flash locations; they remain independent particles after emission.
      if(request.payload.origins?.length)for(const point of request.points)emit(-point.x,point.height??1.2,point.z,2,'spark');else emit(-request.payload.origin.x,1.2,request.payload.origin.z,4,'spark');
    }
    pendingMuzzles.length=0;
    while(mountedMuzzles.size>12){const key=mountedMuzzles.keys().next().value!;combat.moveMuzzles(key,[]);mountedMuzzles.delete(key);}
  }
  function render(frame:RenderFrame,dt:number,driverInput?:Pick<DriverActions,'throttle'|'brakeReverse'>):void{
    if(disposed)return;const cpuStart=performance.now();lastFrame=frame;dt=Math.min(Math.max(dt,0),.1);time+=dt;
    const reducedMotion=settings.reducedShake||prefersReducedMotion.matches;
    if(garageBody&&garage){
      audio.update(0,false,time,false);drivingSound.reset();garage.update(dt,reducedMotion);
      const drawStart=engine._drawCalls.current;engine.beginFrame();garage.scene.render();engine.endFrame();frameCpuMs=performance.now()-cpuStart;frameDrawCalls=engine._drawCalls.current-drawStart;return;
    }
    const active=new Set<string>();let cameraJump=false;
    for(const v of frame.vehicles){
      active.add(v.entityId);let car=cars.get(v.entityId);
      const traffic=v.playerId===null&&v.bodyAssetId.startsWith('traffic'),armed=!traffic&&gunsFor(v.playerId!==null);
      if(car&&(car.bodyAssetId!==v.bodyAssetId||car.traffic!==traffic||car.armed!==armed)){removeCar(car);cars.delete(v.entityId);car=undefined;}
      if(!car){car=factory.create(v.entityId,v.bodyAssetId,traffic,armed);cars.set(v.entityId,car);for(const part of [...car.parts,...car.wreckParts])shadows.addShadowCaster(part);}
      const speed=Math.hypot(v.velocity.x,v.velocity.z),isLocal=v.entityId===frame.localEntityId;
      const discontinuity=car.discontinuity!==v.discontinuityId;
      if(isLocal&&discontinuity)cameraJump=true;
      if(discontinuity){clearWreck(v.entityId);car.wreckLife=null;car.explodedLife=null;car.wreckLifeFloor=Math.max(car.wreckLifeFloor,v.discontinuityId);car.motion=newCartoonMotion();car.feedback=newVehicleFeedback();car.lastBumpId=null;car.lastCrashAt=-10;car.lastCrashTick=-1;}
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
      if(v.status==='respawning')clearWreck(v.entityId);
      const visualStatus=v.status==='wrecked'||car.wreckLife===v.discontinuityId?'wrecked':v.status;
      car.root.setEnabled(v.status!=='respawning');
      const healthRatio=Math.max(0,Math.min(1,v.health/Math.max(1,v.maxHealth??getVehicleProfile(v.bodyAssetId).maxHealth)));
      car.health.scaling.x=Math.max(.01,healthRatio);car.health.position.x=-(1-healthRatio);
      car.health.rotation.y=v.pose.yaw;car.healthBack.rotation.y=v.pose.yaw;
      car.health.isVisible=visualStatus==='active'&&!isLocal&&v.playerId!==null;car.healthBack.isVisible=car.health.isVisible;
      const protectedSpawn=isSpawnProtected(v,frame);
      car.marker.isVisible=isLocal||protectedSpawn;car.marker.scaling.setAll(1+Math.sin(time*3)*.025);
      updateCarStatus(car,protectedSpawn,time,settings.reducedFlash,visualStatus);
      if(car.sirenRed)car.sirenRed.isVisible=car.sirenRed.isVisible&&v.sirenOn&&(settings.reducedFlash||Math.sin(time*17)>0);
      if(car.sirenBlue)car.sirenBlue.isVisible=car.sirenBlue.isVisible&&v.sirenOn&&(settings.reducedFlash||Math.sin(time*17)<=0);
      if(time-lastSmoke>.12&&healthRatio<.4&&v.status!=='respawning')emit(-v.pose.x,1.5,v.pose.z,1,'smoke');
      if(time-lastSkid>.055&&speed>9&&Math.abs(v.velocity.yawRate)>.55){
        for(const side of [-1,1]){const mark=marks[markIndex++%marks.length]!;mark.mesh.position.set(-(v.pose.x+Math.cos(v.pose.yaw)*side*.78-Math.sin(v.pose.yaw)*1.3),.047,v.pose.z-Math.sin(v.pose.yaw)*side*.78-Math.cos(v.pose.yaw)*1.3);mark.mesh.rotation.y=-v.pose.yaw;mark.mesh.isVisible=true;mark.life=8;}
      }
      car.previousX=v.pose.x;car.previousZ=v.pose.z;car.previousYaw=v.pose.yaw;car.discontinuity=v.discontinuityId;
      if(isLocal)audio.update(speed,v.sirenOn,time,v.status==='active',drivingSound.sample(v,map,dt,driverInput));
    }
    if(!frame.vehicles.some(v=>v.entityId===frame.localEntityId)){audio.update(0,false,time,false);drivingSound.reset();}
    if(time-lastSmoke>.12)lastSmoke=time;if(time-lastSkid>.055)lastSkid=time;
    for(const [id,car]of cars)if(!active.has(id)){removeCar(car);cars.delete(id);}
    renderMuzzles();combat.renderProjectiles(frame.projectiles,dt);combat.update(dt,settings.reducedFlash);wrecks.update(dt,{reducedMotion,reducedFlash:settings.reducedFlash});
    if(frame.serverTick!==undefined&&Number.isFinite(frame.serverTick))grenadeTick=frame.serverTick;
    else if(!frame.grenades?.length&&!frame.gadgets?.length)grenadeTick=0;
    else{grenadeTick+=dt*60;for(const g of [...frame.grenades??[],...frame.gadgets??[]])grenadeTick=Math.max(grenadeTick,g.bornTick);}
    grenades.render(frame.grenades??[],grenadeTick,{reducedMotion,reducedFlash:settings.reducedFlash});grenades.update(dt,{reducedMotion,reducedFlash:settings.reducedFlash});
    grenades.drainCues(cue=>{const volume=combatVolume(cue.position);if(volume>0)audio.grenade(cue.kind,volume,cue.grenadeId,combatPan(cue.position));});
    props.render(frame.props??[],environment.lampGlow);pedestrians.update(frame.vehicles,dt,reducedMotion,frame.pursuit?.suspectId);
    roadGadgets.render(frame.gadgets??[],frame.vehicles,grenadeTick,reducedMotion);
    for(const gadget of frame.gadgets??[]){
      const cueTick=gadget.kind==='oil'?gadget.bornTick:gadget.activeAtTick;
      if(grenadeTick<cueTick||heardGadgets.has(gadget.entityId))continue;
      heardGadgets.add(gadget.entityId);if(heardGadgets.size>256)heardGadgets.delete(heardGadgets.values().next().value!);
      // Snapshot reconstruction must not replay an old deployment on joining or reconnecting.
      if(grenadeTick-cueTick>6||grenadeTick>=gadget.expiresTick)continue;
      const owner=frame.vehicles.find(v=>v.entityId===gadget.ownerEntityId);
      if(gadget.kind==='blades'&&(!owner||owner.status!=='active'))continue;
      const position=gadget.kind==='blades'?owner!.pose:gadget.pose,volume=combatVolume(position);
      if(volume>0)audio.effect(gadget.kind,volume,undefined,combatPan(position));
    }
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
    objective.update(frame,time,reducedMotion);
    for(const cue of splashes.update(frame.vehicles,dt,settings.quality,reducedMotion))if(cue.sound){
      const wheel=cue.wheels[0]!,volume=combatVolume(wheel,cue.entityId===frame.localEntityId);
      if(volume>0)audio.splash(cue.strength,volume,cue.entityId===frame.localEntityId?0:combatPan(wheel));
    }
    environment.update(frame.props??[]);water.update(dt,settings.quality,reducedMotion);
    lightDetail.update(frame,cars,environment.lighting.sources,environment.lampGlow,settings.quality,settings.reducedFlash);
    contacts.update(frame.vehicles);
    const drawStart=engine._drawCalls.current;engine.beginFrame();scene.render();objective.project(canvas.clientWidth,canvas.clientHeight);engine.endFrame();frameCpuMs=performance.now()-cpuStart;frameDrawCalls=engine._drawCalls.current-drawStart;
  }
  function combatVolume(position:{x:number;z:number},ownShot=false):number{
    if(ownShot)return 1;
    const local=lastFrame?.vehicles.find(v=>v.entityId===lastFrame?.localEntityId);if(!local)return 0;
    const distance=Math.hypot(position.x-local.pose.x,position.z-local.pose.z);return Math.max(0,1-distance/45)**1.4;
  }
  function combatPan(position:{x:number;z:number}):number{
    const local=lastFrame?.vehicles.find(v=>v.entityId===lastFrame?.localEntityId);if(!local)return 0;
    const view=camera.getViewMatrix().m;
    return Math.max(-.85,Math.min(.85,(-(position.x-local.pose.x)*view[0]!+(position.z-local.pose.z)*view[8]!)/18));
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
      if(event.kind==='shot'&&!gunsFor(lastFrame?.vehicles.find(v=>v.entityId===event.payload.shooterId)?.playerId!==null))continue;
      if(event.kind==='grenade-thrown')grenades.noteThrow(event.payload.grenade);
      else if(event.kind==='grenade-exploded'){
        const p=event.payload;if(grenades.explode(p.grenadeId,p.position,p.blastRadius,event.serverTick,{reducedMotion:settings.reducedShake||prefersReducedMotion.matches,reducedFlash:settings.reducedFlash}))audio.stopGrenades(p.grenadeId);
      }else if(event.kind==='crash'){
        const p=event.payload,car=cars.get(p.vehicleId),vehicle=lastFrame?.vehicles.find(v=>v.entityId===p.vehicleId);
        if(!car||!vehicle||vehicle.status!=='active'||p.discontinuityId!==vehicle.discontinuityId||p.discontinuityId!==car.discontinuity||p.speed<3||!Number.isFinite(p.speed)||event.serverTick<=car.lastCrashTick||time-car.lastCrashAt<.22)continue;
        car.feedback=kickImpact(car.feedback,p.normal,vehicle.pose.yaw,p.speed);car.lastCrashAt=time;car.lastCrashTick=event.serverTick;
        const strength=Math.min(1,p.speed/22),contact={x:p.position.x-p.normal.x*1.5,z:p.position.z-p.normal.z*1.5,yaw:p.position.yaw};
        combat.impact(contact,strength,settings.reducedFlash);emit(-contact.x,1,contact.z,Math.round(5+strength*9),'spark');
        const local=lastFrame?.vehicles.find(v=>v.entityId===lastFrame?.localEntityId),isLocal=p.vehicleId===lastFrame?.localEntityId;
        const distance=local?Math.hypot(p.position.x-local.pose.x,p.position.z-local.pose.z):Infinity,volumeScale=isLocal?1:Math.max(0,1-distance/35)*.65;
        if(volumeScale>0)audio.crash(strength,volumeScale,isLocal?0:combatPan(p.position));if(isLocal)shake=Math.max(shake,strength*.42);
      }else if(event.kind==='shot'){
        const payload=event.payload,p=payload.origin,volleyKey=`${event.matchId}:${payload.volleyId??`${payload.sessionEpoch}:${payload.shooterId}:${payload.sourceCommandSequence}:${payload.sourceShotOrdinal}`}`;
        if(seenVolleys.has(volleyKey))continue;seenVolleys.add(volleyKey);volleyQueue.push(volleyKey);if(volleyQueue.length>256)seenVolleys.delete(volleyQueue.shift()!);
        const car=cars.get(payload.shooterId);if(car)car.feedback=kickRecoil(car.feedback);
        if(pendingMuzzles.length>=12)pendingMuzzles.shift();pendingMuzzles.push({key:volleyKey,payload,life:car?.discontinuity??null,points:[],expires:0});
        const ownShot=payload.shooterId===lastFrame?.localEntityId,volume=combatVolume(p,ownShot);if(volume>0)audio.effect('shot',volume,undefined,ownShot?0:combatPan(p));
      }else if(event.kind==='hit'){
        const p=event.payload.position;combat.impact(p,.7,settings.reducedFlash);emit(-p.x,1,p.z,14,'spark');emit(-p.x,1,p.z,2,'smoke');const volume=combatVolume(p);if(volume>0)audio.effect('hit',volume,undefined,combatPan(p));if(event.payload.targetId===lastFrame?.localEntityId)shake=Math.max(shake,.3);
      }else if(event.kind==='projectile-impact'){
        const p=event.payload.position;combat.impact(p,.55,settings.reducedFlash);emit(-p.x,1,p.z,10,'spark');emit(-p.x,1,p.z,2,'smoke');const volume=combatVolume(p);if(volume>0)audio.effect('hit',volume,undefined,combatPan(p));
      }else if(event.kind==='wreck'){
        const p=event.payload,car=cars.get(p.vehicleId),vehicle=lastFrame?.vehicles.find(v=>v.entityId===p.vehicleId);
        if(!car||!vehicle||vehicle.status==='respawning')continue;
        const life=p.discontinuityId??vehicle.discontinuityId;
        if(life<car.wreckLifeFloor||life!==vehicle.discontinuityId||life!==car.discontinuity||car.explodedLife===life)continue;
        // Complete authority metadata can arrive before the wrecked snapshot. Legacy events require it.
        if(p.discontinuityId===undefined&&vehicle.status!=='wrecked')continue;
        const pose=p.position??vehicle.pose,bodyAssetId=p.bodyAssetId??vehicle.bodyAssetId;
        const options={reducedMotion:settings.reducedShake||prefersReducedMotion.matches,reducedFlash:settings.reducedFlash};
        if(!wrecks.spawn({vehicleId:p.vehicleId,pose,bodyAssetId,armed:cars.get(p.vehicleId)?.armed,discontinuityId:life},options))continue;
        car.explodedLife=car.wreckLife=life;car.motion=newCartoonMotion();car.feedback=newVehicleFeedback();updateCarStatus(car,false,time,settings.reducedFlash,'wrecked');
        const volume=combatVolume(pose);if(volume>0)audio.effect('wreck',volume,p.vehicleId,combatPan(pose));shake=Math.max(shake,.85*volume);
      }else if(event.kind==='respawn'){
        const car=cars.get(event.payload.vehicleId);if(car){clearWreck(event.payload.vehicleId);car.wreckLife=null;car.wreckLifeFloor=Math.max(car.wreckLifeFloor,event.payload.discontinuityId);car.feedback=newVehicleFeedback();car.motion=newCartoonMotion();car.lastCrashAt=-10;car.lastCrashTick=-1;}
      }
    }
  }
  async function loadScene(manifest:SceneManifest):Promise<void>{
    if(manifest.mapRevision!==map.revision)throw new Error(`Renderer map mismatch: ${manifest.mapRevision}`);
    await wrecks.ready;
    if(!disposed)environment.loadBaseline(manifest.environment);
  }
  function resize(width?:number,height?:number,pixelRatio?:number):void{if(disposed)return;if(width&&height){engine.setSize(Math.max(1,width*(pixelRatio??1)),Math.max(1,height*(pixelRatio??1)));}else engine.resize();}
  function dispose():void{if(disposed)return;disposed=true;document.removeEventListener('visibilitychange',syncAudioActivity);roadGadgets.dispose();audio.dispose();for(const c of cars.values())removeCar(c);cars.clear();factory.dispose();seen.clear();garage?.dispose();combat.dispose();wrecks.dispose();props.dispose();pedestrians.dispose();objective.dispose();grenades.dispose();contacts.dispose();lightDetail.dispose();splashes.dispose();water.dispose();environment.dispose();scene.dispose();engine.dispose();}
  void loadScene(districtScene);
  return {render,present,resize,dispose,loadScene,setSettings,setGaragePreview,setAudioActive:(active:boolean)=>{audioActive=active;syncAudioActivity();},setDispatch:(id:string|null)=>{environment.setDispatch(id);activeDispatch=findCampaignDispatch(id);dispatchIndex=activeDispatch?.index??null;},getTargetIndicator:()=>objective.getIndicator(),getControlAnchor:()=>{
    const local=lastFrame?.vehicles.find(v=>v.entityId===lastFrame?.localEntityId);if(!local||garageBody)return null;
    const m=scene.getTransformMatrix().m,x=-local.pose.x,z=local.pose.z,y=1;
    return targetIndicatorFromClip({x:x*m[0]!+y*m[4]!+z*m[8]!+m[12]!,y:x*m[1]!+y*m[5]!+z*m[9]!+m[13]!,w:x*m[3]!+y*m[7]!+z*m[11]!+m[15]!},canvas.clientWidth,canvas.clientHeight,0);
  },unlockAudio:()=>audio.unlock(),getStats:()=>({fps:engine.getFps(),frameCpuMs,drawCalls:frameDrawCalls,activeMeshes:(garageBody&&garage?garage.scene:scene).getActiveMeshes().length,totalMeshes:scene.meshes.length+(garage?.scene.meshes.length??0),particles:particles.filter((p)=>p.life>0).length,garageBody,garageAngle:garage?.getStats().angle??0,garageReady:garage?.scene.isReady()??false,garageSuspectBody:garage?.getStats().suspectBody??null,garageArmed:garage?.getStats().armed??false,garageSuspectArmed:garage?.getStats().suspectArmed??false,...environment.getStats(),...water.getStats(),...splashes.getStats(),...lightDetail.getStats(),...contacts.getStats(),...combat.getStats(),...wrecks.getStats(),...grenades.getStats(),...roadGadgets.getStats(),...props.getStats(),pedestrians:pedestrians.getStats().total,pedestriansRunning:pedestrians.getStats().running,pedestriansVisible:pedestrians.getStats().visible,pedestriansWaiting:pedestrians.getStats().waiting,pedestriansHiddenSafety:pedestrians.getStats().hiddenSafety})};
}
export type FenderRenderer=ReturnType<typeof createGameRenderer>;
