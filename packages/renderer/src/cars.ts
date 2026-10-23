import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from './primitives';
import { newCartoonMotion, type CartoonMotion } from './deformation';
import {newVehicleFeedback,type VehicleFeedback} from './feedback';

export const VEHICLE_PAINT_COLORS:Readonly<Record<string,string>>={patrol:'#ece5cf',roadster:'#e98a48',interceptor:'#407c91',army:'#69754a',ambulance:'#f4efe0','fire-chief':'#bd4c3d',traffic:'#cbb26e'};

export interface CarVisual { entityId:string;wreckLifeFloor:number;wreckParts:InstancedMesh[];wreckLife:number|null;explodedLife:number|null;root: TransformNode; suspension: TransformNode; body: TransformNode; bodyAssetId:string; traffic:boolean; motion:CartoonMotion;feedback:VehicleFeedback;lastCrashAt:number;lastCrashTick:number; lastBumpId:string|null;lastBumpAt:number; parts: InstancedMesh[]; sirenRed: InstancedMesh | null; sirenBlue: InstancedMesh | null; health: Mesh; healthBack: Mesh; marker: Mesh; previousX: number; previousZ: number; previousYaw: number; discontinuity: number }

export class CarFactory {
  private templates = new Map<string, Mesh[]>();
  private materials = new Map<string, Material>();
  private charredTemplate:Mesh|null=null;
  constructor(private scene: Scene) {}

  private material(id: string, color: string, metal = 0, glow = false): Material {
    let m=this.materials.get(id);
    if (!m) {
      if (metal) {
        const p=new PBRMaterial(id,this.scene);p.albedoColor=Color3.FromHexString(color);p.metallic=metal;p.roughness=.28;p.clearCoat.isEnabled=true;p.clearCoat.intensity=.8;p.clearCoat.roughness=.18;m=p;
      } else {
        const s=new StandardMaterial(id,this.scene);s.diffuseColor=Color3.FromHexString(color);s.specularColor.set(.14,.14,.14);if(glow)s.emissiveColor=Color3.FromHexString(color).scale(.9);m=s;
      }
      this.materials.set(id,m);
    }
    return m;
  }

