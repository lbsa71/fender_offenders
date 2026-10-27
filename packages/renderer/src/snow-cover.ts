import {WinterScenery} from './winter-scenery';
import type {PropState} from '@fender/contracts';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import type { Particle } from '@babylonjs/core/Particles/particle';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh';

/** A reversible up-facing coating, shared by city, props, trees and car materials. */
export class SnowCover {
  enabled=false;
  private disposed=false;
  private materials=new Set<StandardMaterial|PBRMaterial>();
  private observer: Observer<Material>|null;
  private center=Vector3.Zero();
  private phase=0;
  private limit=128;
  private falling=false;
  private texture:RawTexture;
  private flakes:ParticleSystem;
  private scenery:WinterScenery|null=null;
  constructor(private scene:Scene,private shadows?:ShadowGenerator){
    const attach=(material:Material)=>{if(!(material instanceof StandardMaterial||material instanceof PBRMaterial)||this.materials.has(material))return;this.materials.add(material);new SnowFinish(material,this);material.onDisposeObservable.addOnce(()=>this.materials.delete(material));};
    for(const material of scene.materials)attach(material);
    this.observer=scene.onNewMaterialAddedObservable.add(attach);
    const size=16,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1);data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(Math.max(0,1-r)*255);}
    this.texture=RawTexture.CreateRGBATexture(data,size,size,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);this.texture.name='snowflake-original-alpha';this.texture.hasAlpha=true;
    this.flakes=new ParticleSystem('dispatch-snowfall',128,scene);this.flakes.particleTexture=this.texture;this.flakes.emitter=this.center;this.flakes.blendMode=ParticleSystem.BLENDMODE_STANDARD;this.flakes.renderingGroupId=1;
    this.flakes.emitRate=0;this.flakes.updateSpeed=0;this.flakes.minLifeTime=this.flakes.maxLifeTime=1e9;this.flakes.color1=this.flakes.color2=new Color4(1,1,1,1);
    this.flakes.startPositionFunction=(_world,position)=>position.copyFrom(this.center);this.flakes.startDirectionFunction=(_world,direction)=>direction.setAll(0);this.flakes.updateFunction=particles=>this.sample(particles);
  }
  covers(material:StandardMaterial|PBRMaterial):boolean {
    if(this.disposed||!this.enabled||material.alpha<1)return false;
    if(material.name==='glass'||material.name==='shallow-water')return false;
    if(['#e9c979false','#c1ccbdfalse','#dce0cafalse','#e0d8b5false'].includes(material.name))return false;
    if(material instanceof StandardMaterial&&(material.disableLighting||Math.max(material.emissiveColor.r,material.emissiveColor.g,material.emissiveColor.b)>.1))return false;
    return material.name.startsWith('#')||material.name.startsWith('prop-')||material.name.startsWith('paint-')||['chrome','rubber','white','black','charred-chassis'].includes(material.name);
  }
  setEnabled(enabled:boolean):void {if(this.disposed||this.enabled===enabled)return;this.enabled=enabled;if(enabled)this.scenery??=new WinterScenery(this.scene,this.shadows);this.scenery?.setEnabled(enabled);if(!enabled)this.reset();}
  update(dt:number,target:{x:number;z:number},quality:'low'|'medium'|'high',reducedMotion:boolean,broken:readonly string[]=[],props:readonly PropState[]=[]):void {
    this.scenery?.update(dt,broken,props,reducedMotion);
    if(this.disposed)return;
    if(!this.enabled||reducedMotion){this.reset();return;}
    this.phase+=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;this.limit=quality==='low'?64:128;this.center.set(target.x,0,target.z);
    if(!this.falling){this.flakes.manualEmitCount=128;this.flakes.start();this.flakes.animate(true);this.falling=true;}
    this.sample(this.flakes.particles);
  }
  private sample(particles:Particle[]):void {
    for(let i=0;i<particles.length;i++){const p=particles[i]!,v=(i*.61803398875)%1,spread=(i*.754877666)%1;
      p.age=0;p.lifeTime=1e9;p.size=.07+v*.09;p.scale.set(1,1);p.angle=v*6.28;p.color.set(.94,.98,1,i<this.limit?.55+v*.35:0);
      p.position.set(this.center.x+((v*52+this.phase*.6)%52)-26,1+((i*7.13-this.phase*(1.2+v)+100000)%18),this.center.z+((spread*52+this.phase*.2)%52)-26);
    }
  }
  reset():void {this.scenery?.resetEffects();if(this.falling){this.flakes.stop();this.flakes.reset();}this.falling=false;this.phase=0;}
  getStats(){return{...(this.scenery?.getStats()??{snowCaps:0,snowbanks:0,snowChunks:0,snowChunkCapacity:0}),snowActive:this.enabled&&!this.disposed,snowCoveredMaterials:[...this.materials].filter(m=>this.covers(m)).length,snowflakes:this.falling&&!this.disposed?Math.min(this.limit,this.flakes.getActiveCount()):0,snowflakeCapacity:this.disposed?0:128};}
  dispose():void {if(this.disposed)return;this.reset();this.enabled=false;this.disposed=true;this.scene.onNewMaterialAddedObservable.remove(this.observer);this.scenery?.dispose();this.flakes.dispose(false);this.texture.dispose();this.materials.clear();}
}
class SnowFinish extends MaterialPluginBase {
  constructor(private snowMaterial:StandardMaterial|PBRMaterial,private snow:SnowCover){super(snowMaterial,'FenderSnowCover',210,{FENDER_SNOW_COVER:true},true,true);}
  override getUniforms(){return{externalUniforms:['fenderSnowAmount','fenderSnowRoad']};}
  override bindForSubMesh(_buffer:UniformBuffer,_scene:Scene,_engine:AbstractEngine,mesh:SubMesh):void {mesh.effect?.setFloat('fenderSnowAmount',this.snow.covers(this.snowMaterial)?.94:0);mesh.effect?.setFloat('fenderSnowRoad',this.snowMaterial.name==='#4d6268false'?1:0);}
  override getCustomCode(shaderType:string){
    if(shaderType!=='fragment')return null;
    return{CUSTOM_FRAGMENT_DEFINITIONS:'uniform float fenderSnowAmount;uniform float fenderSnowRoad;',CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
      float fenderSnowCoat=fenderSnowAmount*smoothstep(0.3,0.75,normalW.y);
      float fenderSnowGrain=fract(sin(dot(floor(vPositionW.xz*5.0),vec2(12.9898,78.233)))*43758.5453)*0.025;
      vec3 fenderSnowColor=mix(vec3(0.91,0.95,1.0),vec3(0.16,0.24,0.32),fenderSnowRoad)-vec3(fenderSnowGrain);
      ${this._material instanceof PBRMaterial?'surfaceAlbedo=mix(surfaceAlbedo,fenderSnowColor,fenderSnowCoat);':'diffuseColor=mix(diffuseColor,fenderSnowColor,fenderSnowCoat);baseColor.rgb=mix(baseColor.rgb,vec3(1.0),fenderSnowCoat);'}
    `};
  }
}
