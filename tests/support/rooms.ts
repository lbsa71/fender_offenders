import { roomRegistry } from '@fender/net-server';

/** Tests own their servers. Empty rooms now survive ordinary client leaves. */
export async function disposeTestRooms() {
  await Promise.all([...roomRegistry.registered, ...roomRegistry.creating].map(room => room.disconnect()));
}
