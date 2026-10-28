import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import{readGlb}from'./validate.mjs';
for(const lod of ['briefing','driving','distant'])test(`${lod} exports finite unit surface normals`,()=>{
 const path=`packages/content/runtime/models/db5/db5-${lod}.glb`,b=readFileSync(path),d=readGlb(path),bin=20+b.readUInt32LE(12)+8;
 for(const node of d.nodes.filter(n=>n.mesh!==undefined))for(const p of d.meshes[node.mesh].primitives){
  const a=d.accessors[p.attributes.NORMAL],v=d.bufferViews[a.bufferView];assert.equal(a.componentType,5126);
  for(let i=0;i<a.count;i++){
   const offset=bin+(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??12);
   const normal=[0,1,2].map(j=>b.readFloatLE(offset+j*4));
   assert.ok(normal.every(Number.isFinite)&&Math.abs(Math.hypot(...normal)-1)<1e-4,`${node.name} normal ${i}: ${normal}`);
  }
 }
});
for(const lod of ['briefing','driving','distant'])test(`${lod} shading normals agree with triangle winding`,()=>{
 const path=`packages/content/runtime/models/db5/db5-${lod}.glb`,b=readFileSync(path),d=readGlb(path),bin=20+b.readUInt32LE(12)+8;
 function accessor(index,width){const a=d.accessors[index],v=d.bufferViews[a.bufferView],size=a.componentType===5126||a.componentType===5125?4:2;return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>{const o=bin+(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??size*width)+j*size;return a.componentType===5126?b.readFloatLE(o):a.componentType===5125?b.readUInt32LE(o):b.readUInt16LE(o);}));}
 for(const node of d.nodes.filter(n=>n.mesh!==undefined))for(const p of d.meshes[node.mesh].primitives){
  const positions=accessor(p.attributes.POSITION,3),normals=accessor(p.attributes.NORMAL,3),ids=accessor(p.indices,1).flat();
  for(let i=0;i<ids.length;i+=3){const [a,c,e]=ids.slice(i,i+3),u=positions[c].map((x,j)=>x-positions[a][j]),v=positions[e].map((x,j)=>x-positions[a][j]);const face=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...face);if(len<1e-9)continue;const avg=normals[a].map((x,j)=>(x+normals[c][j]+normals[e][j])/3);const dot=face.reduce((s,x,j)=>s+x*avg[j],0)/len;assert.ok(dot>-.02,`${node.name} triangle ${i/3}: normals face inward (${dot})`);}
 }
});
for(const lod of ['briefing','driving','distant'])test(`${lod} component transforms and optional gun bounds match the exported geometry`,()=>{
 const d=readGlb(`packages/content/runtime/models/db5/db5-${lod}.glb`),record=JSON.parse(readFileSync('packages/content/runtime/models/db5/components.json')).lods[lod];
 const roots=d.nodes.filter(n=>n.name==='car');assert.equal(roots.length,1);assert.equal(record.components.length,16);
 assert.equal(d.images?.length??0,0);
 for(const c of record.components){const n=d.nodes.find(n=>n.name===c.name);assert.ok(n?.mesh!==undefined,c.name);assert.ok(!n.rotation&&!n.scale&&!n.matrix,c.name+' unexpected transform');
  n.translation.forEach((x,i)=>assert.ok(Math.abs(x-c.pivot[i])<1e-6));
  const bounds=d.meshes[n.mesh].primitives.map(p=>d.accessors[p.attributes.POSITION]);
  if(c.name.startsWith('gun_'))for(let i=0;i<3;i++){
   const lo=Math.min(...bounds.map(a=>a.min[i]))+n.translation[i],hi=Math.max(...bounds.map(a=>a.max[i]))+n.translation[i];
   assert.ok(lo>=record.unarmedBounds.min[i]-1e-6&&hi<=record.unarmedBounds.max[i]+1e-6,'gun must remain inside unarmed bounds');
  }
  if(c.suggestedCosmeticCollider.shape==='box')for(let i=0;i<3;i++){
   const lo=Math.min(...bounds.map(a=>a.min[i])),hi=Math.max(...bounds.map(a=>a.max[i]));
   assert.ok(Math.abs((lo+hi)/2-c.suggestedCosmeticCollider.localCenter[i])<1e-6,c.name+' local center');
   assert.ok(Math.abs((hi-lo)/2-c.suggestedCosmeticCollider.halfExtents[i])<1e-6,c.name+' half extent');
  }
 }
 for(const side of ['left','right']){const gun=d.nodes.find(n=>n.name==='gun_'+side),muzzle=d.nodes.find(n=>n.name==='muzzle_'+side);assert.ok(gun.extras.optionalEquipment);assert.deepEqual(muzzle.translation.slice(0,2),[0,0]);assert.ok(Math.abs(muzzle.translation[2]-.23)<1e-6,'23 cm muzzle offset within float32 tolerance');}
});
test('wheel axle positions remain identical through LOD changes',()=>{
 const docs=['briefing','driving','distant'].map(l=>readGlb(`packages/content/runtime/models/db5/db5-${l}.glb`));
 for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr'])for(const d of docs.slice(1))assert.deepEqual(d.nodes.find(n=>n.name===name).translation,docs[0].nodes.find(n=>n.name===name).translation);
});
