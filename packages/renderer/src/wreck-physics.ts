import RAPIER from '@dimforge/rapier3d-compat';
import { initPhysics } from '@fender/physics';
import type { CollisionMap } from '@fender/contracts';

const STEP = 1 / 60;
const ENVIRONMENT = 0x00010002, DEBRIS = 0x00020003, SEPARATING = 0x00020001;

/** Client-only debris world. No authority bodies, vehicle impulses or network state. */
export class WreckPhysics {
  readonly ready: Promise<void>;
  private world: RAPIER.World | null = null;
  private events: RAPIER.EventQueue | null = null;
  private accumulator = 0;
  private disposed = false;
  partCollisions = 0;

  constructor(map?: CollisionMap) {
    this.ready = initPhysics().then(() => {
      if (this.disposed) return;
      this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
      this.world.timestep = STEP;
      this.events = new RAPIER.EventQueue(true);
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(1000, .1, 1000).setTranslation(0, -.1, 0).setFriction(.8).setCollisionGroups(ENVIRONMENT));
      for (const solid of map?.colliders ?? []) {
        if (solid.layer !== 'world-solid') continue;
        const shape = solid.shape === 'box' && solid.halfExtents
          ? RAPIER.ColliderDesc.cuboid(solid.halfExtents.x, solid.halfExtents.y, solid.halfExtents.z)
          : solid.vertices ? RAPIER.ColliderDesc.convexHull(new Float32Array(solid.vertices.map((n, i) => i % 3 === 0 ? -n : n))) : null;
        if (!shape) continue;
        shape.setTranslation(-solid.pose.x, solid.halfExtents?.y ?? 0, solid.pose.z)
          .setRotation({ x: 0, y: -Math.sin(solid.pose.yaw / 2), z: 0, w: Math.cos(solid.pose.yaw / 2) })
          .setFriction(.7).setCollisionGroups(ENVIRONMENT);
        this.world.createCollider(shape);
      }
    });
  }

  get initialized(): boolean { return this.world !== null; }
  get bodyCount(): number { return this.world?.bodies.len() ?? 0; }

  create(position: RAPIER.Vector, rotation: RAPIER.Rotation, half: RAPIER.Vector, velocity: RAPIER.Vector, spin: RAPIER.Vector): RAPIER.RigidBody | null {
    if (!this.world) return null;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z).setRotation(rotation)
      .setLinvel(velocity.x, velocity.y, velocity.z).setAngvel(spin)
      .setLinearDamping(.6).setAngularDamping(.45).setCcdEnabled(true).setCanSleep(true));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.025, half.x), Math.max(.025, half.y), Math.max(.025, half.z))
      .setFriction(.7).setRestitution(.35).setCollisionGroups(SEPARATING).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
    return body;
  }

  enablePartContacts(body: RAPIER.RigidBody): void { body.collider(0).setCollisionGroups(DEBRIS); }
  remove(body: RAPIER.RigidBody | null): void { if (body && this.world && body.isValid()) this.world.removeRigidBody(body); }

  step(delta: number): void {
    if (!this.world || !this.events || !this.bodyCount) { this.accumulator = 0; return; }
    this.accumulator += Math.min(.1, Math.max(0, delta));
    while (this.accumulator + 1e-9 >= STEP) {
      this.accumulator -= STEP;
      this.world.step(this.events);
      this.events.drainCollisionEvents((a, b, started) => {
        if (started && this.world?.getCollider(a)?.parent()?.isDynamic() && this.world.getCollider(b)?.parent()?.isDynamic()) this.partCollisions++;
      });
    }
  }

  reset(): void { this.accumulator = 0; this.partCollisions = 0; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events?.free(); this.world?.free(); this.events = null; this.world = null;
  }
}
