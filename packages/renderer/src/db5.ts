import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_clearcoat';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector';
import type {Scene} from '@babylonjs/core/scene';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';

export const DB5_DRIVING_URL=new URL('../../content/runtime/models/db5/db5-driving.glb',import.meta.url).href;
export const DB5_BRIEFING_URL=new URL('../../content/runtime/models/db5/db5-briefing.glb',import.meta.url).href;
export interface Db5Templates{intact:Map<boolean,Mesh[]>;fragments:Map<boolean,Mesh[]>;muzzles:Vector3[];dispose():void}

/** Bake the imported component transforms once. Officers instance shared material batches. */
export async function loadDb5Templates(scene:Scene,source:string|ArrayBufferView):Promise<Db5Templates>{
  const asset=await LoadAssetContainerAsync(source,scene,{pluginExtension:'.glb',name:'db5.glb'});
  asset.addAllToScene();
  const geometry=asset.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
  const materials=[...asset.materials],intact=new Map<boolean,Mesh[]>(),fragments=new Map<boolean,Mesh[]>();
  // Source origin is the axle plane; lift the 0.311 m tires just above the road.
  const offset=.312;
  const axles=new Map(['wheel_fl','wheel_fr','wheel_rl','wheel_rr'].map(name=>{const node=scene.getNodeByName(name)! as TransformNode;node.computeWorldMatrix(true);return[name,node.getAbsolutePosition().add(new Vector3(0,offset,0))] as const;}));
  const component=(mesh:Mesh)=>{let node=mesh;while(node.parent&&node.parent.name!=='car'&&node.parent.name!=='__root__')node=node.parent as Mesh;return node.name;};
  const clone=(mesh:Mesh)=>{mesh.computeWorldMatrix(true);const copy=mesh.clone(`db5-baked-${mesh.name}`,null,true)!;copy.makeGeometryUnique();copy.parent=null;copy.position.setAll(0);copy.rotationQuaternion=null;copy.rotation.setAll(0);copy.scaling.setAll(1);copy.bakeTransformIntoVertices(mesh.getWorldMatrix());copy.bakeTransformIntoVertices(Matrix.Translation(0,offset,0));return copy;};
  const muzzles=['muzzle_left','muzzle_right'].map(name=>{const n=scene.getNodeByName(name)! as TransformNode;n.computeWorldMatrix(true);return n.getAbsolutePosition().add(new Vector3(0,offset,0));});
  for(const armed of [false,true]){
    const selected=geometry.filter(m=>armed||!component(m).startsWith('gun_'));
    const groups=new Map<string,Mesh[]>(),pieces=new Map<string,Mesh[]>();
    for(const original of selected){
      const id=component(original),wheel=id.startsWith('wheel_'),role=wheel?'wheel':'body';
      // Keep gun batches separate so unlocking has an observable, bounded geometry change.
      const key=`${wheel||id.startsWith('gun_')?id:role}:${original.material?.uniqueId}`;
      const list=groups.get(key)??[];list.push(clone(original));groups.set(key,list);
      const p=pieces.get(id)??[];p.push(clone(original));pieces.set(id,p);
    }
    const batches:Mesh[]=[],assembly:Mesh[]=[];
    for(const [key,list]of groups){const material=list[0]!.material;const merged=Mesh.MergeMeshes(list,true,true,undefined,false,false)!;merged.material=material;merged.name=material?.name??key;merged.metadata={role:key.startsWith('wheel_')?'wheel':'body',wheel:key.startsWith('wheel_')?key.split(':')[0]:null};
      if(merged.metadata.wheel){const center=axles.get(merged.metadata.wheel)!;merged.bakeTransformIntoVertices(Matrix.Translation(-center.x,-center.y,-center.z));merged.position.copyFrom(center);}
      merged.isVisible=false;merged.isPickable=false;merged.receiveShadows=true;batches.push(merged);
    }
    for(const [id,list]of pieces){const merged=Mesh.MergeMeshes(list,true,true,undefined,false,true)!;const center=merged.getBoundingInfo().boundingBox.center.clone();merged.bakeTransformIntoVertices(Matrix.Translation(-center.x,-center.y,-center.z));merged.position.copyFrom(center);merged.name=`db5-component-${id}`;merged.metadata={role:id.startsWith('wheel_')?'wheel':'body',componentName:id.startsWith('wheel_')?'tire':id,componentId:id};merged.isVisible=false;merged.isPickable=false;assembly.push(merged);}
    intact.set(armed,batches);fragments.set(armed,assembly);
  }
  // Geometry now belongs to the caches. Keep imported PBR materials, retire source nodes.
  for(const mesh of asset.meshes)mesh.dispose();for(const node of asset.transformNodes)node.dispose();
  return{intact,fragments,muzzles,dispose(){for(const list of [...intact.values(),...fragments.values()])for(const mesh of list){const m=mesh.material;mesh.dispose();if(m&&!materials.includes(m))m.dispose();}for(const material of materials)material.dispose();asset.dispose();}};
}
