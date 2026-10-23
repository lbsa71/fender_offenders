import type {RenderFrame,TargetIndicator} from '@fender/contracts';
import type {Scene} from '@babylonjs/core/scene';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {MeshBuilder} from './primitives';
import {targetIndicatorFromClip} from './target-projection';
export const TARGET_ANCHOR_HEIGHT=5.6;
export class TargetObjective{
 private readonly root:TransformNode;
 private readonly chevrons:Mesh;
 private readonly materials:StandardMaterial[]=[];
 private indicator:TargetIndicator|null=null;
 private distance=0;
 private bob=0;
 private disposed=false;
 constructor(private readonly scene:Scene){
  this.root=new TransformNode('wanted-objective-root',scene);
  const material=(name:string,color:string,emissive:boolean)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.setAll(0);if(emissive)m.emissiveColor=m.diffuseColor.scale(.8);m.disableLighting=emissive;this.materials.push(m);return m;};
  const gold=material('wanted-amber','#ffb52b',true),ink=material('wanted-outline','#35251e',false);
  const base=MeshBuilder.CreateTorus('wanted-ring-outline',{diameter:4.9,thickness:.22,tessellation:48},scene);base.parent=this.root;base.position.y=.075;base.material=ink;base.isPickable=false;
  const parts:Mesh[]=[MeshBuilder.CreateTorus('wanted-ring',{diameter:4.9,thickness:.115,tessellation:48},scene)];parts[0]!.position.y=.16;
  for(let i=0;i<4;i++)for(const side of [-1,1]){const arm=MeshBuilder.CreateBox('wanted-ground-chevron',{width:.65,height:.075,depth:.16},scene),angle=i*Math.PI/2;arm.position.set(Math.sin(angle)*3+Math.cos(angle)*side*.22,.14,Math.cos(angle)*3-Math.sin(angle)*side*.22);arm.rotation.y=angle+side*Math.PI/4;parts.push(arm);}
  const ring=Mesh.MergeMeshes(parts,true,true)!;ring.name='wanted-ring';ring.parent=this.root;ring.material=gold;ring.isPickable=false;
  const arms:Mesh[]=[];for(let row=0;row<3;row++)for(const side of [-1,1]){const arm=MeshBuilder.CreateBox('wanted-chevron-arm',{width:.72,height:.17,depth:.19},scene);arm.position.set(side*.23,row*.55+.23,0);arm.rotation.z=side*Math.PI/4;arms.push(arm);}
  this.chevrons=Mesh.MergeMeshes(arms,true,true)!;this.chevrons.name='wanted-chevron-stack';this.chevrons.parent=this.root;this.chevrons.position.y=3.5;this.chevrons.material=gold;this.chevrons.billboardMode=Mesh.BILLBOARDMODE_ALL;this.chevrons.isPickable=false;
  // Readability through tall roofs, without additional lights or animated flashing.
  for(const mesh of this.root.getChildMeshes())mesh.renderingGroupId=1;
  this.hide();
 }
 update(frame:RenderFrame,time:number,reducedMotion:boolean):void{
  if(this.disposed)return;
  const pursuit=frame.pursuit,target=pursuit&&pursuit.state!=='complete'?frame.vehicles.find(v=>v.entityId===pursuit.suspectId):undefined;
  if(!target||target.status==='respawning'){this.hide();return;}
  this.root.setEnabled(true);this.root.position.set(-target.pose.x,0,target.pose.z);
  this.bob=reducedMotion?0:Math.sin(time*3)*.12;this.chevrons.position.y=3.5+this.bob;
  const local=frame.vehicles.find(v=>v.entityId===frame.localEntityId);this.distance=local?Math.hypot(target.pose.x-local.pose.x,target.pose.z-local.pose.z):0;
 }
 /** Call after scene.render(): that matrix includes this frame's camera smoothing and shake. */
 project(width:number,height:number):void{
  if(this.disposed||!this.root.isEnabled()||!this.scene.activeCamera){this.indicator=null;return;}
  const m=this.scene.getTransformMatrix().m,x=this.root.position.x,y=TARGET_ANCHOR_HEIGHT+this.bob,z=this.root.position.z;
  this.indicator=targetIndicatorFromClip({x:x*m[0]!+y*m[4]!+z*m[8]!+m[12]!,y:x*m[1]!+y*m[5]!+z*m[9]!+m[13]!,z:x*m[2]!+y*m[6]!+z*m[10]!+m[14]!,w:x*m[3]!+y*m[7]!+z*m[11]!+m[15]!},width,height,this.distance,this.scene.activeCamera.viewport);
 }
 getIndicator():TargetIndicator|null{return this.indicator;}
 hide():void{this.indicator=null;this.root.setEnabled(false);}
 dispose():void{if(this.disposed)return;this.disposed=true;this.indicator=null;this.root.dispose(false);for(const material of this.materials)material.dispose();}
}
