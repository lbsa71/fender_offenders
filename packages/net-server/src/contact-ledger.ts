import { isRecord, zeroContactAdjustment, type ContactAdjustment, type LocalVehicleMotion, type VehicleContactDelta } from '@fender/contracts';

/** Keep contact responses independent of teleports and acknowledge them once. */
export class ContactLedger {
  private current = zeroContactAdjustment();
  private history = new Map<number, ContactAdjustment>([[0,this.current]]);
  constructor(private life: number) {}
  get state(): ContactAdjustment { return structuredClone(this.current); }
  sync(life: number) {
    if (life === this.life) return;
    this.life=life;this.current=zeroContactAdjustment();this.history=new Map([[0,this.current]]);
  }
  adjust(value: unknown): LocalVehicleMotion | null {
    if (!isRecord(value)||!isRecord(value.pose)||!isRecord(value.velocity)) return null;
    const revision=value.contactRevision??0;
    if (!Number.isInteger(revision)||typeof revision!=='number') return null;
    const acknowledged=this.history.get(revision);if(!acknowledged)return null;
    const p=value.pose,v=value.velocity;
    if(![p.x,p.z,p.yaw,v.x,v.z,v.yawRate].every(n=>typeof n==='number'&&Number.isFinite(n)))return null;
    return {sequence:value.sequence as number,discontinuityId:value.discontinuityId as number,contactRevision:this.current.revision,
      pose:{x:(p.x as number)+this.current.pose.x-acknowledged.pose.x,z:(p.z as number)+this.current.pose.z-acknowledged.pose.z,yaw:(p.yaw as number)+this.current.pose.yaw-acknowledged.pose.yaw},
      velocity:{x:(v.x as number)+this.current.velocity.x-acknowledged.velocity.x,z:(v.z as number)+this.current.velocity.z-acknowledged.velocity.z,yawRate:(v.yawRate as number)+this.current.velocity.yawRate-acknowledged.velocity.yawRate}};
  }
  record(delta: VehicleContactDelta) {
    const next=structuredClone(this.current);next.revision++;
    for(const axis of ['x','z','yaw'] as const)next.pose[axis]+=delta.pose[axis];
    for(const axis of ['x','z','yawRate'] as const)next.velocity[axis]+=delta.velocity[axis];
    this.current=next;this.history.set(next.revision,next);
    // More than three seconds of 60 Hz contact history, matching bounded delivery.
    if(this.history.size>256)this.history.delete(this.history.keys().next().value!);
  }
}
