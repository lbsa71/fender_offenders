import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: chrome }) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [], warnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().includes('on an instanced mesh has no effect')) warnings.push(message.text()); });
  await page.addInitScript('window.__name=(fn)=>fn');
  await page.goto('http://127.0.0.1:5184');
  await page.waitForFunction(() => !!(window as any).fixture?.gameScene.getTransformNodeByName('body-hero'));
  const roles = await page.evaluate(() => {
    const f = (window as any).fixture;
    f.pause();
    const hero = f.frame.vehicles[0];
    hero.protectedUntilTick = 0;
    const civilian = { ...hero, entityId: 'bystander', playerId: null, bodyAssetId: 'traffic-sedan', pose: { x: 12, z: -38, yaw: 0 } };
    const villain = { ...hero, entityId: 'villain', playerId: null, bodyAssetId: 'ambulance', pose: { x: -4, z: -38, yaw: 0 } };
    f.frame.vehicles = [hero, civilian, villain];
    f.frame.pursuit = { state: 'chasing', suspectId: 'villain', progress: 0, elapsedTicks: 0 };
    f.step();
    const tips = (id: string) => {
      let count = 0;
      const car = f.gameScene.getTransformNodeByName(`vehicle-${id}`);
      for (const mesh of car.getChildMeshes()) {
        if (!mesh.isVisible || !mesh.sourceMesh?.metadata?.role) continue;
        const vertices = mesh.sourceMesh.getVerticesData('position') ?? [];
        for (let i = 0; i < vertices.length; i += 3) {
          if (Math.abs(vertices[i]) > .56 && Math.abs(vertices[i]) < .70 && vertices[i + 1] > 1.10 && vertices[i + 1] < 1.24 && vertices[i + 2] > 2.4) count++;
        }
      }
      return count;
    };
    const result = { player: tips('hero'), civilian: tips('bystander'), villain: tips('villain'), targetPaint: f.gameScene.getTransformNodeByName('vehicle-villain').getChildMeshes().some((m: any) => m.isVisible && m.material?.name === 'paint-ambulance') };
    // Campaign guidance disappears in results; the villain must keep its body and weapons.
    delete f.frame.pursuit;
    f.step();
    return { ...result, villainOutsidePlay: tips('villain') };
  });
  assert.equal(roles.civilian, 0, 'civilian spectator cars must not display gun barrels');
  assert.ok(roles.player > 0, 'player cars retain their physical guns');
  assert.ok(roles.villain > 0, 'AI villains retain their physical guns');
  assert.ok(roles.targetPaint, 'villains display their assigned body instead of a civilian replacement');
  assert.ok(roles.villainOutsidePlay > 0, 'target classification survives missing pursuit guidance');
  await page.waitForFunction(() => (window as any).fixture.renderer.getStats().wreckPhysicsReady);
  const breakup = await page.evaluate(() => {
    const f = (window as any).fixture;
    const target = f.frame.vehicles.find((v: any) => v.entityId === 'villain');
    const expected = f.gameScene.meshes.filter((m: any) => m.name.startsWith('assembly-ambulance:armed-') && m.metadata?.componentId).length;
    f.renderer.present([{ kind: 'wreck', matchId: 'breakup-proof', eventId: 'target-breakup', serverTick: 600, payload: { vehicleId: target.entityId, creditedPlayerId: null, position: { ...target.pose }, bodyAssetId: target.bodyAssetId, discontinuityId: target.discontinuityId } }]);
    target.status = 'wrecked'; target.health = 0; f.step(1 / 60);
    return { expected, stats: f.renderer.getStats(), componentNames: f.gameScene.meshes.filter((m: any) => m.metadata?.wreckComponent && m.isVisible && m.isEnabled()).map((m: any) => m.metadata.componentName) };
  });
  assert.ok(breakup.expected > 40, 'native target assembly is available');
  assert.equal(breakup.stats.wreckBodies, breakup.expected, 'renderer must share the actual cached target assembly without duplicate source geometry');
  assert.equal(breakup.stats.wreckPieces, breakup.expected, 'every native component becomes a visible rigid fragment');
  assert.ok(breakup.componentNames.includes('medical-box') && breakup.componentNames.filter((name: string) => name === 'gun').length === 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  console.log(JSON.stringify({ roles, breakup }));
} finally {
  await browser.close();
}
