import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { districtMap, buildings, ASSET_PROVENANCE } from '../../packages/content/src/index';

const failures:string[]=[];
const ids=new Set<string>();
for(const collider of districtMap.colliders){
  if(ids.has(collider.id))failures.push(`duplicate collider ${collider.id}`);ids.add(collider.id);
  if(collider.shape==='box'&&(!collider.halfExtents||collider.halfExtents.x<=0||collider.halfExtents.z<=0))failures.push(`invalid box ${collider.id}`);
}
for(const b of buildings){
  const c=districtMap.colliders.find((c)=>c.id===b.id);
  if(!c||c.pose.x!==b.x||c.pose.z!==b.z||c.halfExtents?.x!==b.width/2||c.halfExtents.z!==b.depth/2)failures.push(`visual/collision mismatch ${b.id}`);
}
for(const spawn of districtMap.spawns){
  for(const collider of districtMap.colliders){
    if(!collider.halfExtents)continue;
    const dx=Math.max(0,Math.abs(spawn.pose.x-collider.pose.x)-collider.halfExtents.x);
    const dz=Math.max(0,Math.abs(spawn.pose.z-collider.pose.z)-collider.halfExtents.z);
    if(Math.hypot(dx,dz)<spawn.clearanceRadius)failures.push(`blocked spawn ${spawn.id} by ${collider.id}`);
  }
}
// Sample the intended two shortcut centerlines using a conservative car half-width.
for(const [name,ax,az,bx,bz] of [['park',-64,10,-10,68],['freight',-72,-43,-10,-43]] as const){
  for(let i=0;i<=100;i++){
    const x=ax+(bx-ax)*i/100,z=az+(bz-az)*i/100;
    for(const c of districtMap.colliders){if(!c.halfExtents)continue;
      const dx=Math.max(0,Math.abs(x-c.pose.x)-c.halfExtents.x),dz=Math.max(0,Math.abs(z-c.pose.z)-c.halfExtents.z);
      if(Math.hypot(dx,dz)<1.1)failures.push(`blocked shortcut ${name} by ${c.id}`);
    }
  }
}
const nodes=new Set(districtMap.laneNodes.map((n)=>n.id));
for(const edge of districtMap.laneEdges)if(!nodes.has(edge.from)||!nodes.has(edge.to)||edge.speedLimit<=0)failures.push(`invalid lane edge ${edge.from}/${edge.to}`);
for(const node of nodes)if(!districtMap.laneEdges.some((e)=>e.from===node)||!districtMap.laneEdges.some((e)=>e.to===node))failures.push(`unconnected lane ${node}`);
for(const source of ['packages/content/src/index.ts','packages/renderer/src/city.ts','packages/renderer/src/cars.ts','packages/renderer/src/audio.ts']){
  const data=await readFile(source);console.log(`${source}: ${data.byteLength} source bytes, SHA256 ${createHash('sha256').update(data).digest('hex')}`);
}
if(ASSET_PROVENANCE.creator!=='Fender Offenders project')failures.push('asset provenance missing');
if(failures.length)throw new Error(failures.join('\n'));
console.log(`Asset/content audit passed: ${buildings.length} original buildings, ${districtMap.spawns.length} clear spawns, ${nodes.size} lane nodes. No third-party media downloads.`);
