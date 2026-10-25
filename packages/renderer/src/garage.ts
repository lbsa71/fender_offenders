import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine';
import {Scene} from '@babylonjs/core/scene';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {Viewport} from '@babylonjs/core/Maths/math.viewport';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {ImageProcessingConfiguration} from '@babylonjs/core/Materials/imageProcessingConfiguration';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {CarFactory,type CarVisual} from './cars';
import {MeshBuilder} from './primitives';
export function createGaragePreview(engine:AbstractEngine,initialQuality:'low'|'medium'|'high'='high'){
  const scene=new Scene(engine);scene.metadata={kind:'garage-preview'};scene.useRightHandedSystem=true;
  scene.clearColor=Color4.FromHexString('#142b30ff');scene.ambientColor=Color3.FromHexString('#d9e0c7');
  scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;scene.imageProcessingConfiguration.exposure=1.05;
  const camera=new FreeCamera('garage-camera',new Vector3(5.6,3.8,-7),scene);camera.setTarget(new Vector3(0,1,0));camera.fov=.64;camera.minZ=.1;
  camera.viewport=new Viewport(0,.24,.58,.48);scene.activeCamera=camera;
  const sky=new HemisphericLight('garage-fill',new Vector3(0,1,0),scene);sky.intensity=.8;sky.groundColor=Color3.FromHexString('#456268');
  const key=new DirectionalLight('garage-key',new Vector3(-.5,-1,.45),scene);key.position.set(8,12,-8);key.intensity=1.5;key.diffuse=Color3.FromHexString('#ffe3af');
  const rim=new DirectionalLight('garage-rim',new Vector3(.4,-.2,-1),scene);rim.intensity=.6;rim.diffuse=Color3.FromHexString('#8ec7cd');
  let shadows:ShadowGenerator|null=null;
  const material=(name:string,color:string,glow=false)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(.15,.15,.15);if(glow)m.emissiveColor=m.diffuseColor.scale(.4);return m;};
  const platform=new TransformNode('garage-turntable',scene);
  const stage=MeshBuilder.CreateCylinder('garage-stage',{diameter:8.4,height:.3,tessellation:64},scene);stage.position.y=-.18;stage.material=material('garage-slate','#294c50');stage.receiveShadows=true;
  const ring=MeshBuilder.CreateTorus('garage-ring',{diameter:8.5,thickness:.055,tessellation:64},scene);ring.position.y=-.02;ring.material=material('garage-brass','#d1b979',true);
  const inner=MeshBuilder.CreateTorus('garage-inner-ring',{diameter:6.2,thickness:.025,tessellation:64},scene);inner.position.y=-.015;inner.material=material('garage-line','#517879');
  const dashMaterial=material('garage-registration','#76948c');
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2,mark=MeshBuilder.CreateBox('garage-registration',{width:.045,height:.015,depth:.18},scene);mark.position.set(Math.sin(a)*3.8,-.02,Math.cos(a)*3.8);mark.rotation.y=a;mark.material=dashMaterial;mark.parent=platform;mark.layerMask=1;}
  const rivalPlatform=new TransformNode('garage-rival-turntable',scene);rivalPlatform.position.x=12;
  for(const original of [stage,ring,inner]){original.layerMask=1;const clone=original.clone(`${original.name}-rival`)!;clone.position.x+=12;clone.layerMask=2;}
  const rivalCamera=new FreeCamera('garage-rival-camera',new Vector3(17.6,3.8,-7),scene);rivalCamera.setTarget(new Vector3(12,1,0));rivalCamera.fov=.64;rivalCamera.minZ=.1;camera.layerMask=1;rivalCamera.layerMask=2;
  const factory=new CarFactory(scene);let bodyAssetId:string|null=null,car:CarVisual|null=null,rival:CarVisual|null=null,suspectBody:string|null=null,armed=true,suspectArmed=true,angle=0,disposed=false;
  function remove(value:CarVisual|null){if(value){for(const p of value.parts)shadows?.removeShadowCaster(p);value.root.dispose(false);}}
  function make(id:string,body:string,platform:TransformNode,guns:boolean){const value=factory.create(id,body,false,guns);value.root.parent=platform;value.root.rotation.y=2.5;value.health.isVisible=false;value.healthBack.isVisible=false;value.marker.isVisible=false;for(const mesh of value.root.getChildMeshes())mesh.layerMask=id==='garage-suspect'?2:1;for(const p of value.parts)shadows?.addShadowCaster(p);return value;}
  function setBody(body:string|null,guns=true,suspect:string|null=null,suspectGuns=true){
    if(disposed)return;
    if(body!==bodyAssetId||guns!==armed){remove(car);car=body?make('garage-preview',body,platform,guns):null;bodyAssetId=body;armed=guns;}
    if(suspect!==suspectBody||suspectGuns!==suspectArmed){remove(rival);rival=suspect?make('garage-suspect',suspect,rivalPlatform,suspectGuns):null;suspectBody=suspect;suspectArmed=suspectGuns;}
  }
  function setQuality(quality:'low'|'medium'|'high'){
    scene.shadowsEnabled=quality!=='low';
    if(quality==='low'){shadows?.dispose();shadows=null;return;}
    if(!shadows){shadows=new ShadowGenerator(1024,key);shadows.usePercentageCloserFiltering=true;shadows.bias=.003;shadows.normalBias=.04;shadows.darkness=.3;for(const value of [car,rival])if(value)for(const part of value.parts)shadows.addShadowCaster(part);}
  }
  setQuality(initialQuality);
  function update(dt:number,reduced:boolean){if(disposed)return;if(!reduced)angle+=Math.min(Math.max(dt,0),.5)*.26;platform.rotation.y=angle;rivalPlatform.rotation.y=angle;
    const width=engine.getRenderingCanvas()?.clientWidth??engine.getRenderWidth(),height=engine.getRenderingCanvas()?.clientHeight??engine.getRenderHeight(),narrow=width<=740,short=narrow&&height<600;
    scene.activeCamera=camera;scene.activeCameras=suspectBody?[camera,rivalCamera]:null;
    if(suspectBody){camera.viewport=short?new Viewport(0,.48,.30,.25):narrow?new Viewport(0,.66,1,.17):new Viewport(0,.28,.29,.4);rivalCamera.viewport=short?new Viewport(0,.18,.30,.25):narrow?new Viewport(0,.46,1,.17):new Viewport(.29,.28,.29,.4);}
    else camera.viewport=new Viewport(0,.24,.58,.48);}
  function dispose(){if(disposed)return;disposed=true;factory.dispose();scene.dispose();}
  return{scene,setBody,setQuality,update,getStats:()=>({bodyAssetId,suspectBody,armed,suspectArmed,angle}),dispose};
}
export type GaragePreview=ReturnType<typeof createGaragePreview>;
