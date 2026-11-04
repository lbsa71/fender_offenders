import type { ContactAdjustment, DispatchDrivingContext, DriverActions, LocalAuthorityState, VehicleState } from '@fender/contracts';
import { districtMap } from '@fender/content';
import { predictVehicle, projectVehiclePose } from '@fender/sim';

export interface ContactTrace {
  initial: LocalAuthorityState;
  initialContact: ContactAdjustment;
  events: ({ kind: 'prediction'; order: number; actions: DriverActions; proxies: VehicleState[]; tick: number; context?: DispatchDrivingContext } | { kind: 'contact'; order: number; contact: ContactAdjustment })[];
  frames: { order: number; at: number; predictionAt: number; proxies: VehicleState[] }[];
}

export function replayContactTrace(trace: ContactTrace): number[] {
  let expected = structuredClone(trace.initial), contact = structuredClone(trace.initialContact), cursor = 0;
  const events = [...trace.events].sort((a, b) => a.order - b.order);
  return trace.frames.map(frame => {
    while (cursor < events.length && events[cursor]!.order < frame.order) {
      const event = events[cursor++]!;
      if (event.kind === 'prediction') {
        expected = { ...expected, ...predictVehicle(districtMap, expected.vehicle, expected.driver, event.actions, event.proxies, undefined, event.tick, event.context) };
      } else if (event.contact.revision > contact.revision) {
        for (const axis of ['x', 'z', 'yaw'] as const) expected.vehicle.pose[axis] += event.contact.pose[axis] - contact.pose[axis];
        for (const axis of ['x', 'z', 'yawRate'] as const) expected.vehicle.velocity[axis] += event.contact.velocity[axis] - contact.velocity[axis];
        expected.vehicle.pose.yaw = Math.atan2(Math.sin(expected.vehicle.pose.yaw), Math.cos(expected.vehicle.pose.yaw));
        contact = structuredClone(event.contact);
      }
    }
    const dt = Math.max(0, Math.min(.05, (frame.at - frame.predictionAt) / 1000));
    return projectVehiclePose(expected.vehicle, dt, frame.proxies).z;
  });
}
