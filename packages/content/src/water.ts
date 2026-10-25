/** Shallow cosmetic water only: no new collider, grip surface or route obstruction. */
export const DISTRICT_WATER = [
  { id: 'bureau-curb', kind: 'puddle', x: 6.7, z: -34, width: 1.5, depth: 3.4, y: .039, shallow: true },
  { id: 'north-curb', kind: 'puddle', x: -6.7, z: 30, width: 1.5, depth: 3, y: .039, shallow: true },
  { id: 'east-curb', kind: 'puddle', x: 86.7, z: 12, width: 1.5, depth: 3.8, y: .039, shallow: true },
  { id: 'south-curb', kind: 'puddle', x: 45, z: -73.3, width: 3.4, depth: 1.5, y: .039, shallow: true },
  { id: 'park-pond', kind: 'pond', x: -32, z: 61, width: 10, depth: 8, y: .285, shallow: true },
  { id: 'garden-pool', kind: 'pool', x: 42, z: -63, width: 9, depth: 5, y: .285, shallow: true },
] as const;
