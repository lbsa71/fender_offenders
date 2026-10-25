import { disposeTestRooms } from '../support/rooms';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { DrivingRoom, serverMetrics } from '@fender/net-server';
import { createOnlineSession } from '@fender/net-client';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, type SessionStatus } from '@fender/contracts';
import { ErrorCode } from '@colyseus/sdk';

// A public HTTP/real SDK fixture isolates client routing from the separately owned production route.
class InviteFixtureRoom extends DrivingRoom {
  override async onCreate(options?: { inviteCode?: string }) {
    if (options?.inviteCode) this.roomId = options.inviteCode;
    await super.onCreate();
  }
}
const endpoint = 'http://127.0.0.1:2698';
const requests: { invite: string; body: unknown }[] = [];
const sessions: ReturnType<typeof createOnlineSession>[] = [];
let server: Server;
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function session() { const value = createOnlineSession(endpoint, districtMap); sessions.push(value); return value; }
beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport(), greet: false, gracefullyShutdown: false, express: app => {
    app.use(express.json());
    app.post('/dispatch/:invite', async (req, res) => {
      const invite = String(req.params.invite); requests.push({ invite, body: req.body });
      if (invite === 'Capacity_') { res.status(503).json({ error: 'Dispatch capacity reached', code: 503 }); return; }
      if (invite === 'RetryBad1') { res.status(410).json({ error: 'seat reservation expired.', code: ErrorCode.MATCHMAKE_EXPIRED }); return; }
      if (invite === 'Locked_01') { res.status(409).json({ error: 'room "Locked_01" is locked', code: ErrorCode.MATCHMAKE_INVALID_ROOM_ID }); return; }
      try {
        const existing = matchMaker.getLocalRoomById(invite);
        const reservation = existing ? await matchMaker.joinById(invite, req.body) : await matchMaker.create('district', { ...req.body, inviteCode: invite });
        if (invite === 'SeatGone1' && requests.filter(request => request.invite === invite).length === 1) {
          await matchMaker.getLocalRoomById(invite).disconnect();
        }
        res.json(reservation);
      } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
    });
  } });
  server.define('district', InviteFixtureRoom);
  await server.listen(2698, '127.0.0.1');
}, 15000);
afterEach(async () => { await disposeTestRooms();
  await Promise.allSettled(sessions.splice(0).map(value => value.dispose()));
  const deadline = performance.now() + 5000;
  while (serverMetrics.rooms && performance.now() < deadline) await pause(10);
  expect(serverMetrics.rooms).toBe(0); requests.length = 0;
});
afterAll(async () => { await server?.gracefullyShutdown(false); });

it('joins a valid persistent invite through public HTTP and consumes its real seat reservation', async () => {
  const value = session();
  const joined = await value.connect({ nickname: 'Invite client', roomId: '  Persist_A  ' });
  expect(requests).toEqual([{ invite: 'Persist_A', body: { nickname: 'Invite client', protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: GAMEPLAY_REVISION } }]);
  expect(joined.roomId).toBe('Persist_A'); expect(joined.firstState.matchId).toBe('Persist_A');
  expect(joined.localEntityId).toBeTruthy(); expect(value.getIdentity().roomId).toBe('Persist_A');
  const second = await session().connect({ nickname: 'Same invite', roomId: 'Persist_A' });
  expect(second.roomId).toBe(joined.roomId); expect(second.firstState.scores).toHaveLength(2);
  expect(requests).toHaveLength(2);
});

it('lazily recreates the reported eight-character invite instead of taking the closed-room path', async () => {
  const value = session();
  const joined = await value.connect({ nickname: 'Eight character invite', roomId: 'z__fyegL' });
  expect(joined.roomId).toBe('z__fyegL');
  expect(requests.map(request => request.invite)).toEqual(['z__fyegL']);
});

it('re-reserves the same invite when the room closes after HTTP reservation but before WebSocket join', async () => {
  const value = session();
  const joined = await value.connect({ nickname: 'Seat expired during restart', roomId: 'SeatGone1' });
  expect(joined.roomId).toBe('SeatGone1');
  expect(joined.firstState.scores).toHaveLength(1);
  expect(requests.map(request => request.invite)).toEqual(['SeatGone1', 'SeatGone1']);
});

it('keeps malformed and long invite IDs on the existing missing-room path', async () => {
  for (const roomId of ['bad!code?', 'x'.repeat(65)]) {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(status => statuses.push(status));
    await expect(value.connect({ nickname: 'Malformed invite', roomId })).rejects.toThrow();
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'room-missing' });
  }
  expect(requests).toEqual([]);
});

it('preserves the server-capacity status for a persistent invite HTTP rejection', async () => {
  const value = session(), statuses: SessionStatus[] = []; value.onStatus(status => statuses.push(status));
  await expect(value.connect({ nickname: 'Capacity invite', roomId: 'Capacity_' })).rejects.toMatchObject({ code: 503, message: 'Dispatch capacity reached' });
  expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'server-capacity' });
  expect(requests).toHaveLength(1);
});

it('bounds stale-reservation retries while preserving the same invite and final failure', async () => {
  const value = session();
  await expect(value.connect({ nickname: 'Bounded retries', roomId: 'RetryBad1' })).rejects.toMatchObject({ code: ErrorCode.MATCHMAKE_EXPIRED });
  expect(requests.map(request => request.invite)).toEqual(['RetryBad1', 'RetryBad1', 'RetryBad1']);
});

it('does not treat a locked room as a vanished room or retry it', async () => {
  const value = session(), statuses: SessionStatus[] = []; value.onStatus(status => statuses.push(status));
  await expect(value.connect({ nickname: 'Locked room', roomId: 'Locked_01' })).rejects.toMatchObject({ code: ErrorCode.MATCHMAKE_INVALID_ROOM_ID });
  expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'room-full' });
  expect(requests).toHaveLength(1);
});
