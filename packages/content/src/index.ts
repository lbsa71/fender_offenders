import type { CollisionMap, SceneManifest } from '@fender/contracts';
import { ROAD_PUDDLES } from './water';
import { defineDistrictProps } from './props.js';

/** Authored in meters, +Z north/front. Render and physics consume these same footprints. */
export interface Building { id: string; x: number; z: number; width: number; depth: number; height: number; color: string; kind: 'shop' | 'house' | 'warehouse' | 'civic'; label?: string }
export interface Tree { x: number; z: number; scale: number }
export const roadCenters = [-80, 0, 80] as const;
export const buildings: Building[] = [
  { id: 'station', x: 26, z: -30, width: 22, depth: 16, height: 8, color: '#d6d4b9', kind: 'civic', label: 'TRAFFIC BUREAU' },
  { id: 'garage', x: 55, z: -26, width: 18, depth: 24, height: 6, color: '#de9c65', kind: 'shop', label: 'FENDER & SONS' },
  { id: 'diner', x: 29, z: 28, width: 28, depth: 17, height: 6, color: '#f0bd8c', kind: 'shop', label: 'SUNSET DINER' },
  { id: 'records', x: 59, z: 25, width: 13, depth: 21, height: 9, color: '#87b9ad', kind: 'shop', label: 'OFFBEAT RECORDS' },
  { id: 'bank', x: 44, z: 56, width: 40, depth: 18, height: 12, color: '#decaa8', kind: 'civic', label: 'FINE & DANDY BANK' },
  { id: 'warehouse-a', x: -30, z: -26, width: 25, depth: 24, height: 9, color: '#bb795f', kind: 'warehouse', label: 'PORTSIDE FREIGHT' },
  { id: 'warehouse-b', x: -54, z: -57, width: 24, depth: 18, height: 7, color: '#81a0a0', kind: 'warehouse' },
  { id: 'warehouse-c', x: -27, z: -57, width: 18, depth: 18, height: 6, color: '#d4ad67', kind: 'warehouse' },
  ...[-1, 1].flatMap((side) => [-104, 104].flatMap((z, row) => [-47, -19, 24, 52].map((x, n): Building => ({ id: `outer-${side}-${row}-${n}`, x: side < 0 ? z : x, z: side < 0 ? x : z, width: 12 + n % 2 * 3, depth: 12, height: 5.5 + n % 3, color: ['#dfae8c', '#a3b7ae', '#e3d1a3', '#bd9c8a'][n]!, kind: 'house' })))),
  { id: 'house-a', x: -25, z: 26, width: 14, depth: 15, height: 6, color: '#e2bb8c', kind: 'house' },
  { id: 'house-b', x: -56, z: 57, width: 15, depth: 14, height: 6, color: '#91b9af', kind: 'house' },
  { id: 'house-c', x: -56, z: 42, width: 15, depth: 13, height: 5, color: '#c68c72', kind: 'house' },
];
export const trees: Tree[] = [];
for (let i = -112; i <= 112; i += 16) {
  if (roadCenters.every((p) => Math.abs(i - p) > 12)) {
    trees.push({ x: i, z: -92, scale: 1 }, { x: i, z: 92, scale: 1.1 }, { x: -92, z: i, scale: .9 }, { x: 92, z: i, scale: 1 });
  }
}
trees.push(...[[-67, 34], [-44, 64], [-40, 58], [-44, 48], [-35, 47], [60, -57], [23, -59], [48, -56]].map(([x, z]) => ({ x: x!, z: z!, scale: 1.15 })));
export const districtProps = defineDistrictProps(trees, roadCenters);

