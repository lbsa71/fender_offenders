import {Color3} from '@babylonjs/core/Maths/math.color';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type {Scene} from '@babylonjs/core/scene';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type {PropState,PropKind} from '@fender/contracts';
import {buildings,districtSnowbanks} from '@fender/content';
import {MeshBuilder} from './primitives';

/** Rounded frosting and ploughed piles are actual geometry, separate from the packed-road coating. */
export class WinterScenery {
 private enabled=false;private disposed=false;private synced=false;private seen=new Set<string>();
 private caps:Mesh[]=[];private bankMesh:Mesh;private chunkMesh:Mesh;private intact=0;
 private chunks:Array<{x:number;y:number;z:number;vx:number;vy:number;vz:number;life:number;size:number}>=[];
 private hats=new Map<string,TransformNode>();private templates=new Map<PropKind,Mesh>();
 private materials:StandardMaterial[]=[];
 constructor(private scene:Scene,shadows?:ShadowGenerator){
  const material=(name:string,color:string)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(.06,.08,.1);m.specularPower=18;m.backFaceCulling=false;this.materials.push(m);return m;};
  const fresh=material('winter-fresh-snow','#e6f3ff'),shade=material('winter-snow-edge','#a9cce7');
  const batches:Mesh[][]=[[],[]];
  const pillow=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,batch=0)=>{const m=this.pillow(name,w,h,d);m.position.set(-x,y,z);m.material=batch?shade:fresh;batches[batch]!.push(m);return m;};
  for(const b of buildings){
   const roof=b.height+(b.kind==='house'?3.25:1.08),w=b.width+1.25,d=b.depth+1.25;
   if(b.kind==='house'){
    for(const side of [-1,0,1])pillow('roof-frosting',b.x+side*b.width*.28,roof-Math.abs(side)*1.4,b.z,w*.52,1.3,d);
   }else pillow('roof-frosting',b.x,roof,b.z,w,1.4,d);
   // Scallops hang over the eaves. Their blue underside gives the white cap a readable thickness.
   for(const side of [-1,1])for(let t=-w/2+1;t<w/2;t+=2.8){const y=b.height+(b.kind==='house'?.4:.76);pillow('eave-shadow',b.x+t,y,b.z+side*d/2,3,.65,1.35,1);pillow('eave-puff',b.x+t,y+.35,b.z+side*d/2,3.15,.9,1.6);}
  }
  batches.forEach((parts,i)=>{const mesh=Mesh.MergeMeshes(parts,true,true)!;mesh.name=`snow-cap-${i}`;mesh.material=i?shade:fresh;mesh.receiveShadows=true;shadows?.addShadowCaster(mesh);mesh.setEnabled(false);this.caps.push(mesh);});
  const lobes:Mesh[]=[];
  for(let i=0;i<8;i++){const m=MeshBuilder.CreateIcoSphere('pile-lobe',{radius:1,subdivisions:2,flat:false},scene);m.position.set(Math.sin(i*4)*.16,.45+(i%3)*.11,-5.6+i*1.6);m.scaling.set(.85+(i%2)*.13,.7+(i%3)*.09,1.35);m.material=fresh;lobes.push(m);}
  this.bankMesh=Mesh.MergeMeshes(lobes,true,true)!;this.bankMesh.name='snowbanks-fluffy';this.bankMesh.material=fresh;this.bankMesh.receiveShadows=true;this.bankMesh.setEnabled(false);shadows?.addShadowCaster(this.bankMesh);
  this.chunkMesh=MeshBuilder.CreateIcoSphere('snowbank-chunks',{radius:1,subdivisions:1,flat:false},scene);this.chunkMesh.material=fresh;this.chunkMesh.setEnabled(false);
  for(let i=0;i<96;i++)this.chunks.push({x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0,size:.1});
  // Per-kind caps follow the same full transform as authoritative tumbling furniture.
  const shapes:Partial<Record<PropKind,number[][]>>={tree:[[-.5,2.55,0,3.9,1.25,3.6],[.3,3.4,.3,3.5,1.2,3.1]],bench:[[0,.19,0,2.65,.38,.9],[0,.9,.28,2.7,.4,.5]],crate:[[0,.6,0,1.2,.38,1.2]],barrel:[[0,.72,0,1,.35,1]],bin:[[0,.65,0,1,.35,1]],sign:[[0,1.42,0,1.4,.25,.4]],lamp:[[-1.1,2.6,0,1.5,.35,.75]]};
  for(const [kind,parts] of Object.entries(shapes)){const meshes=parts.map(p=>{const m=this.pillow('snow-prop-source',p[3]!,p[4]!,p[5]!);m.position.set(p[0]!,p[1]!,p[2]!);m.material=fresh;return m;});const source=Mesh.MergeMeshes(meshes,true,true)!;source.name=`snow-hat-${kind}`;source.material=fresh;source.isVisible=false;this.templates.set(kind as PropKind,source);}
 }
 private pillow(name:string,w:number,h:number,d:number):Mesh{
  const positions:number[]=[],normals:number[]=[],indices:number[]=[],uvs:number[]=[];
  const half=[w/2,h/2,d/2],r=Math.min(h*.48,w*.25,d*.25),steps=4;
  for(let face=0;face<6;face++){const axis=Math.floor(face/2),side=face%2?1:-1,a=(axis+1)%3,b=(axis+2)%3,base=positions.length/3;
   for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){const p=[0,0,0];p[axis]=side*half[axis]!;p[a]=(i/steps*2-1)*half[a]!;p[b]=(j/steps*2-1)*half[b]!;const c=p.map((v,k)=>Math.max(-half[k]!+r,Math.min(half[k]!-r,v))),delta=p.map((v,k)=>v-c[k]!),len=Math.hypot(...delta)||1,n=delta.map(v=>v/len);positions.push(...c.map((v,k)=>v+n[k]!*r));normals.push(...n);uvs.push(i/steps,j/steps);}
   for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){const q=base+j*(steps+1)+i;indices.push(q,q+1,q+steps+1,q+1,q+steps+2,q+steps+1);}
  }
  const mesh=new Mesh(name,this.scene),v=new VertexData();v.positions=positions;v.normals=normals;v.indices=indices;v.uvs=uvs;v.applyToMesh(mesh);return mesh;
 }
 setEnabled(enabled:boolean){if(this.disposed||enabled===this.enabled)return;this.enabled=enabled;this.synced=false;this.seen.clear();for(const m of this.caps)m.setEnabled(enabled);if(!enabled){this.intact=0;this.bankMesh.setEnabled(false);this.chunkMesh.setEnabled(false);for(const c of this.chunks)c.life=0;for(const h of this.hats.values())h.setEnabled(false);}}
 update(dt:number,broken:readonly string[],props:readonly PropState[],reduced:boolean){
  if(!this.enabled||this.disposed)return;
  const next=new Set(broken),changed=!this.synced||next.size!==this.seen.size||[...next].some(id=>!this.seen.has(id));
  if(changed){
   const matrices:number[]=[];let burst=0;
   for(const bank of districtSnowbanks){if(next.has(bank.id)){if(this.synced&&!this.seen.has(bank.id)&&!reduced&&burst++<8)this.burst(bank.x,bank.z);continue;}
    Matrix.Compose(new Vector3(bank.width/1.8,bank.height/1.4,bank.length/13),Quaternion.RotationYawPitchRoll(-bank.yaw,0,0),new Vector3(-bank.x,.12,bank.z)).copyToArray(matrices,matrices.length);
   }
   this.intact=matrices.length/16;this.bankMesh.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);this.bankMesh.setEnabled(this.intact>0);this.seen=next;this.synced=true;
  }
  const ids=new Set<string>();for(const p of props.slice(0,192)){ids.add(p.entityId);let root=this.hats.get(p.entityId);if(!root){root=new TransformNode(`snow-prop-${p.entityId}`,this.scene);const source=this.templates.get(p.kind);if(source)source.createInstance(`snow-hat-${p.entityId}`).parent=root;this.hats.set(p.entityId,root);}root.setEnabled(true);root.position.set(-p.position.x,p.position.y,p.position.z);const q=p.rotation;root.rotationQuaternion=new Quaternion(q.x,-q.y,-q.z,q.w);root.scaling.set(-p.scale,p.scale,p.scale);}
  for(const [id,h] of this.hats)if(!ids.has(id)){h.dispose();this.hats.delete(id);}
  const matrices:number[]=[];for(const c of this.chunks){if(reduced)c.life=0;if(c.life<=0)continue;c.life-=Math.max(0,Math.min(.1,dt));if(c.life<=0)continue;c.x+=c.vx*dt;c.y+=c.vy*dt;c.z+=c.vz*dt;c.vy-=9*dt;const size=c.size*Math.min(1,c.life*2);Matrix.Compose(new Vector3(size,size,size),Quaternion.Identity(),new Vector3(c.x,Math.max(.08,c.y),c.z)).copyToArray(matrices,matrices.length);}
  this.chunkMesh.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);this.chunkMesh.setEnabled(matrices.length>0);
 }
 private burst(x:number,z:number){let emitted=0;for(const c of this.chunks){if(c.life>0)continue;const angle=emitted*2.39996;c.x=-x;c.y=.7;c.z=z;c.vx=Math.sin(angle)*(2+emitted%4);c.vz=Math.cos(angle)*(2+emitted%3);c.vy=2.5+(emitted%4)*.8;c.life=.7+(emitted%3)*.2;c.size=.16+(emitted%4)*.09;if(++emitted===16)break;}}
 resetEffects(){for(const c of this.chunks)c.life=0;this.chunkMesh.setEnabled(false);this.synced=false;this.seen.clear();}
 getStats(){return{snowCaps:this.enabled?this.caps.length:0,snowbanks:this.enabled?this.intact:0,snowChunks:this.enabled?this.chunks.filter(c=>c.life>0).length:0,snowChunkCapacity:this.disposed?0:96};}
 dispose(){if(this.disposed)return;this.setEnabled(false);this.disposed=true;for(const m of [...this.caps,this.bankMesh,this.chunkMesh,...this.templates.values()])m.dispose();for(const h of this.hats.values())h.dispose();for(const m of this.materials)m.dispose();this.hats.clear();this.templates.clear();}
}
