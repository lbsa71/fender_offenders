import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readGlb, validateHelicopter } from './validate.mjs';
const path='packages/content/runtime/models/helicopter/helicopter.glb';
const d=readGlb(path), bytes=readFileSync(path);
const bin=20+bytes.readUInt32LE(12)+8;
function floats(index,width) {
 const a=d.accessors[index],v=d.bufferViews[a.bufferView];
 assert.equal(a.componentType,5126);
 return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,j)=>bytes.readFloatLE(bin+(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??width*4)+j*4)));
}
test('delivered GLB retains ten centered pieces and exactly matches the collider inventory',()=>{
 assert.deepEqual(validateHelicopter(d),[]);
 const record=JSON.parse(readFileSync('packages/content/runtime/models/helicopter/components.json'));
 assert.equal(record.components.length,10);
 const root=d.nodes.find(n=>n.name==='helicopter');assert.equal(root.children.length,10);
 for(const c of record.components) {
  const n=d.nodes.find(n=>n.name===c.name);assert.ok(n,c.name);
  n.translation.forEach((v,i)=>assert.ok(Math.abs(v-c.pivot[i])<1e-5));
  const bounds=d.meshes[n.mesh].primitives.map(p=>d.accessors[p.attributes.POSITION]);
  for(let i=0;i<3;i++) {
   const lo=Math.min(...bounds.map(a=>a.min[i])),hi=Math.max(...bounds.map(a=>a.max[i]));
   assert.ok(Math.abs((hi+lo)/2-c.collider.localCenter[i])<1e-5,`${c.name} center`);
   assert.ok(Math.abs((hi-lo)/2-c.collider.halfExtents[i])<1e-5,`${c.name} extent`);
  }
 }
});
test('exported rotor clips turn steadily around their declared axes for one full second',()=>{
 for(const [name,axis] of [['rotor_main',1],['rotor_tail',0]]) {
  const node=d.nodes.findIndex(n=>n.name===name);
  const animation=d.animations.find(a=>a.channels.some(c=>c.target.node===node));
  const channel=animation.channels.find(c=>c.target.node===node);
  const sampler=animation.samplers[channel.sampler];
  const times=floats(sampler.input,1).flat(), rotations=floats(sampler.output,4);
  assert.equal(times[0],0);assert.equal(times.at(-1),1);
  assert.ok(times.length>=5);
  times.forEach((t,i)=>{
   const expected=[0,0,0,Math.cos(Math.PI*t)];expected[axis]=Math.sin(Math.PI*t);
   const dot=Math.abs(expected.reduce((s,x,j)=>s+x*rotations[i][j],0));
   assert.ok(Math.abs(dot-1)<1e-5,`${name} should have uniform angle at ${t}s; quaternion agreement ${dot}`);
  });
 }
});
