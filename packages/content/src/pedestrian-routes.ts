export interface PedestrianPoint { x: number; z: number; crossingToNext?: boolean }
export interface PedestrianRoute { id: string; points: readonly PedestrianPoint[] }
/** Sidewalks lie 10.2m from road centres; crossings match the authored zebra stripes. */
export const PEDESTRIAN_ROUTES: readonly PedestrianRoute[] = [
  ...[-80, 0].flatMap(x => [-80, 0].map(z => ({ id: `block-${x}-${z}`, points: [
    { x: x + 10.2, z: z + 10.2 }, { x: x + 69.8, z: z + 10.2 }, { x: x + 69.8, z: z + 69.8 }, { x: x + 10.2, z: z + 69.8 },
  ] }))),
  ...[-80, 0].map(z => ({ id: `zebra-east-west-${z}`, points: [
    { x: -10.2, z: z + 10.2, crossingToNext: true }, { x: 10.2, z: z + 10.2 }, { x: 10.2, z: z + 69.8, crossingToNext: true }, { x: -10.2, z: z + 69.8 },
  ] })),
  ...[-80, 0].map(x => ({ id: `zebra-north-south-${x}`, points: [
    { x: x + 10.2, z: -10.2, crossingToNext: true }, { x: x + 10.2, z: 10.2 }, { x: x + 69.8, z: 10.2, crossingToNext: true }, { x: x + 69.8, z: -10.2 },
  ] })),
];
