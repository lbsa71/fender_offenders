import RAPIER from '@dimforge/rapier3d-compat';
import type { CollisionMap, PlanarPose, PropDefinition, PropState, VehicleState } from '@fender/contracts';

export const MAX_PHYSICS_PROPS = 192;
interface PropRecord { entityId: string; handle: number; mode: PropState['mode']; discontinuityId: number; nextKickTick: number }
interface CarRecord { entityId: string; handle: number; pose: PlanarPose; discontinuityId: number }
export interface PropPhysicsCheckpoint { signature: string; bytes: Uint8Array; records: PropRecord[]; cars: CarRecord[]; tick: number }
const yaw = (angle: number) => ({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
const ZERO = { x: 0, y: 0, z: 0 };
const CAR_SHAPE = new RAPIER.Cuboid(.95, .65, 2.15);
const PROP_GROUPS = 0x00020007, WORLD_GROUPS = 0x00010002, CAR_GROUPS = 0x00040002;

/** Independent authority-only debris world: kinematic cars can push debris; debris never changes arcade cars. */
export function createPropPhysics(map: CollisionMap, input: readonly PropDefinition[]) {
  const definitions = structuredClone(input);
  if (definitions.length > MAX_PHYSICS_PROPS || new Set(definitions.map(p => p.entityId)).size !== definitions.length) throw new Error('Invalid or excessive physics props');
  for (const p of definitions) if (!p.entityId || !['barrel','crate','bin','lamp','sign','tree','bench'].includes(p.kind) || ![p.position.x,p.position.y,p.position.z,p.yaw??0,p.scale??1].every(Number.isFinite) || (p.scale??1) < .25 || (p.scale??1) > 3) throw new Error('Invalid physics prop definition');
  const signature=JSON.stringify(definitions.map(p=>[p.entityId,p.kind,p.position.x,p.position.y,p.position.z,p.yaw??0,p.scale??1,p.anchored??['lamp','sign','tree'].includes(p.kind)]));
  let world: RAPIER.World, records: PropRecord[] = [], cars: CarRecord[] = [], tick = 0, disposed = false;
  const check = () => { if (disposed) throw new Error('Prop physics disposed'); };
  function colliders(p: PropDefinition): RAPIER.ColliderDesc[] {
    const s = p.scale ?? 1, cube = (x:number,y:number,z:number) => RAPIER.ColliderDesc.cuboid(x*s,y*s,z*s);
    switch (p.kind) {
      case 'barrel': return [RAPIER.ColliderDesc.cylinder(.6*s,.4*s)];
      case 'crate': return [cube(.5,.5,.5)];
      case 'bin': return [cube(.4,.55,.4)];
      case 'lamp': return [cube(.15,2.5,.15)];
      case 'sign': return [cube(.14,1.5,.14), cube(.55,.4,.07).setTranslation(0,.9*s,0)];
      case 'tree': return [cube(.16,2.4,.16), RAPIER.ColliderDesc.ball(1.2*s).setTranslation(0,1.9*s,0)];
      case 'bench': return [cube(1.2,.1,.3),cube(1.2,.35,.08).setTranslation(0,.4*s,.28*s),cube(.08,.25,.25).setTranslation(-.9*s,-.35*s,0),cube(.08,.25,.25).setTranslation(.9*s,-.35*s,0)];
    }
  }
  function build(previous: PropRecord[] = []) {
    world = new RAPIER.World({x:0,y:-9.81,z:0}); world.timestep = 1/60; world.integrationParameters.maxCcdSubsteps = 4;
    const b = map.bounds, cx = (b.minX+b.maxX)/2, cz = (b.minZ+b.maxZ)/2, hx=(b.maxX-b.minX)/2, hz=(b.maxZ-b.minZ)/2;
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx+10,.1,hz+10).setTranslation(cx,-.1,cz).setCollisionGroups(WORLD_GROUPS).setFriction(.85));
    for (const c of map.colliders) if (c.layer === 'world-solid') {
      const shape = c.shape === 'box' ? RAPIER.ColliderDesc.cuboid(c.halfExtents!.x,c.halfExtents!.y,c.halfExtents!.z) : RAPIER.ColliderDesc.convexHull(new Float32Array(c.vertices!));
      if (!shape) continue;
      world.createCollider(shape.setTranslation(c.pose.x,c.shape==='box'?c.halfExtents!.y:0,c.pose.z).setRotation(yaw(c.pose.yaw)).setCollisionGroups(WORLD_GROUPS));
    }
    for (const [x,z,w,d] of [[b.minX-1,cz,1,hz+2],[b.maxX+1,cz,1,hz+2],[cx,b.minZ-1,hx+2,1],[cx,b.maxZ+1,hx+2,1]]) world.createCollider(RAPIER.ColliderDesc.cuboid(w!,3,d!).setTranslation(x!,3,z!).setCollisionGroups(WORLD_GROUPS));
    records = definitions.map(p => {
      const fixed = p.anchored ?? ['lamp','sign','tree'].includes(p.kind);
      const desc = (fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()).setTranslation(p.position.x,p.position.y,p.position.z).setRotation(yaw(p.yaw??0)).setLinearDamping(.35).setAngularDamping(.6).setCcdEnabled(true);
      const body = world.createRigidBody(desc);
      for (const collider of colliders(p)) world.createCollider(collider.setDensity(p.kind==='tree'?12:35).setFriction(.8).setRestitution(.15).setCollisionGroups(PROP_GROUPS),body);
      return {entityId:p.entityId,handle:body.handle,mode:fixed?'fixed':'dynamic',discontinuityId:previous.length?(previous.find(r=>r.entityId===p.entityId)?.discontinuityId??0)+1:0,nextKickTick:0};
    });
    cars = []; tick = 0;
  }
  build();
  return {
    signature,
    step(vehicles: readonly VehicleState[]) {
      check(); tick++;
      const active = vehicles.filter(v=>v.status==='active').slice(0,24), ids = new Set(active.map(v=>v.entityId));
      for (const car of cars) if (!ids.has(car.entityId)) world.removeRigidBody(world.getRigidBody(car.handle));
      cars = cars.filter(car=>ids.has(car.entityId));
      // Prop transforms cannot change until world.step(). Sample each WASM body
      // once instead of reading all of them again for every moving car.
      const bodies = records.map(record => world.getRigidBody(record.handle));
      const positions = bodies.map(body => body.translation());
      for (const v of active) {
        let car = cars.find(car=>car.entityId===v.entityId);
        if (!car) { const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(v.pose.x,.65,v.pose.z).setRotation(yaw(v.pose.yaw))); world.createCollider(RAPIER.ColliderDesc.cuboid(.95,.65,2.15).setCollisionGroups(CAR_GROUPS),body); car={entityId:v.entityId,handle:body.handle,pose:{...v.pose},discontinuityId:v.discontinuityId}; cars.push(car); }
        const proxy = world.getRigidBody(car.handle), teleported = car.discontinuityId!==v.discontinuityId || Math.hypot(v.pose.x-car.pose.x,v.pose.z-car.pose.z)>6;
        if (teleported) { proxy.setTranslation({x:v.pose.x,y:.65,z:v.pose.z},true); proxy.setRotation(yaw(v.pose.yaw),true); }
        const start = teleported ? v.pose : car.pose, delta={x:v.pose.x-start.x,y:0,z:v.pose.z-start.z}, speed=Math.hypot(v.velocity.x,v.velocity.z);
        const sweepRadius=Math.hypot(delta.x,delta.z)+7,sweepRadiusSquared=sweepRadius*sweepRadius;
        if (speed>.75) for (let index=0;index<records.length;index++) {
          const record=records[index]!;
          if (tick<record.nextKickTick) continue;
          const body=bodies[index]!, point=positions[index]!;
          const dx=point.x-v.pose.x,dz=point.z-v.pose.z;
          if (dx*dx+dz*dz>sweepRadiusSquared) continue;
          let contact=false;
          for(let i=0;i<body.numColliders();i++) if(body.collider(i).castShape(ZERO,CAR_SHAPE,{x:start.x,y:.65,z:start.z},yaw(start.yaw),delta,0,1,true) || body.collider(i).intersectsShape(CAR_SHAPE,{x:v.pose.x,y:.65,z:v.pose.z},yaw(v.pose.yaw))) {contact=true;break;}
          if (!contact || teleported) continue;
          if(record.mode==='fixed'){body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);record.mode='dynamic';record.discontinuityId++;}
          const mass=body.mass(), nx=v.velocity.x/speed,nz=v.velocity.z/speed,push=Math.min(12,speed*.5);
          body.applyImpulseAtPoint({x:nx*mass*push,y:mass*Math.min(2.2,.4+speed*.075),z:nz*mass*push},{x:point.x,y:.65,z:point.z},true);
          record.nextKickTick=tick+30;
        }
        proxy.setNextKinematicTranslation({x:v.pose.x,y:.65,z:v.pose.z}); proxy.setNextKinematicRotation(yaw(v.pose.yaw)); car.pose={...v.pose}; car.discontinuityId=v.discontinuityId;
      }
      for (let index=0;index<records.length;index++) if(records[index]!.mode==='dynamic') {
        const r=records[index]!,body=bodies[index]!,p=positions[index]!,v=body.linvel(),a=body.angvel(),s=Math.hypot(v.x,v.y,v.z),spin=Math.hypot(a.x,a.y,a.z);
        if (![p.x,p.y,p.z,s,spin].every(Number.isFinite) || p.y < -5 || p.y > 35 || p.x<map.bounds.minX-5 || p.x>map.bounds.maxX+5 || p.z<map.bounds.minZ-5 || p.z>map.bounds.maxZ+5) {
          const initial=definitions.find(p=>p.entityId===r.entityId)!; body.setTranslation(initial.position,true);body.setRotation(yaw(initial.yaw??0),true);body.setLinvel(ZERO,true);body.setAngvel(ZERO,true);r.discontinuityId++;
        } else {if(s>22)body.setLinvel({x:v.x*22/s,y:v.y*22/s,z:v.z*22/s},true);if(spin>14)body.setAngvel({x:a.x*14/spin,y:a.y*14/spin,z:a.z*14/spin},true);}
      }
      const moving=new Map<number,{velocity:RAPIER.Vector;angular:RAPIER.Vector;center:RAPIER.Vector}>();
      for(let index=0;index<records.length;index++)if(records[index]!.mode==='dynamic'){
        const body=bodies[index]!,velocity=body.linvel(),angular=body.angvel();
        // Exact zero pre-step motion cannot satisfy the closing-speed threshold,
        // even if this solver step wakes the body through another contact.
        if(velocity.x||velocity.y||velocity.z||angular.x||angular.y||angular.z)moving.set(records[index]!.handle,{velocity,angular,center:body.worldCom()});
      }
      world.step();
      const releases:{record:PropRecord;point:RAPIER.Vector;normal:RAPIER.Vector;impulse:number;closing:number}[]=[];
      if(moving.size)for(let index=0;index<records.length;index++) if(records[index]!.mode==='fixed') {
        const record=records[index]!,body=bodies[index]!;let strongest:typeof releases[number]|undefined;
        for(let i=0;i<body.numColliders();i++) {
          const fixed=body.collider(i);
          world.contactPairsWith(fixed,other=>{
            const parent=other.parent(),motion=parent?moving.get(parent.handle):undefined;if(!motion)return;
            world.contactPair(fixed,other,(manifold,flipped)=>{
              if(!manifold.numContacts()||!manifold.numSolverContacts())return;
              const point=manifold.solverContactPoint(0)!;const raw=manifold.normal(),sign=flipped?-1:1,normal={x:raw.x*sign,y:raw.y*sign,z:raw.z*sign};
              const r={x:point.x-motion.center.x,y:point.y-motion.center.y,z:point.z-motion.center.z},v=motion.velocity,w=motion.angular;
              const velocity={x:v.x+w.y*r.z-w.z*r.y,y:v.y+w.z*r.x-w.x*r.z,z:v.z+w.x*r.y-w.y*r.x};
              const closing=-(velocity.x*normal.x+velocity.y*normal.y+velocity.z*normal.z);
              let impulse=0;for(let j=0;j<manifold.numContacts();j++)impulse+=manifold.contactImpulse(j);
              if(closing>=2.5&&impulse>0&&(!strongest||impulse>strongest.impulse))strongest={record,point:{...point},normal,impulse,closing};
            });
          });
        }
        if(strongest)releases.push(strongest);
      }
      for(const release of releases){
        const body=world.getRigidBody(release.record.handle);body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);release.record.mode='dynamic';release.record.discontinuityId++;
        const amount=Math.min(release.impulse,body.mass()*Math.min(10,release.closing*.65)),n=release.normal;
        body.applyImpulseAtPoint({x:-n.x*amount,y:-n.y*amount,z:-n.z*amount},release.point,true);release.record.nextKickTick=tick+30;
      }
    },
    snapshot(): PropState[] { check(); return records.map((r,i)=>{const body=world.getRigidBody(r.handle);return {entityId:r.entityId,kind:definitions[i]!.kind,scale:definitions[i]!.scale??1,position:{...body.translation()},rotation:{...body.rotation()},mode:r.mode,sleeping:body.isSleeping(),discontinuityId:r.discontinuityId};}); },
    checkpoint(): PropPhysicsCheckpoint { check();return {signature,bytes:world.takeSnapshot(),records:structuredClone(records),cars:structuredClone(cars),tick}; },
    restore(state: PropPhysicsCheckpoint) { check();if(state.signature!==signature)throw new Error('Incompatible physics prop checkpoint');const next=RAPIER.World.restoreSnapshot(state.bytes);world.free();world=next;records=structuredClone(state.records);cars=structuredClone(state.cars);tick=state.tick; },
    reset() { check();const previous=records;world.free();build(previous); },
    dispose() {if(disposed)return;disposed=true;world.free();records=[];cars=[];},
  };
}
