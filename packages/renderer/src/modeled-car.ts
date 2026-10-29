import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import '@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_clearcoat';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector';
import type {Scene} from '@babylonjs/core/scene';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';

export const MODELED_CARS={
  db5:{radius:.311,driving:new URL('../../content/runtime/models/db5/db5-driving.glb',import.meta.url).href,briefing:new URL('../../content/runtime/models/db5/db5-briefing.glb',import.meta.url).href},
  gangster:{radius:.425,driving:new URL('../../content/runtime/models/gangster/gangster-driving.glb',import.meta.url).href,briefing:new URL('../../content/runtime/models/gangster/gangster-briefing.glb',import.meta.url).href},
} as const;
export type ModeledCarId=keyof typeof MODELED_CARS;
export const isModeledCar=(id:string):id is ModeledCarId=>Object.prototype.hasOwnProperty.call(MODELED_CARS,id);
export interface CarTemplates{intact:Map<boolean,Mesh[]>;fragments:Map<boolean,Mesh[]>;muzzles:Vector3[];dispose():void}

/** Bake the imported component transforms once. Officers instance shared material batches. */
export async function loadCarTemplates(scene:Scene,source:string|ArrayBufferView,id:ModeledCarId):Promise<CarTemplates>{
  const asset=await LoadAssetContainerAsync(source,scene,{pluginExtension:'.glb',name:`${id}.glb`});
  asset.addAllToScene();
  const geometry=asset.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
  const materials=[...asset.materials],intact=new Map<boolean,Mesh[]>(),fragments=new Map<boolean,Mesh[]>();
  // Resolve within this container: different car imports have identically named nodes.
  const node=(name:string)=>[...asset.transformNodes,...asset.meshes].find(n=>n.name===name)! as TransformNode;
  const offset=MODELED_CARS[id].radius+.001;
  const axles=new Map(['wheel_fl','wheel_fr','wheel_rl','wheel_rr'].map(name=>{const n=node(name);n.computeWorldMatrix(true);return[name,n.getAbsolutePosition().add(new Vector3(0,offset,0))] as const;}));
  const component=(mesh:Mesh)=>{let node=mesh;while(node.parent&&node.parent.name!=='car'&&node.parent.name!=='__root__')node=node.parent as Mesh;return node.name;};
  const clone=(mesh:Mesh)=>{mesh.computeWorldMatrix(true);const copy=mesh.clone(`${id}-baked-${mesh.name}`,null,true)!;copy.makeGeometryUnique();copy.parent=null;copy.position.setAll(0);copy.rotationQuaternion=null;copy.rotation.setAll(0);copy.scaling.setAll(1);copy.bakeTransformIntoVertices(mesh.getWorldMatrix());copy.bakeTransformIntoVertices(Matrix.Translation(0,offset,0));return copy;};
  const muzzles=['muzzle_left','muzzle_right'].map(name=>{const n=node(name);n.computeWorldMatrix(true);return n.getAbsolutePosition().add(new Vector3(0,offset,0));});
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
    for(const [key,list]of groups){const material=list[0]!.material;const merged=Mesh.MergeMeshes(list,true,true,undefined,false,false)!;merged.material=material;merged.name=material?.name??key;merged.metadata={role:key.startsWith('wheel_')?'wheel':'body',wheel:key.startsWith('wheel_')?key.split(':')[0]:null,wheelRadius:MODELED_CARS[id].radius};
      if(merged.metadata.wheel){const center=axles.get(merged.metadata.wheel)!;merged.bakeTransformIntoVertices(Matrix.Translation(-center.x,-center.y,-center.z));merged.position.copyFrom(center);}
      merged.isVisible=false;merged.isPickable=false;merged.receiveShadows=true;batches.push(merged);
    }
    for(const [componentId,list]of pieces){const merged=Mesh.MergeMeshes(list,true,true,undefined,false,true)!;const center=merged.getBoundingInfo().boundingBox.center.clone();merged.bakeTransformIntoVertices(Matrix.Translation(-center.x,-center.y,-center.z));merged.position.copyFrom(center);merged.name=`${id}-component-${componentId}`;merged.metadata={role:componentId.startsWith('wheel_')?'wheel':'body',componentName:componentId.startsWith('wheel_')?'tire':componentId,componentId};merged.isVisible=false;merged.isPickable=false;assembly.push(merged);}
    intact.set(armed,batches);fragments.set(armed,assembly);
  }
  // Geometry now belongs to the caches. Keep imported PBR materials, retire source nodes.
  for(const mesh of asset.meshes)mesh.dispose();for(const node of asset.transformNodes)node.dispose();
  return{intact,fragments,muzzles,dispose(){for(const list of [...intact.values(),...fragments.values()])for(const mesh of list){const m=mesh.material;mesh.dispose();if(m&&!materials.includes(m))m.dispose();}for(const material of materials)material.dispose();asset.dispose();}};
}
