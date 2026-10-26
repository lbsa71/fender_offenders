import { expect, it } from 'vitest';
import type { VehicleState } from '@fender/contracts';
import { buildings } from '@fender/content';
import { PEDESTRIAN_ROUTES, type PedestrianRoute } from '../../content/src/pedestrian-routes';
import { isPedestrianSidewalk, PedestrianMotion } from './pedestrian-motion';
const route: PedestrianRoute = { id: 'crossing', points: [{ x: -10.2, z: -10.2, crossingToNext: true }, { x: 10.2, z: -10.2 }, { x: 10.2, z: -69.8, crossingToNext: true }, { x: -10.2, z: -69.8 }] };
const car = (x: number, z: number, vx = 0, vz = 0, id = 'car', yawRate = 0): VehicleState => ({ entityId: id, playerId: null, bodyAssetId: 'patrol', pose: { x, z, yaw: 0 }, velocity: { x: vx, z: vz, yawRate }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: 0 });
const separation = (point: { x: number; z: number }, vehicle: VehicleState) => Math.hypot(point.x - vehicle.pose.x, point.z - vehicle.pose.z);

it('authors a bounded crowd on clear sidewalks and actual zebra crossings', () => {
  expect(PEDESTRIAN_ROUTES.length).toBeGreaterThanOrEqual(8);
  const motion = new PedestrianMotion(); expect(motion.getStates()).toHaveLength(24);
  for (const person of motion.getStates()) for (const building of buildings) expect(Math.abs(person.x - building.x) > building.width / 2 + .5 || Math.abs(person.z - building.z) > building.depth / 2 + .5).toBe(true);
  expect(PEDESTRIAN_ROUTES.some(route => route.points.some(point => point.crossingToNext))).toBe(true);
});
it('walks and crosses only after a safe gap, with deterministic fixed stepping', () => {
  const a = new PedestrianMotion([route], 1), b = new PedestrianMotion([route], 1);
  for (let i = 0; i < 60; i++) a.update([], 1 / 60);
  for (let i = 0; i < 30; i++) b.update([], 1 / 30);
  expect(a.getStates()).toEqual(b.getStates()); expect(a.getStates()[0]!.x).toBeGreaterThan(-10);
});
it('waits at a zebra crossing for fast traffic instead of stepping into its path', () => {
  const motion = new PedestrianMotion([route], 1); motion.update([car(4, -60, 0, 28)], 1 / 60);
  const person = motion.getStates()[0]!; expect(person.x).toBeLessThanOrEqual(-8.8); expect(person.mode).not.toBe('walking');
});
it.each(['traffic-patrol', 'patrol'])('waits for ordinary %s traffic without fleeing', bodyAssetId => {
  const motion = new PedestrianMotion([route], 1);
  // Seven metres from the pavement: close enough to trigger the old panic rule,
  // but outside the overlap guard. Traffic must still block this crossing.
  motion.update([{ ...car(-3.2, -24.2, 0, 28), bodyAssetId }], 1 / 60);
  expect(motion.getStates()[0]!.mode).toBe('waiting');
  expect(motion.getStates()[0]!.x).toBe(-10.2);
});
it.each(['officer', 'suspect'])('flees an approaching %s using identity rather than body style', kind => {
  const motion = new PedestrianMotion([route], 1);
  const vehicle = { ...car(-3.2, -24.2, 0, 28, 'wanted'), bodyAssetId: 'traffic-patrol', playerId: kind === 'officer' ? 'player' : null };
  motion.update([vehicle], 1 / 60, kind === 'suspect' ? vehicle.entityId : undefined);
  expect(motion.getStates()[0]!.mode).toBe('running');
});
it('keeps ordinary traffic overlap protection without starting a running animation', () => {
  const motion = new PedestrianMotion([route], 1), vehicle = car(-10.2, -10.2);
  motion.update([vehicle], 0);
  const person = motion.getStates()[0]!;
  expect(person.hiddenSafety || separation(person, vehicle) > 4.6).toBe(true);
  expect(person.mode).not.toBe('running');
});
it.each([[0, 28, 0], [0, -28, 0], [20, 14, 1.9]])('runs from approaching officers including reverse/turn motion (%s,%s,%s)', (vx, vz, turn) => {
  const motion = new PedestrianMotion([route], 1);
  motion.update([{ ...car(-10.2 - vx * .5, -10.2 - vz * .5, vx, vz, 'approaching', turn), playerId: 'officer' }], 1 / 60);
  expect(motion.getStates()[0]!.mode).toBe('running');
});
it('uses every car, including traffic, and never exposes a person inside a late teleported vehicle', () => {
  const motion = new PedestrianMotion([route], 1), vehicles = [car(70, 70, 0, 0, 'local'), car(-10.2, -10.2, 0, 0, 'traffic')];
  motion.update(vehicles, 0);
  for (const person of motion.getStates().filter(person => !person.hiddenSafety)) expect(vehicles.every(vehicle => separation(person, vehicle) > 4)).toBe(true);
  expect(motion.getStates()[0]!.mode).not.toBe('running');
});
it('reserves clearance for a fully stretched car and swinging running arms', () => {
  const motion = new PedestrianMotion([route], 1), vehicle = car(-5.8, -10.2);
  motion.update([vehicle], 0); const person = motion.getStates()[0]!;
  expect(person.hiddenSafety || separation(person, vehicle) > 4.6).toBe(true);
});
it('detects car motion swept between render frames rather than only endpoint overlap', () => {
  const motion = new PedestrianMotion([route], 1); motion.update([car(-10.2, -35)], 0); motion.update([car(-10.2, 15)], 0);
  const person = motion.getStates()[0]!;
  expect(person.hiddenSafety || Math.abs(person.x + 10.2) > 4.1 || person.z < -39.2 || person.z > 19.2).toBe(true);
});
it('runs back along the zebra crossing to pavement when a suspect approaches mid-crossing', () => {
  const motion = new PedestrianMotion([route], 1); for (let i = 0; i < 180; i++) motion.update([], 1 / 60);
  const before = motion.getStates()[0]!; expect(before.x).toBeGreaterThan(-8.8);
  motion.update([car(4, -45, 0, 28, 'suspect')], 1 / 60, 'suspect'); const after = motion.getStates()[0]!;
  expect(after.mode).toBe('running'); expect(after.x).toBeLessThan(before.x);
});
it('keeps safety during repeated top-speed incursions and never retreats inside buildings or arbitrary road space', () => {
  const motion = new PedestrianMotion();
  for (let frame = 0; frame < 180; frame++) {
    const vehicles = [car(10.2, -70 + frame * .6, 0, 36), { ...car(-70 + frame * .7, -10.2, 42, 0, 'turner', 1.4), playerId: 'officer' }]; motion.update(vehicles, 1 / 60);
    for (const person of motion.getStates().filter(person => !person.hiddenSafety)) {
      expect(vehicles.every(vehicle => separation(person, vehicle) > 4)).toBe(true);
      const onZebra = PEDESTRIAN_ROUTES.some(route => route.points.some((a, i) => {
        if (!a.crossingToNext) return false; const b = route.points[(i + 1) % route.points.length]!;
        return person.x >= Math.min(a.x, b.x) - .4 && person.x <= Math.max(a.x, b.x) + .4 && person.z >= Math.min(a.z, b.z) - .4 && person.z <= Math.max(a.z, b.z) + .4;
      }));
      expect(isPedestrianSidewalk(person) || onZebra, 'movement stays on pavement or a painted crossing').toBe(true);
      for (const building of buildings) expect(Math.abs(person.x - building.x) > building.width / 2 + .4 || Math.abs(person.z - building.z) > building.depth / 2 + .4).toBe(true);
    }
  }
});
it('temporarily suppresses figures only when every validated refuge is occupied, then restores them', () => {
  const motion = new PedestrianMotion(), vehicles: VehicleState[] = [];
  for (let x = -75; x <= 75; x += 5) for (let z = -75; z <= 75; z += 5) vehicles.push(car(x, z, 0, 0, `${x}-${z}`));
  motion.update(vehicles, 0); expect(motion.getStates().filter(person => person.hiddenSafety)).toHaveLength(24);
  motion.update([], 0); expect(motion.getStates().filter(person => !person.hiddenSafety)).toHaveLength(24);
});
it('reset deterministically clears old sweeps and dispose permanently removes the crowd', () => {
  const motion = new PedestrianMotion(); const initial = motion.getStates(); motion.update([car(0, 0, 24, 0)], .2); motion.reset(); expect(motion.getStates()).toEqual(initial);
  motion.dispose(); motion.update([], .1); motion.reset(); expect(motion.getStates()).toEqual([]);
});
it('uses crossing waits without running or emergency relocation for an ordinary lane pass', () => {
  const motion = new PedestrianMotion();
  for (let i = 0; i < 300; i++) { motion.update([car(4, -70 + i * 28 / 60, 0, 28)], 1 / 60); expect(motion.getStates().some(p => p.mode === 'running')).toBe(false); }
  expect(motion.getDiagnostics().emergencyRetreats).toBe(0);
  expect(motion.getStates().filter(person => person.hiddenSafety)).toHaveLength(0);
});
it('runs sideways into clear pavement for a curb-hugging officer without repeated emergency hops', () => {
  const motion = new PedestrianMotion();
  for (let i = 0; i < 84; i++) motion.update([{ ...car(8, -52 + i * 28 / 60, 0, 28), playerId: 'officer' }], 1 / 60);
  expect(motion.getDiagnostics().emergencyRetreats).toBeLessThanOrEqual(1);
  expect(motion.getStates().filter(person => person.hiddenSafety)).toHaveLength(0);
});
