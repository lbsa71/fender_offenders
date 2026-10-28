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
import {isModeledCar} from './modeled-car';
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
  const stage=MeshBuilder.CreateBox('garage-stage',{width:7.6,height:.24,depth:14},scene);stage.position.y=-.15;stage.material=material('garage-slate','#294c50');stage.receiveShadows=true;
  const lineMaterial=material('garage-line','#d1b979');
  for(const x of [-3.3,3.3]){const edge=MeshBuilder.CreateBox('garage-road-edge',{width:.055,height:.012,depth:13},scene);edge.position.set(x,-.018,0);edge.material=lineMaterial;}
  const dashMaterial=material('garage-registration','#76948c');
  const marks=Array.from({length:7},(_,i)=>{const mark=MeshBuilder.CreateBox('garage-registration',{width:.075,height:.015,depth:.75},scene);mark.position.set(0,-.012,-6+i*2);mark.material=dashMaterial;return mark;});
  const rivalPlatform=new TransformNode('garage-rival-turntable',scene);
  const factory=new CarFactory(scene);let bodyAssetId:string|null=null,car:CarVisual|null=null,rival:CarVisual|null=null,suspectBody:string|null=null,armed=true,suspectArmed=true,angle=0,disposed=false;
  function remove(value:CarVisual|null){if(value){for(const p of value.parts)shadows?.removeShadowCaster(p);value.root.dispose(false);}}
  function make(id:string,body:string,platform:TransformNode,guns:boolean){const value=factory.create(id,body,false,guns);value.root.parent=platform;value.health.isVisible=false;value.healthBack.isVisible=false;value.marker.isVisible=false;for(const p of value.parts)shadows?.addShadowCaster(p);return value;}
  function setBody(body:string|null,guns=true,suspect:string|null=null,suspectGuns=true){
    if(disposed)return;
    for(const id of [body,suspect])if(id&&isModeledCar(id)&&factory.modelStatusFor(id)==='idle')void factory.loadModel(id,'briefing').then(()=>{if(disposed)return;const b=bodyAssetId,s=suspectBody;bodyAssetId=null;suspectBody=null;setBody(b,armed,s,suspectArmed);}).catch(()=>undefined);
    if(body!==bodyAssetId||guns!==armed){remove(car);car=body?make('garage-preview',body,platform,guns):null;bodyAssetId=body;armed=guns;}
    if(suspect!==suspectBody||suspectGuns!==suspectArmed){remove(rival);rival=suspect?make('garage-suspect',suspect,rivalPlatform,suspectGuns):null;suspectBody=suspect;suspectArmed=suspectGuns;}
  }
  function setQuality(quality:'low'|'medium'|'high'){
    scene.shadowsEnabled=quality!=='low';
    if(quality==='low'){shadows?.dispose();shadows=null;return;}
    if(!shadows){shadows=new ShadowGenerator(1024,key);shadows.usePercentageCloserFiltering=true;shadows.bias=.003;shadows.normalBias=.04;shadows.darkness=.3;for(const value of [car,rival])if(value)for(const part of value.parts)shadows.addShadowCaster(part);}
  }
  setQuality(initialQuality);
  function update(dt:number,reduced:boolean){if(disposed)return;if(!reduced)angle+=Math.min(Math.max(dt,0),.5)*.26;
    const chasing=Boolean(suspectBody);platform.rotation.y=chasing?0:angle;rivalPlatform.rotation.y=0;
    platform.position.set(chasing?-1.25:0,0,chasing?-2.8:0);rivalPlatform.position.set(1.25,0,2.8);
    if(car){car.root.rotation.y=chasing?Math.sin(angle)*.035:2.5;factory.animateWheels(car,reduced?0:dt*2,0);}
    if(rival){rival.root.rotation.y=Math.sin(angle+.8)*.045;factory.animateWheels(rival,reduced?0:dt*2,0);}
    for(let i=0;i<marks.length;i++)marks[i]!.position.z=-7+((i*2+1-angle*9)%14+14)%14;
    const width=engine.getRenderingCanvas()?.clientWidth??engine.getRenderWidth(),height=engine.getRenderingCanvas()?.clientHeight??engine.getRenderHeight(),narrow=width<=740,short=narrow&&height<600;
    scene.activeCamera=camera;scene.activeCameras=null;
    if(chasing){camera.position.set(-10,9,-11);camera.setTarget(new Vector3(0,.6,0));camera.fov=.58;camera.viewport=short?new Viewport(0,.52,.34,.28):narrow?new Viewport(0,1-195/height,1,90/height):new Viewport(0,.48,.56,.30);}
    else{camera.position.set(5.6,3.8,-7);camera.setTarget(new Vector3(0,1,0));camera.fov=.64;camera.viewport=new Viewport(0,.24,.58,.48);}}
  function dispose(){if(disposed)return;disposed=true;factory.dispose();scene.dispose();}
  return{scene,setBody,setQuality,update,getStats:()=>({bodyAssetId,suspectBody,armed,suspectArmed,angle,modelStatus:factory.modelStatusFor(bodyAssetId??'')}),dispose};
}
export type GaragePreview=ReturnType<typeof createGaragePreview>;