  private template(body: string, traffic: boolean): Mesh[] {
    const type=traffic?'traffic':body==='army'||body==='ambulance'||body==='fire-chief'?body:body.includes('roadster')?'roadster':body.includes('interceptor')?'interceptor':'patrol';
    const cached=this.templates.get(type);if(cached)return cached;
    const parts=new Map<string,{material:Material;meshes:Mesh[];role:'body'|'wheel'}>();
    const colors=VEHICLE_PAINT_COLORS;
    const paint=this.material(`paint-${type}`,colors[type]!, .4);
    const navy=this.material('navy','#234953',.3),glass=this.material('glass','#244653',.65),rubber=this.material('rubber','#263438'),chrome=this.material('chrome','#adb8ae',.8),headlight=this.material('headlight','#ffe4a1',0,true),tail=this.material('tail','#e87354',0,true);
    const add=(mesh:Mesh,m:Material,role:'body'|'wheel'='body')=>{mesh.material=m;const key=`${m.name}/${role}`;const group=parts.get(key)??{material:m,meshes:[],role};group.meshes.push(mesh);parts.set(key,group);return mesh;};
    const box=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,m:Material)=>{const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);mesh.position.set(x,y,z);return add(mesh,m);};
    const hull=(name:string,rings:Array<[number,number,number,number]>,m:Material)=>{
      const positions:number[]=[],indices:number[]=[];
      for(const [y,w,front,rear] of rings){const b=.2;positions.push(-w+b,y,rear,w-b,y,rear,w,y,rear+b,w,y,front-b,w-b,y,front,-w+b,y,front,-w,y,front-b,-w,y,rear+b);}
      for(let j=0;j<rings.length-1;j++)for(let k=0;k<8;k++){const a=j*8+k,b=j*8+(k+1)%8,c=(j+1)*8+k,d=(j+1)*8+(k+1)%8;indices.push(a,c,b,b,c,d);}
      for(let k=1;k<7;k++){indices.push(0,k,k+1);const t=(rings.length-1)*8;indices.push(t,t+k+1,t+k);}
      // Babylon primitives use clockwise indices; convert our authored outward CCW faces before batching.
      for(let i=0;i<indices.length;i+=3){const a=indices[i]!;indices[i]=indices[i+2]!;indices[i+2]=a;}
      const mesh=new Mesh(name,this.scene),v=new VertexData();v.positions=positions;v.indices=indices;v.normals=[];v.uvs=Array(positions.length/3*2).fill(0);VertexData.ComputeNormals(positions,indices,v.normals);v.applyToMesh(mesh);return add(mesh,m);
    };
    const sporty=type==='roadster';const length=sporty?2:2.2;
    hull('paint-shell',[[.42,.83,length-.15,-length+.15],[.65,.98,length,-length],[1.03,.93,length-.12,-length+.1],[1.13,.87,length-.3,-length+.2]],paint);
    box('undercarriage',0,.45,0,1.65,.25,3.7,rubber);
    // Four substantial tires, with silver hubs and inset charcoal centers.
    for(const x of [-.96,.96])for(const z of [-1.32,1.32]){
      const wheel=MeshBuilder.CreateCylinder('tire',{height:.31,diameter:.83,tessellation:16},this.scene);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.46,z);add(wheel,rubber,'wheel');
      const hub=MeshBuilder.CreateCylinder('hub',{height:.335,diameter:.49,tessellation:12},this.scene);hub.rotation.z=Math.PI/2;hub.position.set(x,.46,z);add(hub,chrome,'wheel');
      const cap=MeshBuilder.CreateCylinder('hub-cap',{height:.35,diameter:.2,tessellation:8},this.scene);cap.rotation.z=Math.PI/2;cap.position.set(x,.46,z);add(cap,navy,'wheel');
    }
    const utility=type==='army'||type==='fire-chief';
    const roofY=utility?2.08:sporty?1.6:1.85;
    hull('windshield',[[1.1,.79,type==='ambulance'?1.22:.73,utility?-1.55:-.95],[utility?2.02:sporty?1.58:1.83,.65,type==='ambulance'?.8:utility?.48:.28,utility?-1.35:-.67]],glass);
    box('roof',0,roofY,type==='ambulance'?.72:utility?-.46:-.2,1.34,.12,type==='ambulance'?.78:utility?1.9:.98,paint);
    for(const x of [-.72,.72]){
      box('pillar',x,utility?1.62:1.43,-.25,.09,utility?.9:.65,.1,paint);
      if(utility)box('rear-pillar',x,1.62,-1.32,.09,.9,.12,paint);
      box('mirror',x*1.5,1.2,.5,.25,.2,.35,paint);
      box('door-handle',x*1.3,1.05,-.5,.05,.08,.26,chrome);
      box('body-stripe',x*1.32,.88,0,.035,.23,3.55,navy);
      box('window-sill',x*1.1,1.17,-.1,.05,.06,1.7,chrome);
    }
    // Painted hood/trunk, bumpers and inset front grille.
    box('hood',0,1.12,1.33,1.5,.05,.9,paint);
    box('bumper',0,.65,length+.03,1.85,.17,.2,chrome);
    box('bumper',0,.63,-length-.03,1.85,.17,.2,chrome);
    box('grille',0,.87,length-.035,.8,.25,.06,rubber);
    for(let x=-.3;x<=.3;x+=.15)box('grille-slat',x,.88,length+.005,.045,.22,.04,chrome);
    for(const s of [-1,1]){
      box('headlamp',s*.67,.9,length-.02,.43,.25,.08,headlight);
      box('taillamp',s*.64,.9,-length+.02,.52,.2,.08,tail);
      box('gun',s*.63,1.17,1.45,.13,.13,1.05,navy);
    }
    box('plate',0,.69,-length-.15,.45,.16,.03,headlight);
    const lightbar=(y:number,z:number)=>{
      box('lightbar-base',0,y,z,1.28,.12,.35,navy);
      box('red-siren',-.36,y+.15,z,.57,.23,.32,this.material('red-siren','#fa7964',0,true));
      box('blue-siren',.36,y+.15,z,.57,.23,.32,this.material('blue-siren','#57c9dc',0,true));
    };
    if(type==='patrol'){
      lightbar(2,-.2);
      for(const x of [-.947,.947]){
        const badge=MeshBuilder.CreateCylinder('badge',{height:.04,diameter:.32,tessellation:6},this.scene);badge.rotation.z=Math.PI/2;badge.position.set(x,.97,-.25);add(badge,this.material('badge','#e4c77c',.3));
      }
    }else if(type==='army'){
      // Upright utility cabin, roof rack and a real vertical rear-mounted spare.
      for(const x of [-.65,.65])box('rack-rail',x,2.24,-.5,.09,.14,1.9,navy);
      for(const z of [-1.25,.25])box('rack-crossbar',0,2.24,z,1.4,.09,.09,navy);
      const spare=MeshBuilder.CreateCylinder('rear-spare',{height:.4,diameter:.98,tessellation:16},this.scene);spare.rotation.x=Math.PI/2;spare.position.set(0,1.57,-2.16);add(spare,rubber);
      const spareHub=MeshBuilder.CreateCylinder('spare-hub',{height:.42,diameter:.48,tessellation:12},this.scene);spareHub.rotation.x=Math.PI/2;spareHub.position.set(0,1.57,-2.16);add(spareHub,paint);
      box('jerry-can',.7,1.38,-2.18,.35,.58,.25,paint);
      box('bullbar',0,1,2.24,1.8,.1,.13,navy);
      for(const x of [-.65,.65])box('bullbar-upright',x,.88,2.24,.1,.5,.13,navy);
    }else if(type==='ambulance'){
      const medical=this.material('medical-cross','#318c88',.12),red=this.material('medical-service','#c94b43',.12);
      box('medical-box',0,1.76,-.85,1.94,1.65,2.5,paint);
      box('medical-roof-cap',0,2.61,-.85,2,.1,2.54,paint);
      for(const x of [-.985,.985]){
        box('medical-belt',x,1.38,-.85,.035,.18,2.48,red);
        box('cross-vertical',x,2.07,-.8,.045,.7,.22,medical);
        box('cross-horizontal',x,2.07,-.8,.045,.22,.7,medical);
      }
      box('rear-cross-vertical',0,2.07,-2.115,.22,.7,.04,medical);
      box('rear-cross-horizontal',0,2.07,-2.115,.7,.22,.04,medical);
      box('rear-door-seam',0,1.6,-2.125,.025,1.18,.025,chrome);
      for(const x of [-.68,.68])box('rear-box-lamp',x,2.4,-2.125,.18,.15,.05,tail);
      lightbar(2.71,.15);
    }else if(type==='fire-chief'){
      const stripe=this.material('fire-service','#f2d18a',.15),white=this.material('service-white','#f1e9d1',.3);
      box('white-roof',0,2.15,-.46,1.38,.09,1.94,white);
      for(const x of [-.956,.956]){
        box('chief-service-stripe',x,1.01,-.05,.035,.11,3.55,stripe);
        box('rear-step',x,.53,-1.7,.23,.12,.7,chrome);
      }
      box('rear-window',0,1.7,-1.65,1.3,.55,.055,glass);
      lightbar(2.29,.12);
    }else if(type==='interceptor')box('spoiler',0,1.3,-1.8,1.9,.1,.33,navy);
    else if(sporty){box('racing-stripe',0,1.16,1.25,.25,.03,1.1,navy);box('racing-stripe',0,1.16,-1.55,.25,.03,.7,navy);}
    const meshes:Mesh[]=[];
    for(const {material:m,meshes:list,role} of parts.values()){const merged=Mesh.MergeMeshes(list,true,true,undefined,false,false);if(merged){merged.material=m;merged.isVisible=false;merged.name=m.name;merged.metadata={role};merged.receiveShadows=true;meshes.push(merged);}}
    this.templates.set(type,meshes);return meshes;
  }

  private charred():Mesh{
    if(this.charredTemplate)return this.charredTemplate;
    const pieces:Mesh[]=[];
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,tilt=0)=>{const mesh=MeshBuilder.CreateBox('charred-metal',{width:w,height:h,depth:d},this.scene);mesh.position.set(x,y,z);mesh.rotation.x=tilt;pieces.push(mesh);};
    box(0,.35,0,1.68,.24,3.7);box(0,.5,1.3,1.4,.14,.9,-.23);box(0,.5,-1.35,1.45,.12,.7,.2);
    for(const x of [-.74,.74]){box(x,.72,-.4,.07,.65,1.6);box(x,1.02,-.43,.08,.07,1.65);}
    for(const z of [-1.32,1.32])box(0,.42,z,2.05,.12,.12);
    const merged=Mesh.MergeMeshes(pieces,true,true,undefined,false,false)!;merged.name='charred-chassis-source';merged.material=this.material('charred-chassis','#263237');merged.isVisible=false;merged.receiveShadows=true;merged.metadata={wreckPart:true};return this.charredTemplate=merged;
  }
  create(entityId:string, body:string, traffic:boolean):CarVisual{
    const root=new TransformNode(`vehicle-${entityId}`,this.scene);
    const suspension=new TransformNode(`suspension-${entityId}`,this.scene);suspension.parent=root;
    const coachwork=new TransformNode(`body-${entityId}`,this.scene);coachwork.parent=suspension;coachwork.setPivotPoint(new Vector3(0,.55,0));
    const parts=this.template(body,traffic).map((mesh)=>{const i=mesh.createInstance(`${entityId}-${mesh.name}`);i.parent=mesh.metadata?.role==='wheel'?suspension:coachwork;i.isVisible=true;return i;});
    const chassis=this.charred().createInstance(`${entityId}-charred-chassis`);chassis.parent=root;chassis.isVisible=false;const wreckParts=[chassis];
    const healthBack=MeshBuilder.CreateBox(`${entityId}-health-back`,{width:2.2,height:.09,depth:.2},this.scene);healthBack.position.set(0,3.5,0);healthBack.parent=root;healthBack.material=this.material('health-back','#29464d');
    const health=MeshBuilder.CreateBox(`${entityId}-health`,{width:2,height:.1,depth:.21},this.scene);health.position.set(0,3.51,0);health.parent=root;health.material=this.material('health','#a6ddbd',0,true);
    const marker=MeshBuilder.CreateTorus(`${entityId}-marker`,{diameter:3,thickness:.065,tessellation:40},this.scene);marker.position.y=.08;marker.parent=root;marker.material=this.material('marker','#b9e8da',0,true);
    return{entityId,root,wreckParts,wreckLife:null,explodedLife:null,wreckLifeFloor:-1,suspension,body:coachwork,bodyAssetId:body,traffic,motion:newCartoonMotion(),feedback:newVehicleFeedback(),lastCrashAt:-10,lastCrashTick:-1,lastBumpId:null,lastBumpAt:-10,parts,sirenRed:parts.find((p)=>p.sourceMesh.name==='red-siren')??null,sirenBlue:parts.find((p)=>p.sourceMesh.name==='blue-siren')??null,health,healthBack,marker,previousX:0,previousZ:0,previousYaw:0,discontinuity:-1};
  }
  dispose():void{this.templates.clear();this.materials.clear();this.charredTemplate=null;}
}

/** Native instances support boolean visibility; status never mutates shared source/material alpha. */
export function updateCarStatus(car:CarVisual,protectedSpawn:boolean,time:number,reducedFlash:boolean,status:'active'|'wrecked'|'respawning'='active'):void{
  const visible=status==='active'&&(!protectedSpawn||reducedFlash||Math.sin(time*12)>-.4);
  for(const part of car.wreckParts)part.isVisible=status==='wrecked';
  for(const part of car.parts)part.isVisible=visible;
}
