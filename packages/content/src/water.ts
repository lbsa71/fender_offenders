/** Shallow water. Road puddles share exact polygons with campaign wet-road grip. */
export const DISTRICT_WATER = [
  { id: 'bureau-curb', kind: 'puddle', x: 4, z: -34, width: 3.2, depth: 6, y: .039, shallow: true },
  { id: 'north-curb', kind: 'puddle', x: -4, z: 30, width: 3.2, depth: 6, y: .039, shallow: true },
  { id: 'east-curb', kind: 'puddle', x: 84, z: 12, width: 3.2, depth: 6, y: .039, shallow: true },
  { id: 'south-curb', kind: 'puddle', x: 45, z: -76, width: 6, depth: 3.2, y: .039, shallow: true },
  { id: 'park-pond', kind: 'pond', x: -32, z: 61, width: 10, depth: 8, y: .285, shallow: true },
  { id: 'garden-pool', kind: 'pool', x: 42, z: -63, width: 9, depth: 5, y: .285, shallow: true },
] as const;

export function waterFootprint(site: {kind:string; x:number; z:number; width:number; depth:number}): number[] {
  const count=site.kind==='pool'?4:12, polygon:number[]=[];
  for(let i=0;i<count;i++){const a=Math.PI*2*i/count+(site.kind==='pool'?Math.PI/4:0);polygon.push(site.x+Math.cos(a)*site.width/2,site.z+Math.sin(a)*site.depth/2);}
  return polygon;
}
export const ROAD_PUDDLES = DISTRICT_WATER.filter(site=>site.kind==='puddle').map(site=>({id:site.id,polygonXZ:waterFootprint(site)}));