const laneNodes = [
  { id: 'sw', x: -76, z: -76 }, { id: 'se', x: 76, z: -76 }, { id: 'ne', x: 76, z: 76 }, { id: 'nw', x: -76, z: 76 },
  { id: 'isw', x: -4, z: -84 }, { id: 'inw', x: -4, z: 84 }, { id: 'ine', x: 84, z: 84 }, { id: 'ise', x: 84, z: -84 },
];
export const districtMap: CollisionMap = {
  id: 'sunset-borough', revision: 'sunset-borough-2',
  bounds: { minX: -125, maxX: 125, minZ: -125, maxZ: 125 },
  colliders: [
    ...buildings.map((b) => ({ id: b.id, shape: 'box' as const, pose: { x: b.x, z: b.z, yaw: 0 }, halfExtents: { x: b.width / 2, y: b.height / 2, z: b.depth / 2 }, layer: 'world-solid' as const, surface: 'asphalt' as const })),
    ...[{ x: -126, z: 0, w: 2, d: 254 }, { x: 126, z: 0, w: 2, d: 254 }, { x: 0, z: -126, w: 254, d: 2 }, { x: 0, z: 126, w: 254, d: 2 }].map((b, i) => ({ id: `boundary-${i}`, shape: 'box' as const, pose: { x: b.x, z: b.z, yaw: 0 }, halfExtents: { x: b.w / 2, y: 1, z: b.d / 2 }, layer: 'world-solid' as const, surface: 'grass' as const })),
  ],
  wetSurfaces: ROAD_PUDDLES,
  surfaces: [
    { id: 'ground', polygonXZ: [-125, -125, 125, -125, 125, 125, -125, 125], surface: 'grass' },
    ...roadCenters.flatMap((p) => [{ id: `road-x-${p}`, polygonXZ: [p - 8, -125, p + 8, -125, p + 8, 125, p - 8, 125], surface: 'asphalt' as const }, { id: `road-z-${p}`, polygonXZ: [-125, p - 8, 125, p - 8, 125, p + 8, -125, p + 8], surface: 'asphalt' as const }]),
    { id: 'park-trail', polygonXZ: [-68, 10, -60, 10, -10, 64, -10, 72], surface: 'dirt' },
    { id: 'freight-cut', polygonXZ: [-72, -47, -72, -39, -10, -39, -10, -47], surface: 'dirt' },
  ],
  spawns: [
    { id: 'bureau-start', pose: { x: 4, z: -48, yaw: 0 }, clearanceRadius: 5 },
    { id: 'north', pose: { x: -4, z: 48, yaw: Math.PI }, clearanceRadius: 5 },
    { id: 'west', pose: { x: -76, z: 25, yaw: 0 }, clearanceRadius: 5 },
    { id: 'east', pose: { x: 76, z: -25, yaw: Math.PI }, clearanceRadius: 5 },
    { id: 'southwest', pose: { x: -38, z: -84, yaw: Math.PI / 2 }, clearanceRadius: 5 },
    { id: 'northeast', pose: { x: 38, z: 84, yaw: -Math.PI / 2 }, clearanceRadius: 5 },
    { id: 'south', pose: { x: 4, z: -106, yaw: 0 }, clearanceRadius: 5 },
    { id: 'far-north', pose: { x: -4, z: 106, yaw: Math.PI }, clearanceRadius: 5 },
  ],
  laneNodes,
  laneEdges: [['sw', 'se'], ['se', 'ne'], ['ne', 'nw'], ['nw', 'sw'], ['isw', 'inw'], ['inw', 'ine'], ['ine', 'ise'], ['ise', 'isw']].map(([from, to]) => ({ from: from!, to: to!, speedLimit: 11 })),
};

export { VEHICLE_BODIES } from '@fender/contracts';
export { DISTRICT_WATER, ROAD_PUDDLES, waterFootprint } from './water';
export const ASSET_PROVENANCE = {
  revision: 'original-procedural-1',
  creator: 'Fender Offenders project',
  source: 'packages/renderer/src and packages/content/src',
  status: 'shipping',
  license: 'Project-authored source under the repository license; no third-party artwork, audio recordings, fonts, textures or models.',
  note: 'All geometry, materials, generated sign textures and Web Audio synthesis are original procedural project code. Babylon.js is a separately licensed code dependency. No CC0 claims are made.',
} as const;

export const cityLayout = { buildings, trees, roadCenters, map: districtMap };
export const districtScene: SceneManifest = {
  mapRevision: districtMap.revision, assetCatalogRevision: ASSET_PROVENANCE.revision,
  environment: { skyColor: '#b8d1ce', fogColor: '#b8d1ce', sunDirection: [-.65, -1, .45] },
  visualInstances: buildings.map((b) => ({ assetId: b.kind, pose: { x: b.x, z: b.z, yaw: 0 }, scale: [b.width, b.height, b.depth] })),
  qualityVariants: ['low', 'medium', 'high'],
};

/** Cosmetic speed humps only: these never modify collision geometry or vehicle authority. */
export const ROAD_BUMPS = [
  {id:'bureau-hump',x:0,z:-20,yaw:0,width:14,length:1.6,height:.18},
  {id:'north-hump',x:0,z:20,yaw:0,width:14,length:1.6,height:.18},
  {id:'east-hump',x:80,z:40,yaw:0,width:14,length:1.6,height:.18},
  {id:'west-hump',x:-80,z:-40,yaw:0,width:14,length:1.6,height:.18},
  {id:'harbor-hump',x:40,z:-80,yaw:Math.PI/2,width:14,length:1.6,height:.18},
  {id:'park-hump',x:-40,z:80,yaw:Math.PI/2,width:14,length:1.6,height:.18},
] as const;
