import type {Scene} from '@babylonjs/core/scene';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Material} from '@babylonjs/core/Materials/material';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import {SMOG_RULES,type RoadGadgetState,type VehicleState} from '@fender/contracts';
import {MeshBuilder} from './primitives';
import {createGrenadeParticleTexture} from './grenade-particles';

/** Two fixed instance buffers for road billows and fog enveloping exposed cars. */
export class SmogEffects {
 private readonly billows; private readonly rings; private readonly fog; private readonly amber;
 private readonly matrices=new Float32Array(SMOG_RULES.maxPuffs*16);
 private readonly ringMatrices=new Float32Array(SMOG_RULES.maxClouds*16);
 private readonly scale=new Vector3(); private readonly position=new Vector3();
 private readonly rotation=Quaternion.Identity(); private readonly matrix=Matrix.Identity();
 private readonly ringRotation=Quaternion.Identity(); private readonly texture;
 private tick=0; private disposed=false; private stats={smogClouds:0,smogPuffs:0};
 constructor(private readonly scene:Scene){
  this.texture=createGrenadeParticleTexture(scene);this.texture.name='smog-soft-particle';
  this.fog=new StandardMaterial('smog-fog',scene);this.fog.diffuseColor=Color3.White();this.fog.emissiveColor.set(.78,.82,.85);this.fog.specularColor.set(0,0,0);this.fog.alpha=.8;
  this.fog.diffuseTexture=this.texture;this.fog.useAlphaFromDiffuseTexture=true;this.fog.backFaceCulling=false;this.fog.disableLighting=true;this.fog.disableDepthWrite=true;this.fog.transparencyMode=Material.MATERIAL_ALPHABLEND;
  this.amber=new StandardMaterial('smog-warning',scene);this.amber.diffuseColor=Color3.FromHexString('#ffc36a');this.amber.emissiveColor.set(.35,.16,.03);
  this.billows=MeshBuilder.CreatePlane('smog-billows',{size:2},scene);this.billows.material=this.fog;
  this.rings=MeshBuilder.CreateTorus('smog-warning-rings',{diameter:SMOG_RULES.radius*2,thickness:.06,tessellation:32},scene);this.rings.material=this.amber;
  for(const [mesh,buffer] of [[this.billows,this.matrices],[this.rings,this.ringMatrices]] as const){mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.thinInstanceSetBuffer('matrix',buffer,16,false);}
  this.reset();
 }
 private write(buffer:Float32Array,index:number,x:number,y:number,z:number,size:number,ring=false){
  this.position.set(-x,y,z);this.scale.set(size,size*.8,size);Matrix.ComposeToRef(this.scale,ring?this.ringRotation:this.rotation,this.position,this.matrix);this.matrix.copyToArray(buffer,index*16);
 }
 render(gadgets:readonly RoadGadgetState[],vehicles:readonly VehicleState[],tick:number,reducedMotion:boolean){
  if(this.disposed)return;if(Number.isFinite(tick))this.tick=Math.max(this.tick,tick);
  if(this.scene.activeCamera)Quaternion.FromRotationMatrixToRef(this.scene.activeCamera.getWorldMatrix(),this.rotation);
  let count=0,rings=0,clouds=0,seen=0;const enveloped=new Set<string>();
  for(const g of gadgets){
   if(g.kind!=='smog'||seen>=SMOG_RULES.maxClouds||this.tick<g.bornTick||this.tick>=g.expiresTick)continue;
   const owner=vehicles.find(v=>v.entityId===g.ownerEntityId);if(!owner||owner.status!=='active'||owner.protectedUntilTick>this.tick||!Object.values(g.pose).every(Number.isFinite))continue;seen++;
   if(this.tick<g.activeAtTick+SMOG_RULES.cloudTicks){
    clouds++;const warning=this.tick<g.activeAtTick,grow=warning ? .35+.3*(this.tick-g.bornTick)/SMOG_RULES.warningTicks : 1;
    if(warning)this.write(this.ringMatrices,rings++,g.pose.x,.09,g.pose.z,1,true);
    const fade=Math.min(1,(g.activeAtTick+SMOG_RULES.cloudTicks-this.tick)/24);
    for(let i=0;i<12&&count<SMOG_RULES.maxPuffs;i++){
     const angle=i*2.39996+(reducedMotion?0:(this.tick-g.bornTick)*.004),radius=Math.sqrt(i/12)*SMOG_RULES.radius*.72*grow;
     this.write(this.matrices,count++,g.pose.x+Math.sin(angle)*radius,1.1+(i%3)*.65*grow,g.pose.z+Math.cos(angle)*radius,(1.45+(i%3)*.13)*grow*fade);
    }
   }
   for(const e of g.exposures??[]){
    if(this.tick<e.bornTick||this.tick>=e.expiresTick||enveloped.has(e.vehicleId)||enveloped.size>=8)continue;
    const target=vehicles.find(v=>v.entityId===e.vehicleId);if(!target||target.status!=='active'||target.protectedUntilTick>this.tick)continue;enveloped.add(e.vehicleId);
    const swell=Math.min(1,(this.tick-e.bornTick+1)/SMOG_RULES.envelopeTicks),fade=Math.min(1,(e.expiresTick-this.tick)/SMOG_RULES.fadeOutTicks);
    for(let i=0;i<8&&count<SMOG_RULES.maxPuffs;i++){const angle=i*Math.PI/4+(reducedMotion?0:this.tick*.008);this.write(this.matrices,count++,target.pose.x+Math.sin(angle)*(1.3+swell),1.1+(i%2)*.9,target.pose.z+Math.cos(angle)*(1.3+swell),(1+swell*.6)*fade);}
   }
  }
  this.stats={smogClouds:clouds,smogPuffs:count};
  for(const [mesh,n] of [[this.billows,count],[this.rings,rings]] as const){mesh.thinInstanceCount=n;mesh.setEnabled(n>0);mesh.isVisible=n>0;if(n)mesh.thinInstanceBufferUpdated('matrix');}
 }
 getStats(){return {...this.stats};}
 reset(){if(this.disposed)return;this.tick=0;this.stats={smogClouds:0,smogPuffs:0};for(const mesh of [this.billows,this.rings]){mesh.thinInstanceCount=0;mesh.setEnabled(false);mesh.isVisible=false;}}
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;this.billows.dispose();this.rings.dispose();this.fog.dispose();this.amber.dispose();this.texture.dispose();}
}
