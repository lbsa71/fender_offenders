import { matchMaker, ServerError } from '@colyseus/core';
import type { DrivingRoom } from './index.js';

export const serverMetrics = { rooms: 0, steps: 0, rejectedInputs: 0, queueResets: 0, slowSteps: 0, maxStepMs: 0, bytesPublished: 0, draining: false, expiredRooms: 0, evictedRooms: 0, idleDisconnects: 0 };

/** One process owns all live worlds. Admission never waits for physics while holding its lock. */
class RoomRegistry {
  readonly creating = new Set<DrivingRoom>();
  readonly registered = new Set<DrivingRoom>();
  private admission = Promise.resolve();
  private invites = new Map<string, Promise<void>>();

  reserve(room: DrivingRoom): Promise<void> {
    const operation = this.admission.then(async () => {
      if (serverMetrics.draining) throw new ServerError(503, 'server-shutdown');
      const limit = Number(process.env.MAX_ROOMS || 20);
      if (this.creating.size + this.registered.size >= limit) {
        const candidates = [...this.registered].filter(candidate => candidate.emptySince !== null).sort((a,b) => a.emptySince! - b.emptySince!);
        for (const candidate of candidates) {
          if (await candidate.retire('eviction')) break;
        }
      }
      if (this.creating.size + this.registered.size >= limit) throw new ServerError(503, 'Dispatch capacity reached');
      this.creating.add(room); serverMetrics.rooms++;
    });
    this.admission = operation.catch(() => {});
    return operation;
  }
  register(room: DrivingRoom) { this.creating.delete(room); this.registered.add(room); }
  release(room: DrivingRoom) {
    const counted = this.creating.delete(room) || this.registered.delete(room);
    if (counted) serverMetrics.rooms--;
  }
  async ensureInvite(code: string, options: Record<string, unknown>) {
    if (await matchMaker.getRoomById(code)) return;
    let creating = this.invites.get(code);
    if (!creating) {
      creating = (async () => {
        if (!await matchMaker.getRoomById(code)) await matchMaker.createRoom('district', { ...options, inviteCode: code });
      })().finally(() => this.invites.delete(code));
      this.invites.set(code, creating);
    }
    await creating;
  }
}
export const roomRegistry = new RoomRegistry();
export function getRoomMetrics() {
  let connectedPlayers=0,reconnectingPlayers=0,emptyRooms=0,pausedRooms=0;
  for(const room of roomRegistry.registered) {
    const occupancy=room.occupancy();connectedPlayers+=occupancy.connected;reconnectingPlayers+=occupancy.reconnecting;
    if(room.emptySince!==null)emptyRooms++;if(room.isPaused)pausedRooms++;
  }
  return { maxRooms:Number(process.env.MAX_ROOMS||20),registeredRooms:roomRegistry.registered.size,connectedPlayers,reconnectingPlayers,creatingRooms:roomRegistry.creating.size,emptyRooms,pausedRooms };
}
