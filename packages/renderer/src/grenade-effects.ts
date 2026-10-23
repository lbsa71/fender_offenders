import type {GrenadeState,PlanarPose} from '@fender/contracts';
import type {Scene} from '@babylonjs/core/scene';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {InstancedMesh} from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {MeshBuilder} from './primitives';
export interface GrenadeOptions{reducedMotion?:boolean;reducedFlash?:boolean}
export interface GrenadeVisualPose{x:number;y:number;z:number;spin:number;landed:boolean}
export interface GrenadeCue{kind:'lob'|'land'|'fuse'|'blast';position:PlanarPose;grenadeId:string}
const CAPACITY=8,BLAST_LIFE=1.6;
function valid(g:GrenadeState):boolean{return [g.origin.x,g.origin.z,g.target.x,g.target.z,g.bornTick,g.landsAtTick,g.detonatesAtTick,g.blastRadius].every(Number.isFinite)&&g.landsAtTick>g.bornTick&&g.detonatesAtTick>g.landsAtTick&&g.blastRadius>0;}
export function grenadeVisualPose(g:GrenadeState,tick:number,reducedMotion=false):GrenadeVisualPose|null{
 if(!valid(g)||!Number.isFinite(tick))return null;
 const elapsed=Math.max(0,tick-g.bornTick),progress=Math.max(0,Math.min(1,elapsed/(g.landsAtTick-g.bornTick))),landed=tick>=g.landsAtTick,settling=Math.max(0,tick-g.landsAtTick);
 return{x:g.origin.x+(g.target.x-g.origin.x)*progress,z:g.origin.z+(g.target.z-g.origin.z)*progress,y:reducedMotion?.45:landed?.45+Math.abs(Math.sin(settling*.42))*.27*Math.exp(-settling/12):1.2-.75*progress+24*progress*(1-progress),spin:reducedMotion?0:landed?Math.sin(settling*.3)*.1*Math.exp(-settling/10):elapsed*.17,landed};
}
interface GrenadeSlot{id:string|null;body:TransformNode;warning:TransformNode;fuse:InstancedMesh;smoke:InstancedMesh[];landed:boolean;fuseBeat:number}
interface BlastSlot{id:string|null;root:TransformNode;age:number;fresh:boolean;radius:number;reducedMotion:boolean;reducedFlash:boolean;fire:InstancedMesh[];smoke:InstancedMesh[];rings:InstancedMesh[];sparks:InstancedMesh[]}
export class GrenadeEffects{
 private slots:GrenadeSlot[]=[];private blasts:BlastSlot[]=[];private sources:Mesh[]=[];private materials:StandardMaterial[]=[];
 private retired=new Map<string,number>();private exploded=new Set<string>();private heardThrows=new Set<string>();private cues:GrenadeCue[]=[];
 private latestTick=0;private disposed=false;
 constructor(private scene:Scene){
  const material=(name:string,color:string,glow=false,alpha=1)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.setAll(0);m.alpha=alpha;if(glow){m.disableLighting=true;m.emissiveColor=m.diffuseColor;}this.materials.push(m);return m;};
  const amber=material('grenade-warning-amber','#ffbe3d',true),red=material('grenade-warning-red','#e36736',true),ink=material('grenade-warning-ink','#29373c'),olive=material('grenade-olive','#547159'),metal=material('grenade-lever-metal','#d8d4ad');
  const orange=material('grenade-fire-orange','#f07629',true),hot=material('grenade-fire-core','#ffe2a1',true),smoke=material('grenade-smoke-grey','#657370',false,.82);
  const source=(mesh:Mesh,m:StandardMaterial)=>{mesh.material=m;mesh.isVisible=false;mesh.isPickable=false;mesh.renderingGroupId=1;this.sources.push(mesh);return mesh;};
  const warning=source(MeshBuilder.CreateTorus('grenade-warning-source',{diameter:2,thickness:.027,tessellation:64},scene),amber),outline=source(MeshBuilder.CreateTorus('grenade-warning-outline-source',{diameter:2,thickness:.065,tessellation:64},scene),ink);
  const hatches:Mesh[]=[];for(let i=0;i<20;i++){const a=i*Math.PI/10,m=MeshBuilder.CreateBox('grenade-hatch',{width:.045,height:.012,depth:.17},scene);m.position.set(Math.sin(a)*.94,0,Math.cos(a)*.94);m.rotation.y=a+.55;hatches.push(m);}const hatch=source(Mesh.MergeMeshes(hatches,true,true)!,red);hatch.name='grenade-warning-hatch-source';
  const shell=source(MeshBuilder.CreateIcoSphere('grenade-shell-source',{radius:.43,subdivisions:1},scene),olive),band=source(MeshBuilder.CreateTorus('grenade-band-source',{diameter:.75,thickness:.075,tessellation:12},scene),amber),cap=source(MeshBuilder.CreateCylinder('grenade-cap-source',{diameter:.23,height:.19,tessellation:8},scene),metal),lever=source(MeshBuilder.CreateBox('grenade-lever-source',{width:.1,height:.1,depth:.55},scene),metal);
  const flame=source(MeshBuilder.CreateIcoSphere('grenade-fire-source',{radius:1,subdivisions:1},scene),orange),core=source(MeshBuilder.CreateIcoSphere('grenade-hot-source',{radius:1,subdivisions:1},scene),hot),cloud=source(MeshBuilder.CreateIcoSphere('grenade-smoke-source',{radius:1,subdivisions:1},scene),smoke),wave=source(MeshBuilder.CreateTorus('grenade-wave-source',{diameter:2,thickness:.045,tessellation:48},scene),amber),spark=source(MeshBuilder.CreateIcoSphere('grenade-spark-source',{radius:1,subdivisions:0},scene),hot);
  const instance=(mesh:Mesh,name:string,parent:TransformNode)=>{const m=mesh.createInstance(name);m.parent=parent;m.isVisible=true;m.isPickable=false;return m;};
  for(let i=0;i<CAPACITY;i++){
   const body=new TransformNode(`grenade-body-${i}`,scene),ground=new TransformNode(`grenade-warning-${i}`,scene);body.setEnabled(false);ground.setEnabled(false);
   instance(shell,`grenade-${i}-shell`,body);instance(band,`grenade-${i}-band`,body);const top=instance(cap,`grenade-${i}-cap`,body);top.position.y=.43;const handle=instance(lever,`grenade-${i}-lever`,body);handle.position.set(0,.5,.13);handle.rotation.x=.45;
   const fuse=instance(spark,`grenade-${i}-fuse`,body);fuse.position.set(0,.66,.28);fuse.scaling.setAll(.1);
   const wisps:InstancedMesh[]=[];for(let n=0;n<3;n++){const m=instance(cloud,`grenade-${i}-fuse-smoke-${n}`,body);wisps.push(m);}
   const base=instance(outline,`grenade-${i}-warning-outline`,ground);base.position.y=-.0325;instance(warning,`grenade-${i}-warning-ring`,ground);instance(hatch,`grenade-${i}-warning-hatches`,ground);
   this.slots.push({id:null,body,warning:ground,fuse,smoke:wisps,landed:false,fuseBeat:-1});
   const root=new TransformNode(`grenade-blast-${i}`,scene);root.setEnabled(false);const blast:BlastSlot={id:null,root,age:BLAST_LIFE,fresh:false,radius:1,reducedFlash:false,reducedMotion:false,fire:[],smoke:[],rings:[],sparks:[]};
   blast.fire.push(instance(core,`grenade-blast-${i}-core`,root));for(let n=0;n<7;n++)blast.fire.push(instance(flame,`grenade-blast-${i}-fire-${n}`,root));for(let n=0;n<8;n++){blast.smoke.push(instance(cloud,`grenade-blast-${i}-smoke-${n}`,root));blast.sparks.push(instance(spark,`grenade-blast-${i}-spark-${n}`,root));}for(let n=0;n<2;n++)blast.rings.push(instance(wave,`grenade-blast-${i}-ring-${n}`,root));this.blasts.push(blast);
  }
 }
 private remember<T>(set:Set<T>,value:T):void{set.add(value);if(set.size>256)set.delete(set.values().next().value!);}
 private retire(id:string,tick:number):void{this.retired.set(id,tick);if(this.retired.size>256)this.retired.delete(this.retired.keys().next().value!);for(const slot of this.slots)if(slot.id===id)this.clearSlot(slot);}
 private clearSlot(slot:GrenadeSlot):void{slot.id=null;slot.body.setEnabled(false);slot.warning.setEnabled(false);}
 private cue(kind:GrenadeCue['kind'],position:PlanarPose,id:string):void{if(this.cues.length>=32)this.cues.shift();this.cues.push({kind,position,grenadeId:id});}
 render(grenades:readonly GrenadeState[],tick:number,options:GrenadeOptions={}):void{
  if(this.disposed)return;tick=Number.isFinite(tick)?tick:this.latestTick;this.latestTick=Math.max(this.latestTick,tick);
  for(const slot of this.slots)if(slot.id&&!grenades.some(g=>g.entityId===slot.id&&valid(g)))this.clearSlot(slot);
  for(const g of grenades){
   if(this.retired.has(g.entityId)||!valid(g))continue;if(tick>=g.detonatesAtTick){this.retire(g.entityId,g.detonatesAtTick);continue;}
   const pose=grenadeVisualPose(g,tick,!!options.reducedMotion);if(!pose)continue;
   let slot=this.slots.find(s=>s.id===g.entityId);if(!slot){slot=this.slots.find(s=>s.id===null);if(!slot)continue;slot.id=g.entityId;slot.landed=pose.landed;slot.fuseBeat=-1;if(tick<=g.bornTick+5)this.noteThrow(g);if(pose.landed&&tick<=g.landsAtTick+3)this.cue('land',g.target,g.entityId);}
   if(pose.landed&&!slot.landed)this.cue('land',g.target,g.entityId);slot.landed=pose.landed;
   slot.body.setEnabled(true);slot.body.position.set(-pose.x,pose.y,pose.z);slot.body.rotation.set(pose.spin*.6,0,pose.spin);slot.warning.setEnabled(true);slot.warning.position.set(-g.target.x,.065,g.target.z);slot.warning.scaling.set(g.blastRadius,1,g.blastRadius);
   // The warning perimeter never pulses in size: it is the actual authority damage radius.
   slot.fuse.isVisible=options.reducedFlash?false:Math.floor(tick/3)%2===0;
   for(let i=0;i<slot.smoke.length;i++){const m=slot.smoke[i]!,phase=((Math.max(0,tick-g.bornTick)+i*9)%30)/30;m.isVisible=!options.reducedMotion||i===0;m.position.set(options.reducedMotion?0:phase*.25,.64+(options.reducedMotion?.2:phase*.85),.28);m.scaling.setAll((.075+phase*.12)*(options.reducedMotion?.65:1));}
   if(pose.landed){const beat=Math.floor(tick/24);if(beat!==slot.fuseBeat){slot.fuseBeat=beat;this.cue('fuse',g.target,g.entityId);}}
  }
 }
 noteThrow(g:GrenadeState):boolean{if(this.disposed||!valid(g)||this.retired.has(g.entityId)||this.heardThrows.has(g.entityId)||this.latestTick>=g.detonatesAtTick)return false;this.remember(this.heardThrows,g.entityId);this.cue('lob',g.origin,g.entityId);return true;}
 explode(id:string,position:PlanarPose,radius:number,tick:number,options:GrenadeOptions={}):boolean{
  if(this.disposed||this.exploded.has(id)||![position.x,position.z,radius,tick].every(Number.isFinite)||radius<=0)return false;
  this.retire(id,tick);this.remember(this.exploded,id);for(let i=this.cues.length-1;i>=0;i--)if(this.cues[i]!.grenadeId===id)this.cues.splice(i,1);if(this.latestTick-tick>90)return false;
  const slot=this.blasts.find(s=>s.id===null)??this.blasts.reduce((a,b)=>a.age>=b.age?a:b);slot.id=id;slot.age=0;slot.fresh=true;slot.radius=radius;slot.reducedMotion=!!options.reducedMotion;slot.reducedFlash=!!options.reducedFlash;slot.root.position.set(-position.x,0,position.z);slot.root.setEnabled(true);this.sampleBlast(slot);this.cue('blast',position,id);return true;
 }
 private sampleBlast(slot:BlastSlot):void{
  const age=slot.age,radius=slot.radius,burst=.3+Math.sin(Math.min(1,age/.65)*Math.PI)*.7,reduced=slot.reducedMotion,flash=slot.reducedFlash;
  for(let i=0;i<slot.fire.length;i++){const m=slot.fire[i]!,a=i*Math.PI*2/7;m.isVisible=age<.65&&(!flash||i>0&&i<4);const size=radius*(i===0?.4:.32)*burst*(reduced?.45:flash?.6:1);m.scaling.set(size,size*(i===0?1.3:1),size);m.position.set(i===0?0:Math.sin(a)*radius*.3*burst,(i===0?1:1.2)+burst*(reduced?.2:1.7),i===0?0:Math.cos(a)*radius*.3*burst);}
  for(let i=0;i<slot.smoke.length;i++){const m=slot.smoke[i]!,a=i*Math.PI/4,fade=Math.min(1,Math.max(0,(BLAST_LIFE-age)/.4));m.isVisible=!reduced||i<4;const size=radius*(.1+Math.min(age,1)*.24)*fade*(reduced?.6:1);m.scaling.set(size,size*1.25,size);m.position.set(Math.sin(a)*radius*(reduced?.15:.15+age*.18),.7+age*(reduced?.4:2.2+i*.08),Math.cos(a)*radius*(reduced?.15:.15+age*.18));}
  for(let i=0;i<slot.rings.length;i++){const m=slot.rings[i]!;m.isVisible=!flash&&!reduced&&age<.7;const size=radius*Math.min(1,.16+age*(i===0?2.6:1.8));m.scaling.set(size,.6,size);m.position.y=.07+i*.08;}
  for(let i=0;i<slot.sparks.length;i++){const m=slot.sparks[i]!,a=i*Math.PI/4;m.isVisible=!reduced&&!flash&&age<.65;const distance=radius*(.1+age*1.3);m.position.set(Math.sin(a)*distance,.6+age*7-age*age*7,Math.cos(a)*distance);m.scaling.set(.08,.24*(1-age),.08);m.rotation.z=a+age*8;}
 }
 update(delta:number,options:GrenadeOptions={}):void{if(this.disposed)return;const dt=Math.min(.2,Math.max(0,Number.isFinite(delta)?delta:0));for(const slot of this.blasts){if(slot.id===null)continue;slot.reducedFlash||=!!options.reducedFlash;slot.reducedMotion||=!!options.reducedMotion;if(slot.fresh)slot.fresh=false;else slot.age+=dt;if(slot.age>=BLAST_LIFE-.00001){slot.id=null;slot.root.setEnabled(false);}else this.sampleBlast(slot);}}
 drainCues(consumer:(cue:GrenadeCue)=>void):void{for(const cue of this.cues)consumer(cue);this.cues.length=0;}
 reset():void{for(const slot of this.slots)this.clearSlot(slot);for(const slot of this.blasts){slot.id=null;slot.root.setEnabled(false);}this.retired.clear();this.exploded.clear();this.heardThrows.clear();this.cues.length=0;this.latestTick=0;}
 getStats(){let grenades=0,grenadeWarnings=0,grenadeBlasts=0,grenadeFireballs=0,grenadeSmoke=0,grenadeSparks=0;for(const s of this.slots)if(s.id!==null){grenades++;if(s.warning.isEnabled())grenadeWarnings++;}for(const s of this.blasts)if(s.id!==null){grenadeBlasts++;for(const m of s.fire)if(m.isVisible)grenadeFireballs++;for(const m of s.smoke)if(m.isVisible)grenadeSmoke++;for(const m of s.sparks)if(m.isVisible)grenadeSparks++;}return{grenades,grenadeWarnings,grenadeBlasts,grenadeFireballs,grenadeSmoke,grenadeSparks};}
 dispose():void{if(this.disposed)return;this.reset();this.disposed=true;for(const s of this.slots){s.body.dispose();s.warning.dispose();}for(const s of this.blasts)s.root.dispose();for(const m of this.sources)m.dispose();for(const m of this.materials)m.dispose();this.slots=[];this.blasts=[];this.sources=[];this.materials=[];}
}
