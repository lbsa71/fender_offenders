import { Color3 } from '@babylonjs/core/Maths/math.color';
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

export interface CarVisual { root: TransformNode; parts: InstancedMesh[]; sirenRed: InstancedMesh | null; sirenBlue: InstancedMesh | null; health: Mesh; healthBack: Mesh; marker: Mesh; previousX: number; previousZ: number; previousYaw: number; discontinuity: number }

export class CarFactory {
  private templates = new Map<string, Mesh[]>();
  private materials = new Map<string, Material>();
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
    const type=traffic?'traffic':body.includes('roadster')?'roadster':body.includes('interceptor')?'interceptor':'patrol';
    const cached=this.templates.get(type);if(cached)return cached;
    const parts=new Map<Material,Mesh[]>();
    const paint=this.material(`paint-${type}`,type==='patrol'?'#ece5cf':type==='roadster'?'#e98a48':type==='interceptor'?'#407c91':'#cbb26e',.4);
    const navy=this.material('navy','#234953',.3),glass=this.material('glass','#244653',.65),rubber=this.material('rubber','#263438'),chrome=this.material('chrome','#adb8ae',.8),headlight=this.material('headlight','#ffe4a1',0,true),tail=this.material('tail','#e87354',0,true);
    const add=(mesh:Mesh,m:Material)=>{mesh.material=m;const a=parts.get(m)??[];a.push(mesh);parts.set(m,a);return mesh;};
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
      const wheel=MeshBuilder.CreateCylinder('tire',{height:.31,diameter:.83,tessellation:16},this.scene);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.46,z);add(wheel,rubber);
      const hub=MeshBuilder.CreateCylinder('hub',{height:.335,diameter:.49,tessellation:12},this.scene);hub.rotation.z=Math.PI/2;hub.position.set(x,.46,z);add(hub,chrome);
      const cap=MeshBuilder.CreateCylinder('hub-cap',{height:.35,diameter:.2,tessellation:8},this.scene);cap.rotation.z=Math.PI/2;cap.position.set(x,.46,z);add(cap,navy);
    }
    hull('windshield',[[1.1,.79,.73,-.95],[sporty?1.58:1.83,.65,.28,-.67]],glass);
    box('roof',0,sporty?1.6:1.85,-.2,1.34,.12,.98,paint);
    for(const x of [-.72,.72]){
      box('pillar',x,1.43,-.25,.09,.65,.1,paint);
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
    if(type==='patrol'){
      box('lightbar-base',0,2,-.2,1.28,.12,.35,navy);
      box('red-siren',-.36,2.15,-.2,.57,.23,.32,this.material('red-siren','#fa7964',0,true));
      box('blue-siren',.36,2.15,-.2,.57,.23,.32,this.material('blue-siren','#57c9dc',0,true));
      for(const x of [-.947,.947]){
        const badge=MeshBuilder.CreateCylinder('badge',{height:.04,diameter:.32,tessellation:6},this.scene);badge.rotation.z=Math.PI/2;badge.position.set(x,.97,-.25);add(badge,this.material('badge','#e4c77c',.3));
      }
    }else if(type==='interceptor')box('spoiler',0,1.3,-1.8,1.9,.1,.33,navy);
    else if(sporty){box('racing-stripe',0,1.16,1.25,.25,.03,1.1,navy);box('racing-stripe',0,1.16,-1.55,.25,.03,.7,navy);}
    const meshes:Mesh[]=[];
    for(const [m,list] of parts){const merged=Mesh.MergeMeshes(list,true,true,undefined,false,false);if(merged){merged.material=m;merged.isVisible=false;merged.name=m.name;merged.receiveShadows=true;meshes.push(merged);}}
    this.templates.set(type,meshes);return meshes;
  }

  create(entityId:string, body:string, traffic:boolean):CarVisual{
    const root=new TransformNode(`vehicle-${entityId}`,this.scene);
    const parts=this.template(body,traffic).map((mesh)=>{const i=mesh.createInstance(`${entityId}-${mesh.name}`);i.parent=root;i.isVisible=true;return i;});
    const healthBack=MeshBuilder.CreateBox(`${entityId}-health-back`,{width:2.2,height:.09,depth:.2},this.scene);healthBack.position.set(0,3.1,0);healthBack.parent=root;healthBack.material=this.material('health-back','#29464d');
    const health=MeshBuilder.CreateBox(`${entityId}-health`,{width:2,height:.1,depth:.21},this.scene);health.position.set(0,3.11,0);health.parent=root;health.material=this.material('health','#a6ddbd',0,true);
    const marker=MeshBuilder.CreateTorus(`${entityId}-marker`,{diameter:3,thickness:.065,tessellation:40},this.scene);marker.position.y=.08;marker.parent=root;marker.material=this.material('marker','#b9e8da',0,true);
    return{root,parts,sirenRed:parts.find((p)=>p.sourceMesh.name==='red-siren')??null,sirenBlue:parts.find((p)=>p.sourceMesh.name==='blue-siren')??null,health,healthBack,marker,previousX:0,previousZ:0,previousYaw:0,discontinuity:-1};
  }
  dispose():void{this.templates.clear();this.materials.clear();}
}
