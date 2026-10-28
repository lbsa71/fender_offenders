import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function validateHelicopter(d) {
  const errors=[];
  const nodes=d.nodes??[];
  for (const name of ['rotor_main','rotor_tail']) {
    const index=nodes.findIndex(n=>n.name===name);
    if(index<0 || nodes[index].mesh===undefined) errors.push(`${name} must be a separate named mesh`);
    if(index<0 || !(d.animations??[]).some(a=>a.channels.some(c=>c.target.node===index && c.target.path==='rotation'))) errors.push(`${name} rotation channel missing`);
  }
  for(const n of nodes) if(n.scale?.some(x=>x<0)) errors.push(`${n.name}: negative scale`);
  const triangles=(d.meshes??[]).reduce((sum,m)=>sum+m.primitives.reduce((s,p)=>s+(d.accessors[p.indices??p.attributes.POSITION]?.count??0)/3,0),0);
  if(triangles>5000) errors.push(`triangle budget exceeded: ${triangles} > 5000`);
  return errors;
}
export function readGlb(path) {
  const b=readFileSync(path);
  if(b.readUInt32LE(0)!==0x46546c67 || b.readUInt32LE(4)!==2 || b.readUInt32LE(8)!==b.length || b.readUInt32LE(16)!==0x4e4f534a) throw new Error('Invalid GLB 2 container');
  return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString('utf8'));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const path=process.argv[2]??'packages/content/runtime/models/helicopter/helicopter.glb';
 const d=readGlb(path); const errors=validateHelicopter(d);
 if(errors.length) {console.error(errors.join('\n'));process.exitCode=1;}
 else console.log(`Helicopter export checks passed: ${d.meshes.length} meshes, ${d.materials.length} materials, ${d.animations.length} clips, ${readFileSync(path).length} bytes.`);
}
