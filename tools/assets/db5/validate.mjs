import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function readGlb(path){const b=readFileSync(path);if(b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(8)!==b.length)throw Error('Invalid GLB container');return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));}
export function validateDb5(d,budget){
 const e=[],nodes=d.nodes??[];
 for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr'])if(!nodes.some(n=>n.name===name&&n.mesh!==undefined))e.push(`${name} separate mesh missing`);
 for(const side of ['left','right']){
  const gun=nodes.find(n=>n.name==='gun_'+side),idx=nodes.findIndex(n=>n.name==='muzzle_'+side),muzzle=nodes[idx];
  if(!gun?.extras?.optionalEquipment)e.push(`gun_${side} optionalEquipment missing`);
  if(!gun?.children?.includes(idx)||!(muzzle?.translation?.[2]>0)||muzzle.rotation||muzzle.matrix)e.push(`muzzle_${side} must point along local +Z from its gun`);
 }
 if(!String(d.extras?.assetRights??d.scenes?.[0]?.extras?.assetRights??'').includes('noncommercial fan-art restriction'))e.push('asset rights restriction missing');
 const tris=(d.meshes??[]).reduce((s,m)=>s+m.primitives.reduce((s,p)=>s+d.accessors[p.indices??p.attributes.POSITION].count/3,0),0);
 if(tris>budget)e.push(`triangle budget exceeded: ${tris} > ${budget}`);
 return e;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 for(const [lod,budget] of [['briefing',60000],['driving',15000],['distant',4000]]){
  const p=`packages/content/runtime/models/db5/db5-${lod}.glb`,d=readGlb(p),e=validateDb5(d,budget);
  if(e.length){console.error(lod,e);process.exitCode=1;}else console.log(`${lod}: semantic nodes, optional guns, rights notice and ${budget}-triangle budget passed`);
 }
}
