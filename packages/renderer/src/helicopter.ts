import type { Scene } from '@babylonjs/core/scene';
import { HELICOPTER_RULES, helicopterPoseAt, type HelicopterState, type PlanarPose } from '@fender/contracts';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from './primitives';
export class HelicopterVisual {
 private root:TransformNode;private rotor:TransformNode;private tailRotor:TransformNode;private marker:Mesh;private health:Mesh;private healthBack:Mesh;
 private materials:StandardMaterial[]=[];private retired=new Set<string>();private crashed=new Set<string>();private visible=false;private hp=0;private disposed=false;
 constructor(scene:Scene){
  this.root=new TransformNode('black-chopper',scene);this.root.scaling.x=-1;
  const material=(name:string,color:string,unlit=false)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(.08,.08,.08);m.disableLighting=unlit;if(unlit)m.emissiveColor=m.diffuseColor;this.materials.push(m);return m;};
  const black=material('chopper-black','#182126'),metal=material('chopper-metal','#52646a'),glass=material('chopper-glass','#39616b'),dark=material('chopper-health-back','#182327',true),green=material('chopper-health-fill','#86c67b',true),amber=material('chopper-flight-marker','#d6b86f',true);
  const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:StandardMaterial,parent:TransformNode=this.root)=>{const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);mesh.position.set(x,y,z);mesh.material=m;mesh.parent=parent;mesh.isPickable=false;return mesh;};
  const body=MeshBuilder.CreateIcoSphere('chopper-fuselage',{radius:1,subdivisions:1},scene);body.scaling.set(1.6,1.2,3.2);body.parent=this.root;body.material=black;body.isPickable=false;
  box('chopper-cockpit',0,.3,1.9,2.5,1.35,1.8,glass);box('chopper-nose',0,-.55,2.65,2.3,.55,1.5,black);
  box('chopper-tail',0,.1,-4.6,.5,.55,4.5,black);box('chopper-tail-fin',0,.8,-6.4,.18,1.8,1.2,black);box('chopper-tail-wing',0,.15,-5.8,3.8,.15,.8,metal);
  for(const side of [-1,1]){box('chopper-skid',side*1.3,-1.5,-.3,.15,.15,4.6,metal);for(const z of [-1.3,1.1])box('chopper-skid-strut',side*1.15,-1.1,z,.12,.9,.12,metal);}
  box('chopper-mast',0,1.5,-.4,.25,1.0,.25,metal);
  this.rotor=new TransformNode('chopper-rotor',scene);this.rotor.parent=this.root;this.rotor.position.set(0,2,-.4);
  box('chopper-main-blade-a',0,0,0,9,.09,.23,black,this.rotor);box('chopper-main-blade-b',0,0,0,.23,.09,9,black,this.rotor);
  this.tailRotor=new TransformNode('chopper-tail-rotor',scene);this.tailRotor.parent=this.root;this.tailRotor.position.set(.45,.8,-6.4);
  box('chopper-tail-blade-a',0,0,0,.12,2.1,.14,black,this.tailRotor);box('chopper-tail-blade-b',0,0,0,.12,.14,2.1,black,this.tailRotor);
  this.healthBack=box('chopper-health-back',0,3,0,4.2,.3,.15,dark);this.health=box('chopper-health',0,3.07,0,4,.22,.18,green);
  this.marker=MeshBuilder.CreateTorus('chopper-ground-marker',{diameter:5.3,thickness:.08,tessellation:32},scene);this.marker.material=amber;this.marker.isPickable=false;
  this.reset();
 }
 render(state:HelicopterState|undefined,tick:number,reducedMotion:boolean):PlanarPose|null{
  if(this.disposed)return null;
  this.visible=false;this.hp=state?.health??0;
  if(!state||state.phase==='away'||state.phase!=='downed'&&this.retired.has(state.entityId)){this.root.setEnabled(false);this.marker.isVisible=false;return null;}
  const pose=helicopterPoseAt(state,tick),down=state.phase==='downed',age=Math.max(0,(tick-state.startedAtTick)/Math.max(1,state.endsAtTick-state.startedAtTick));
  if(down){this.retired.add(state.entityId);if(this.retired.size>32)this.retired.delete(this.retired.values().next().value!);}
  if(down&&age>=1){
   this.root.setEnabled(false);this.marker.isVisible=false;
   if(!this.crashed.has(state.entityId)){this.crashed.add(state.entityId);if(this.crashed.size>32)this.crashed.delete(this.crashed.values().next().value!);if(tick-state.endsAtTick<=12)return pose;}return null;
  }
  this.visible=true;this.root.setEnabled(true);this.root.position.set(-pose.x,down?Math.max(.6,HELICOPTER_RULES.altitude*(1-age*age)):HELICOPTER_RULES.altitude,pose.z);
  this.root.rotation.set(down&&!reducedMotion?age*.6:0,-pose.yaw,down&&!reducedMotion?age*6:0);
  if(!reducedMotion){this.rotor.rotation.y=tick*.32;this.tailRotor.rotation.x=tick*.5;}
  this.marker.isVisible=!down;this.marker.position.set(-pose.x,.065,pose.z);
  this.health.isVisible=this.healthBack.isVisible=!down;this.health.scaling.x=Math.max(.001,state.health/HELICOPTER_RULES.health);this.health.position.x=-(1-state.health/HELICOPTER_RULES.health)*2;
  this.health.rotation.y=this.healthBack.rotation.y=pose.yaw;return null;
 }
 reset():void{this.visible=false;this.hp=0;this.root.setEnabled(false);this.marker.isVisible=false;}
 getStats(){return {helicopterVisible:this.visible,helicopterHealth:this.hp};}
 dispose():void{if(this.disposed)return;this.reset();this.disposed=true;this.root.dispose();this.marker.dispose();for(const m of this.materials)m.dispose();this.retired.clear();this.crashed.clear();}
}
