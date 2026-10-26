import type {Scene} from '@babylonjs/core/scene';
import type {PlanarPose,RenderProjectileState} from '@fender/contracts';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Constants} from '@babylonjs/core/Engines/constants';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {InstancedMesh} from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import {MeshBuilder} from './primitives';
export type MuzzlePose=PlanarPose&{height?:number};
interface Flash{flare:InstancedMesh;core:InstancedMesh;life:number;duration:number;strength:number;fresh:boolean;groupKey:string|null;barrelIndex:number}
interface Ring{mesh:InstancedMesh;life:number;duration:number;strength:number}
/** Shared native sources, fixed pools, no dynamic lights or per-event materials. */
export class CombatEffects{
 private sources:Mesh[]=[];private materials:StandardMaterial[]=[];
 private flashes:Flash[]=[];private rings:Ring[]=[];private cores:InstancedMesh[]=[];private trails:InstancedMesh[]=[];
 private projectileAges=new Map<string,{age:number;seen:number}>();private projectileFrame=0;
 private flashIndex=0;private ringIndex=0;private disposed=false;
 constructor(private scene:Scene){
  const material=(name:string,color:string,alpha=1)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.emissiveColor=m.diffuseColor.scale(1.5);m.disableLighting=true;m.alpha=alpha;if(alpha<1)m.alphaMode=Constants.ALPHA_ADD;m.specularColor.set(0,0,0);this.materials.push(m);return m;};
  const white=material('weapon-white-hot','#fff8d8'),gold=material('weapon-muzzle-gold','#ffb146',.8),trail=material('weapon-tracer-trail','#ffac38',.6),ring=material('weapon-impact-ring','#ffc76e',.5);
  const source=(mesh:Mesh,m:StandardMaterial)=>{mesh.material=m;mesh.isVisible=false;mesh.isPickable=false;this.sources.push(mesh);return mesh;};
  const coreSource=source(MeshBuilder.CreateIcoSphere('muzzle-core-source',{radius:1,subdivisions:0},scene),white),flareSource=source(MeshBuilder.CreateIcoSphere('muzzle-flare-source',{radius:1,subdivisions:0},scene),gold);
  const ringSource=source(MeshBuilder.CreateTorus('impact-ring-source',{diameter:1,thickness:.055,tessellation:20},scene),ring);
  const tracerSource=source(MeshBuilder.CreateBox('tracer-core-source',{width:.11,height:.11,depth:1.7},scene),white),trailSource=source(MeshBuilder.CreateBox('tracer-trail-source',{width:.24,height:.12,depth:1},scene),trail);
  const instance=(mesh:Mesh,name:string)=>{const i=mesh.createInstance(name);i.isVisible=false;i.isPickable=false;return i;};
  for(let i=0;i<24;i++)this.flashes.push({flare:instance(flareSource,`pooled-muzzle-flare-${i}`),core:instance(coreSource,`pooled-muzzle-core-${i}`),life:0,duration:.09,strength:1,fresh:false,groupKey:null,barrelIndex:0});
  for(let i=0;i<12;i++)this.rings.push({mesh:instance(ringSource,`pooled-impact-ring-${i}`),life:0,duration:.4,strength:1});
  for(let i=0;i<192;i++){this.cores.push(instance(tracerSource,`pooled-tracer-core-${i}`));this.trails.push(instance(trailSource,`pooled-tracer-trail-${i}`));}
 }
 private flash(x:number,z:number,yaw:number,strength:number,duration=.09,height=1.22):Flash{
  const f=this.flashes[this.flashIndex++%this.flashes.length]!;f.life=f.duration=duration;f.strength=strength;f.fresh=true;f.groupKey=null;f.barrelIndex=0;
  f.flare.position.set(-x,height,z);f.core.position.copyFrom(f.flare.position);f.flare.rotation.y=f.core.rotation.y=-yaw;
  f.flare.isVisible=f.core.isVisible=true;return f;
 }
 muzzle(origins:PlanarPose|readonly MuzzlePose[],reducedFlash=false,groupKey?:string):void{
  if(this.disposed)return;
  if(Array.isArray(origins)){for(let i=0;i<origins.length;i++){const p=origins[i] as MuzzlePose,f=this.flash(p.x,p.z,p.yaw,reducedFlash?.42:1,.09,p.height??1.2);f.groupKey=groupKey??null;f.barrelIndex=i;}return;}
  // Legacy events used a center origin; current volleys provide both physical muzzle points.
  const origin=origins as PlanarPose,sin=Math.sin(origin.yaw),cos=Math.cos(origin.yaw);
  for(const side of [-1,1])this.flash(origin.x+cos*.63*side,origin.z-sin*.63*side,origin.yaw,reducedFlash?.42:1);
 }
 moveMuzzles(groupKey:string,origins:readonly MuzzlePose[]):void{
  if(this.disposed)return;
  for(const f of this.flashes)if(f.groupKey===groupKey&&f.life>0){const p=origins[f.barrelIndex];if(!p){f.life=0;f.flare.isVisible=f.core.isVisible=false;continue;}f.flare.position.set(-p.x,p.height??1.2,p.z);f.core.position.copyFrom(f.flare.position);f.flare.rotation.y=f.core.rotation.y=-p.yaw;}
 }
 impact(position:PlanarPose,strength:number,reducedFlash=false,height?:number):void{
  if(this.disposed)return;const r=this.rings[this.ringIndex++%this.rings.length]!;r.life=r.duration=.25+Math.min(1,strength)*.25;r.strength=Math.max(.2,Math.min(2,strength))*(reducedFlash?.55:1);r.mesh.position.set(-position.x,height??.13,position.z);r.mesh.isVisible=true;
  this.flash(position.x,position.z,position.yaw,Math.min(1.6,strength)*(reducedFlash?.35:.9),.075,height??1.22);
 }
 renderProjectiles(projectiles:RenderProjectileState[],delta=1/60):void{
  if(this.disposed)return;const dt=Math.min(.1,Math.max(0,Number.isFinite(delta)?delta:0)),frame=++this.projectileFrame;
  for(let i=0;i<this.cores.length;i++){
   const core=this.cores[i]!,trail=this.trails[i]!,p=projectiles[i];core.isVisible=trail.isVisible=!!p;if(!p)continue;
   let history=this.projectileAges.get(p.entityId);if(!history){history={age:dt,seen:frame};this.projectileAges.set(p.entityId,history);}else{history.age=Math.min(10,history.age+dt);history.seen=frame;}
   const explicit=p.presentationAgeSeconds,age=Math.min(history.age,typeof explicit==='number'&&Number.isFinite(explicit)?Math.max(0,explicit):history.age);
   const speed=Math.hypot(p.velocity.x,p.velocity.z),distance=speed*age,minimum=.08,endOffset=Math.max(0,minimum-distance),sin=Math.sin(p.pose.yaw),cos=Math.cos(p.pose.yaw);
   const length=Math.min(Math.max(2.4,Math.min(6,speed*.075)),Math.max(minimum,distance)),coreLength=Math.min(1.7,Math.max(minimum,distance));
   const height=p.tracerHeight??1.2,slope=p.tracerSlope??0;core.rotation.x=trail.rotation.x=-Math.atan(slope);
   core.position.set(-(p.pose.x+sin*(endOffset-coreLength*.5)),height-coreLength*.5*slope,p.pose.z+cos*(endOffset-coreLength*.5));core.rotation.y=trail.rotation.y=-p.pose.yaw;core.scaling.z=coreLength/1.7;
   trail.position.set(-(p.pose.x+sin*(endOffset-length*.5)),height-.01-length*.5*slope,p.pose.z+cos*(endOffset-length*.5));trail.scaling.z=length;
  }
  for(const [id,history]of this.projectileAges)if(history.seen!==frame)this.projectileAges.delete(id);
 }
 update(delta:number,reducedFlash=false):void{
  if(this.disposed)return;const dt=Math.min(.1,Math.max(0,delta));
  for(const f of this.flashes){if(f.fresh)f.fresh=false;else f.life=Math.max(0,f.life-dt);f.flare.isVisible=f.core.isVisible=f.life>0;if(f.life===0)continue;const ratio=f.life/f.duration,size=f.strength*(.45+ratio*.55)*(reducedFlash?.7:1);f.flare.scaling.set(size*.4,size*.32,size*.85);f.core.scaling.set(size*.16,size*.18,size*.7);}
  for(const r of this.rings){r.life=Math.max(0,r.life-dt);r.mesh.isVisible=r.life>0;if(r.life>0){const age=1-r.life/r.duration,size=(.6+age*5)*r.strength;r.mesh.scaling.set(size,.3+(.7*(1-age)),size);}}
 }
 reset():void{this.projectileAges.clear();this.flashIndex=0;this.ringIndex=0;for(const f of this.flashes){f.life=0;f.fresh=false;f.core.isVisible=f.flare.isVisible=false;}for(const r of this.rings){r.life=0;r.mesh.isVisible=false;}for(const m of [...this.cores,...this.trails])m.isVisible=false;}
 getStats(){return{muzzleFlashes:this.flashes.filter(f=>f.life>0).length,impactRings:this.rings.filter(r=>r.life>0).length,tracerCores:this.cores.filter(m=>m.isVisible).length,tracerTrails:this.trails.filter(m=>m.isVisible).length};}
 dispose():void{if(this.disposed)return;this.disposed=true;this.projectileAges.clear();for(const m of this.sources)m.dispose();for(const m of this.materials)m.dispose();this.sources=[];this.materials=[];}
}
