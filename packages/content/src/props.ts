import type { PropDefinition } from '@fender/contracts';

/** Stable, shared authority/render authoring. Shapes and body origins are documented in sim physics/props.ts. */
export function defineDistrictProps(trees: readonly {x:number;z:number;scale:number}[], roadCenters: readonly number[]): PropDefinition[] {
  const props: PropDefinition[] = trees.map((tree,index)=>({entityId:`tree-${index}`,kind:'tree',position:{x:tree.x,y:2.4*tree.scale,z:tree.z},scale:tree.scale,anchored:true}));
  for(const p of roadCenters) for(let q=-110;q<=110;q+=32) {
    if(roadCenters.some(r=>Math.abs(q-r)<13))continue;
    for(const side of [-1,1]) {
      const x=p+side*10.8,id=`${p}-${q}-${side}`;
      props.push({entityId:`lamp-${id}`,kind:'lamp',position:{x,y:2.5,z:q},anchored:true});
      props.push({entityId:`bench-${id}`,kind:'bench',position:{x:x+side*2,y:.6,z:q+5},yaw:side*Math.PI/2});
      props.push({entityId:`bin-${id}`,kind:'bin',position:{x,y:.55,z:q+8}});
    }
  }
  for(const [index,point] of [[-14,-43],[-12.8,-43],[-11.6,-43],[13,-46],[14.2,-46],[-67,12],[-67,14],[66,44]].entries()) props.push({entityId:`barrel-${index}`,kind:'barrel',position:{x:point[0]!,y:.6,z:point[1]!}});
  for(const [index,point] of [[-15,-45],[-13.8,-45],[13,-44],[65,46]].entries()) props.push({entityId:`crate-${index}`,kind:'crate',position:{x:point[0]!,y:.5,z:point[1]!}});
  for(const [index,point] of [[10.5,-95],[-10.5,95],[95,10.5],[-95,-10.5]].entries()) props.push({entityId:`sign-${index}`,kind:'sign',position:{x:point[0]!,y:1.5,z:point[1]!},anchored:true});
  return props;
}
