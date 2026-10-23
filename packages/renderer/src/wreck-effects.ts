import type {Scene} from '@babylonjs/core/scene';
import type {PlanarPose} from '@fender/contracts';
import {Color3} from '@babylonjs/core/Maths/math.color';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Mesh} from '@babylonjs/core/Meshes/mesh';
import type {InstancedMesh} from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {MeshBuilder} from './primitives';
import {VEHICLE_PAINT_COLORS} from './cars';
export interface WreckDescriptor{vehicleId:string;pose:PlanarPose;bodyAssetId:string;discontinuityId:number}
export interface WreckOptions{reducedMotion?:boolean;reducedFlash?:boolean}
interface Piece{root:TransformNode;shadow:InstancedMesh;paint:Mesh[];start:Vector3;vx:number;vy:number;vz:number;sx:number;sy:number;sz:number;floor:number;wheel:boolean}
interface Slot{root:TransformNode;vehicleId:string|null;age:number;pieces:Piece[];fire:InstancedMesh[];smoke:InstancedMesh[];rings:InstancedMesh[];reducedMotion:boolean;reducedFlash:boolean}
const LIFETIME=2.6,CAPACITY=8;
/** Original native meshes, eight reusable sequences, no simulation bodies or per-wreck resources. */
export class WreckEffects{
  private slots:Slot[]=[];private sources:Mesh[]=[];private materials:StandardMaterial[]=[];
  private paints=new Map<string,StandardMaterial>();private played=new Map<string,number>();private disposed=false;
  constructor(private scene:Scene){
    const material=(name:string,color:string,emissive=false,alpha=1)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor.set(.12,.12,.12);m.alpha=alpha;if(emissive){m.emissiveColor=m.diffuseColor.scale(1.15);m.disableLighting=true;}this.materials.push(m);return m;};
    const rubber=material('wreck-rubber','#202b30'),steel=material('wreck-steel','#aeb9b7'),navy=material('wreck-trim','#234953'),glass=material('wreck-door-glass','#354f5a');
    const flame=material('wreck-fire-orange','#ed651f',true),core=material('wreck-fire-gold','#ffcf60',true),smoke=material('wreck-smoke-charcoal','#536263',false,.8),ring=material('wreck-ring-gold','#ffd777',true,.65),shadow=material('wreck-debris-shadow','#102c30',false,.12);
    for(const [id,color]of Object.entries(VEHICLE_PAINT_COLORS))this.paints.set(id,material(`wreck-paint-${id}`,color));
    const source=(mesh:Mesh,m:StandardMaterial)=>{mesh.material=m;mesh.isVisible=false;mesh.isPickable=false;this.sources.push(mesh);return mesh;};
    const tire=source(MeshBuilder.CreateCylinder('wreck-tire-source',{diameter:.86,height:.33,tessellation:16},scene),rubber);
    const hub=source(MeshBuilder.CreateCylinder('wreck-hub-source',{diameter:.49,height:.36,tessellation:12},scene),steel);
    const cap=source(MeshBuilder.CreateCylinder('wreck-hubcap-source',{diameter:.2,height:.375,tessellation:8},scene),navy);
    const unit=source(MeshBuilder.CreateBox('wreck-panel-source',{size:1},scene),this.paints.get('patrol')!);
    const fire=source(MeshBuilder.CreateIcoSphere('wreck-fire-source',{radius:1,subdivisions:1},scene),flame);
    const hot=source(MeshBuilder.CreateIcoSphere('wreck-core-source',{radius:1,subdivisions:1},scene),core);
    const cloud=source(MeshBuilder.CreateIcoSphere('wreck-smoke-source',{radius:1,subdivisions:1},scene),smoke);
    const wave=source(MeshBuilder.CreateTorus('wreck-ring-source',{diameter:1,thickness:.055,tessellation:24},scene),ring);
    const disc=source(MeshBuilder.CreateCylinder('wreck-shadow-source',{diameter:1,height:.006,tessellation:12},scene),shadow);
    const instance=(mesh:Mesh,name:string,parent:TransformNode)=>{const i=mesh.createInstance(name);i.parent=parent;i.isVisible=true;i.isPickable=false;return i;};
    for(let n=0;n<CAPACITY;n++){
      const root=new TransformNode(`wreck-slot-${n}`,scene);root.setEnabled(false);
      const slot:Slot={root,vehicleId:null,age:LIFETIME,pieces:[],fire:[],smoke:[],rings:[],reducedMotion:false,reducedFlash:false};
      const piece=(role:string,start:Vector3,wheel=false)=>{const node=new TransformNode(`wreck-${n}-${role}`,scene);node.metadata={wreckRole:wheel?'wheel':role};node.parent=root;
        const p:Piece={root:node,shadow:instance(disc,`wreck-${n}-${role}-shadow`,root),paint:[],start,vx:0,vy:0,vz:0,sx:0,sy:0,sz:0,floor:wheel?.43:.17,wheel};slot.pieces.push(p);return p;};
      for(let i=0;i<4;i++){const p=piece(`wheel-${i}`,new Vector3(i%2===0?-.96:.96,.48,i<2?1.32:-1.32),true);instance(tire,`wreck-${n}-tire-${i}`,p.root);instance(hub,`wreck-${n}-hub-${i}`,p.root);instance(cap,`wreck-${n}-hubcap-${i}`,p.root);}
      const box=(p:Piece,label:string,position:Vector3,size:Vector3,m?:StandardMaterial)=>{const mesh=unit.clone(`wreck-${n}-${label}`,p.root,true)!;mesh.isVisible=true;mesh.isPickable=false;mesh.position.copyFrom(position);mesh.scaling.copyFrom(size);if(m)mesh.material=m;else p.paint.push(mesh);return mesh;};
      const hood=piece('hood',new Vector3(0,1.15,1.2));box(hood,'hood-panel',Vector3.Zero(),new Vector3(1.5,.09,1.15));box(hood,'hood-stripe',new Vector3(0,.055,0),new Vector3(.18,.025,1.05),navy);
      for(const side of [-1,1]){const p=piece(side<0?'door-left':'door-right',new Vector3(side*.95,1.05,-.15));box(p,'door-panel',Vector3.Zero(),new Vector3(.09,.72,1.35));box(p,'door-window',new Vector3(0,.53,0),new Vector3(.07,.42,1.14),glass);box(p,'door-handle',new Vector3(side*.06,.21,-.35),new Vector3(.045,.06,.25),steel);}
      const roof=piece('roof',new Vector3(0,1.9,-.25));box(roof,'roof-panel',Vector3.Zero(),new Vector3(1.4,.12,1.25));box(roof,'roof-bar',new Vector3(0,.12,0),new Vector3(1.1,.14,.28),navy);
      const bumper=piece('bumper',new Vector3(0,.68,2.18));box(bumper,'bumper-panel',Vector3.Zero(),new Vector3(1.88,.2,.26));box(bumper,'bumper-steel',new Vector3(0,0,.15),new Vector3(1.25,.1,.035),steel);
      const boot=piece('boot',new Vector3(0,1.1,-1.6));box(boot,'boot-panel',Vector3.Zero(),new Vector3(1.45,.1,.9));
      slot.fire.push(instance(hot,`wreck-${n}-fire-core`,root));for(let i=0;i<7;i++)slot.fire.push(instance(fire,`wreck-${n}-fire-${i}`,root));
      for(let i=0;i<8;i++)slot.smoke.push(instance(cloud,`wreck-${n}-smoke-${i}`,root));
      for(let i=0;i<2;i++)slot.rings.push(instance(wave,`wreck-${n}-ring-${i}`,root));this.slots.push(slot);
    }
  }
  spawn(wreck:WreckDescriptor,options:WreckOptions={}):boolean{
    if(this.disposed||this.played.get(wreck.vehicleId)===wreck.discontinuityId)return false;
    const slot=this.slots.find(s=>s.vehicleId===wreck.vehicleId)??this.slots.find(s=>s.vehicleId===null)??this.slots.reduce((a,b)=>a.age>b.age?a:b);
    this.played.delete(wreck.vehicleId);this.played.set(wreck.vehicleId,wreck.discontinuityId);if(this.played.size>64)this.played.delete(this.played.keys().next().value!);
    slot.vehicleId=wreck.vehicleId;slot.age=0;slot.reducedMotion=!!options.reducedMotion;slot.reducedFlash=!!options.reducedFlash;slot.root.position.set(-wreck.pose.x,0,wreck.pose.z);slot.root.rotation.y=-wreck.pose.yaw;slot.root.setEnabled(true);
    let seed=2166136261;for(const char of `${wreck.vehicleId}:${wreck.discontinuityId}`)seed=Math.imul(seed^char.charCodeAt(0),16777619);const random=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return(seed>>>0)/4294967296;};
    const paintId=wreck.bodyAssetId.startsWith('traffic')||wreck.bodyAssetId==='suspect'?'traffic':wreck.bodyAssetId;
    const paint=this.paints.get(paintId)??this.paints.get('patrol')!;
    for(const p of slot.pieces){p.root.position.copyFrom(p.start);p.root.rotation.set(0,0,p.wheel?Math.PI/2:0);p.root.scaling.setAll(1);p.root.setEnabled(!slot.reducedMotion);p.shadow.isVisible=!slot.reducedMotion;
      const angle=Math.atan2(p.start.x,p.start.z)+(random()-.5)*.8,speed=4+random()*3.5;p.vx=Math.sin(angle)*speed;p.vz=Math.cos(angle)*speed;p.vy=(p.wheel?8:9)+random()*3;p.sx=(random()-.5)*18;p.sy=(random()-.5)*15;p.sz=(random()-.5)*20;for(const mesh of p.paint)mesh.material=paint;}
    this.sampleCloud(slot);return true;
  }
  private sampleCloud(slot:Slot):void{
    const age=slot.age,reduced=slot.reducedMotion,flash=slot.reducedFlash,burst=Math.max(0,Math.sin(Math.min(1,age/.85)*Math.PI));
    for(let i=0;i<slot.fire.length;i++){const mesh=slot.fire[i]!,a=i*Math.PI*2/7;mesh.isVisible=age<.85&&(!flash||i>0&&i<4);const scale=(i===0?1.7:1.2)*(reduced?.45:flash?.65:1)*(.3+burst*1.35);mesh.scaling.set(scale,scale*(i===0?1.15:.9),scale);mesh.position.set(i===0?0:Math.sin(a)*burst*1.3,(i===0?1.3:1.1+burst*.7),i===0?0:Math.cos(a)*burst*1.3);}
    for(let i=0;i<slot.smoke.length;i++){const mesh=slot.smoke[i]!,a=i*Math.PI*2/8,progress=Math.max(0,age-.08),fade=Math.min(1,Math.max(0,(LIFETIME-age)/.5));mesh.isVisible=age>.06&&(!reduced||i<4);const size=(.38+Math.min(progress,1.8)*.75)*(reduced?.6:1)*fade;mesh.scaling.set(size,size*1.2,size);mesh.position.set(Math.sin(a)*(reduced?.7:.8+progress*.8),reduced?1.2+i*.12:1.25+progress*(1.65+i*.08),Math.cos(a)*(reduced?.7:.8+progress*.8));}
    for(let i=0;i<slot.rings.length;i++){const mesh=slot.rings[i]!;mesh.isVisible=!flash&&!reduced&&age<.8;const scale=(.6+age*(i===0?12:8));mesh.scaling.set(scale,.6,scale);mesh.position.y=.06+i*.05;}
  }
  update(delta:number,options:WreckOptions={}):void{
    if(this.disposed)return;const dt=Math.min(.1,Math.max(0,Number.isFinite(delta)?delta:0));
    for(const slot of this.slots){if(slot.vehicleId===null)continue;slot.age+=dt;slot.reducedMotion=slot.reducedMotion||!!options.reducedMotion;slot.reducedFlash=slot.reducedFlash||!!options.reducedFlash;
      if(slot.age>=LIFETIME-.000001){slot.vehicleId=null;slot.root.setEnabled(false);continue;}
      for(const p of slot.pieces){p.root.setEnabled(!slot.reducedMotion);p.shadow.isVisible=!slot.reducedMotion;if(slot.reducedMotion)continue;
        p.vy-=15*dt;const drag=Math.exp(-.6*dt);p.vx*=drag;p.vz*=drag;p.root.position.x+=p.vx*dt;p.root.position.y+=p.vy*dt;p.root.position.z+=p.vz*dt;
        if(p.root.position.y<p.floor){p.root.position.y=p.floor;p.vy=Math.abs(p.vy)*.34;if(p.vy<.6)p.vy=0;p.vx*=.62;p.vz*=.62;p.sx*=.65;p.sy*=.65;p.sz*=.65;}
        p.root.rotation.x+=p.sx*dt;p.root.rotation.y+=p.sy*dt;p.root.rotation.z+=p.sz*dt;p.root.scaling.setAll(Math.min(1,Math.max(0,(LIFETIME-slot.age)/.35)));
        p.shadow.position.set(p.root.position.x,.035,p.root.position.z);p.shadow.scaling.setAll(Math.max(.35,1-p.root.position.y*.08)*(p.wheel?1:1.5));
      }
      this.sampleCloud(slot);
    }
  }
  remove(vehicleId:string):void{for(const slot of this.slots)if(slot.vehicleId===vehicleId){slot.vehicleId=null;slot.root.setEnabled(false);}this.played.delete(vehicleId);}
  reset():void{for(const slot of this.slots){slot.vehicleId=null;slot.root.setEnabled(false);}this.played.clear();}
  getStats(){let wreckSequences=0,wreckWheels=0,wreckPanels=0,wreckFireballs=0,wreckSmoke=0,wreckRings=0;for(const s of this.slots){if(s.vehicleId===null)continue;wreckSequences++;for(const p of s.pieces)if(p.root.isEnabled()){if(p.wheel)wreckWheels++;else wreckPanels++;}wreckFireballs+=s.fire.filter(m=>m.isVisible).length;wreckSmoke+=s.smoke.filter(m=>m.isVisible).length;wreckRings+=s.rings.filter(m=>m.isVisible).length;}return{wreckSequences,wreckWheels,wreckPanels,wreckFireballs,wreckSmoke,wreckRings};}
  dispose():void{if(this.disposed)return;this.disposed=true;for(const s of this.slots)s.root.dispose();for(const source of this.sources)source.dispose();for(const m of this.materials)m.dispose();this.slots=[];this.sources=[];this.materials=[];this.played.clear();}
}
