import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function readGlb(path) {
  const buffer=readFileSync(path);
  if(buffer.readUInt32LE(0)!==0x46546c67 || buffer.readUInt32LE(4)!==2 || buffer.readUInt32LE(8)!==buffer.length) throw Error('Invalid GLB container');
  return JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)));
}

export function validateBubble(document, limits) {
  const errors=[], nodes=document.nodes??[], root=nodes.find(n=>n.name==='car');
  const bounds=(n)=>{
    const a=document.meshes?.[n?.mesh]?.primitives.map(p=>document.accessors[p.attributes.POSITION]);
    if(!a?.length || a.some(v=>!v.min || !v.max)) return null;
    return {min:[0,1,2].map(i=>Math.min(...a.map(v=>v.min[i]))),max:[0,1,2].map(i=>Math.max(...a.map(v=>v.max[i])))};
  };
  const identity=(n)=>!n.matrix && (!n.translation || n.translation.every(v=>v===0)) && (!n.scale || n.scale.every(v=>v===1)) && (!n.rotation || n.rotation.every((v,i)=>v===(i===3?1:0)));
  if(!root || !identity(root)) errors.push('car root must have identity transform');
  for(const [name,xSign,zSign] of [['wheel_fl',-1,1],['wheel_fr',1,1],['wheel_rl',-1,-1],['wheel_rr',1,-1]]) {
    const n=nodes.find(n=>n.name===name),p=n?.translation;
    if(n?.mesh===undefined || !p || !(p[0]*xSign>0) || !(p[2]*zSign>0) || Math.abs(p[1])>1e-6) errors.push(`${name} must be a separate mesh at its axle`);
  }
  for(const side of ['left','right']) {
    const gun=nodes.find(n=>n.name===`gun_${side}`),i=nodes.findIndex(n=>n.name===`muzzle_${side}`),m=nodes[i];
    if(gun?.mesh===undefined || gun?.extras?.optionalEquipment!==true) errors.push(`gun_${side} must be optional equipment`);
    const b=bounds(gun);
    if(!b || b.max[2]-b.min[2]<.8 || b.max[0]-b.min[0]<.18) errors.push(`gun_${side} must retain oversized length and width`);
    if(!gun?.children?.includes(i) || !(m?.translation?.[2]>0) || m.rotation || m.matrix) errors.push(`muzzle_${side} must point local +Z from gun`);
  }
  const body=nodes.filter(n=>n.mesh!==undefined&&!n.name?.startsWith('gun_')).map(n=>({n,b:bounds(n)})).filter(x=>x.b);
  const span=(i)=>Math.max(...body.map(({n,b})=>b.max[i]+(n.translation?.[i]??0)))-Math.min(...body.map(({n,b})=>b.min[i]+(n.translation?.[i]??0)));
  if(!body.length || span(0)>1.9 || span(2)>3.0) errors.push('tiny car width/length envelope exceeded');
  const scene=document.scenes?.[document.scene??0];
  if(!String(scene?.extras?.assetRights??'').includes('GPL-3.0-or-later')) errors.push('original asset rights missing');
  const primitives=(document.meshes??[]).flatMap(m=>m.primitives);
  const triangles=primitives.reduce((sum,p)=>sum+document.accessors[p.indices??p.attributes.POSITION].count/3,0);
  if(triangles>limits.triangles) errors.push(`triangle budget exceeded: ${triangles}`);
  if(primitives.length>limits.primitives) errors.push(`primitive budget exceeded: ${primitives.length}`);
  if([...(document.buffers??[]),...(document.images??[])].some(x=>x.uri && !x.uri.startsWith('data:'))) errors.push('external dependency is not permitted');
  return errors;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  for(const [lod,triangles] of [['briefing',20000],['driving',8000],['distant',3000]]) {
    const errors=validateBubble(readGlb(`packages/content/runtime/models/bubble/bubble-${lod}.glb`),{triangles,primitives:40});
    if(errors.length){console.error(lod,errors);process.exitCode=1;} else console.log(`${lod}: semantic, rights and rendering budgets passed`);
  }
}
