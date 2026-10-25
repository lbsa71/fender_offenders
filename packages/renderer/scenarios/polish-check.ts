import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildings, districtMap, DISTRICT_WATER } from '@fender/content';
import { PEDESTRIAN_ROUTES } from '../../content/src/pedestrian-routes';

const output = resolve(process.argv[2] ?? 'work/graphics-polish');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /shader|compile|uniform/i.test(m.text())) errors.push(m.text()); });
  await page.addInitScript('window.__name=(fn)=>fn');
  await page.goto(process.env.RENDER_SCENARIO_URL ?? 'http://127.0.0.1:5184/');
  await page.waitForFunction(() => Boolean((window as any).fixture));
  const water = await page.evaluate(() => (window as any).fixture.gameScene.meshes.filter((m: any) => m.name.startsWith('wet-')).length);
  assert.ok(water >= 6, `authored water must be rendered: found ${water} surfaces`);
  const waterAppearance = await page.evaluate(async () => {
    const f = (window as any).fixture; f.pause();
    f.renderer.setSettings({ quality: 'high', reducedShake: false }); f.renderer.setDispatch('loose-change');
    const scene = f.gameScene, engine = scene.getEngine(), camera = scene.activeCamera;
    const mesh = scene.getMeshByName('wet-park-pond'), sky = scene.clearColor.clone();
    f.frame.cameraTarget = { x: -mesh.position.x, z: mesh.position.z, yaw: 0 };
    for (let i = 0; i < 30; i++) { f.step(.1); await new Promise(r => requestAnimationFrame(r)); }
    const gl = document.querySelector('canvas')!.getContext('webgl2')!, V = camera.position.constructor, M = scene.getTransformMatrix().constructor;
    const sample = () => {
      const pixels: number[] = [];
      for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) {
        const position = mesh.position.add(new V(x * .65, 0, z * .5));
        const p = V.Project(position, M.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
        const pixel = new Uint8Array(4); gl.readPixels(Math.round(p.x), gl.drawingBufferHeight - Math.round(p.y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        pixels.push(...pixel.slice(0, 3));
      }
      return pixels;
    };
    const difference = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]!), 0) / a.length;
    f.step(0); const start = sample();
    scene.clearColor.set(.8, .2, .1, 1); f.step(0); const warmSky = sample();
    scene.clearColor.set(.1, .35, .8, 1); f.step(0); const coolSky = sample();
    scene.clearColor.copyFrom(sky); f.step(0);
    for (let i = 0; i < 20; i++) f.step(.1);
    const moving = sample(), luminance = [];
    for (let i = 0; i < start.length; i += 3) luminance.push(start[i]! * .2126 + start[i + 1]! * .7152 + start[i + 2]! * .0722);
    f.renderer.setSettings({ reducedShake: true }); f.step(0); const frozen = sample();
    for (let i = 0; i < 20; i++) f.step(.1);
    const reducedDifference = difference(frozen, sample());
    f.renderer.setSettings({ quality: 'low', reducedShake: false }); f.step(0); const low = sample();
    for (let i = 0; i < 20; i++) f.step(.1);
    const lowDifference = difference(low, sample());
    f.renderer.setSettings({ quality: 'high', reducedShake: false }); f.step(0);
    return { skyDifference: difference(warmSky, coolSky), contrast: Math.max(...luminance) - Math.min(...luminance), motionDifference: difference(start, moving), reducedDifference, lowDifference };
  });
  await writeFile(join(output, 'water-appearance.json'), JSON.stringify(waterAppearance, null, 2));
  await page.screenshot({ path: join(output, 'water-appearance.png') });
  assert.ok(waterAppearance.skyDifference > 6, `water must visibly reflect the sky palette: ${JSON.stringify(waterAppearance)}`);
  assert.ok(waterAppearance.contrast > 8, 'broad water highlights must be visible at gameplay distance');
  assert.ok(waterAppearance.motionDifference > .8, 'broad ripples must visibly move across the water');
  assert.equal(waterAppearance.reducedDifference, 0, 'reduced motion freezes visible water ripples');
  assert.equal(waterAppearance.lowDifference, 0, 'low quality retains a static water finish');
  const probes = await page.evaluate(async () => {
    const f = (window as any).fixture; f.pause(); f.renderer.setSettings({ reducedFlash: true, reducedShake: true });
    const scene = f.gameScene, engine = scene.getEngine(), camera = scene.activeCamera;
    const gl = document.querySelector('canvas')!.getContext('webgl2')!, V = camera.position.constructor, M = scene.getTransformMatrix().constructor;
    const result = [];
    for (const mesh of scene.meshes.filter((m: any) => m.name.startsWith('wet-'))) {
      f.frame.cameraTarget = { x: -mesh.position.x, z: mesh.position.z, yaw: 0 };
      for (let i = 0; i < 25; i++) { f.step(.1); await new Promise(r => requestAnimationFrame(r)); }
      const projected = V.Project(mesh.position, M.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
      const sample = () => { const pixels = new Uint8Array(5 * 5 * 4); gl.readPixels(Math.round(projected.x) - 2, gl.drawingBufferHeight - Math.round(projected.y) - 3, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return [...pixels]; };
      mesh.isVisible = true; f.step(0); const wet = sample();
      mesh.isVisible = false; f.step(0); const dry = sample(); mesh.isVisible = true; f.step(0);
      result.push({ id: mesh.name, difference: wet.reduce((sum, value, i) => sum + Math.abs(value - dry[i]!), 0) / wet.length });
    }
    return result;
  });
  assert.ok(probes.every(p => p.difference > 2), `water must change actual visible pixels at gameplay distance: ${JSON.stringify(probes)}`);
  const lightDetail = await page.evaluate(() => {
    const f = (window as any).fixture; f.frame.props = structuredClone(f.authoredProps);
    f.frame.cameraTarget = { x: 4, z: -40, yaw: 0 };
    f.renderer.setSettings({ quality: 'high', reducedFlash: false });
    f.renderer.setDispatch('loose-change'); f.step(0);
    const windowMaterial = f.gameScene.getMaterialByName('#4f7e87false');
    const noonEmission = windowMaterial.emissiveColor.r;
    f.renderer.setDispatch('green-light'); for (let i = 0; i < 30; i++) f.step(.1);
    return { noonEmission, nightEmission: windowMaterial.emissiveColor.r,
      headlights: f.gameScene.lights.filter((l: any) => l.name.startsWith('car-headlight-') && l.intensity > 0).length,
      glints: f.gameScene.meshes.filter((m: any) => m.name.startsWith('source-glint-') && m.isVisible).length };
  });
  const missingDetail = [];
  if (lightDetail.nightEmission <= lightDetail.noonEmission + .1) missingDetail.push('night windows do not emit warm light');
  if (lightDetail.headlights < 1 || lightDetail.headlights > 2) missingDetail.push(`headlight budget is ${lightDetail.headlights}, expected 1–2`);
  if (lightDetail.glints < 1 || lightDetail.glints > 8) missingDetail.push(`source glint count is ${lightDetail.glints}, expected 1–8`);
  assert.deepEqual(missingDetail, [], JSON.stringify(lightDetail));
  const surfaces = await page.evaluate(() => {
    const scene = (window as any).fixture.gameScene;
    return ['#4d6268false', '#bd9b6ffalse', '#c8c6acfalse'].map(name => { const m = scene.getMaterialByName(name); return { name, power: m.specularPower, reflectance: m.specularColor.r }; });
  });
  assert.ok(surfaces[0]!.reflectance > surfaces[1]!.reflectance && surfaces[2]!.power > surfaces[1]!.power, `road, dirt and curb must have distinct restrained surface responses: ${JSON.stringify(surfaces)}`);
  const contacts = await page.evaluate(() => (window as any).fixture.gameScene.meshes.filter((m: any) => m.name.startsWith('vehicle-contact-') && m.isVisible).length);
  assert.ok(contacts >= 2 && contacts <= 32, `contact shading must anchor the actual cars: ${contacts}`);
  const captures = [];
  for (const [theme, dispatch] of [['noon', 'loose-change'], ['dusk', 'express-distress'], ['night', 'green-light']]) {
    for (const site of DISTRICT_WATER.filter(s => s.kind !== 'puddle')) {
      await page.evaluate(async ({ dispatch, site }) => {
        const f = (window as any).fixture; f.renderer.setDispatch(dispatch); f.frame.cameraTarget = { x: site.x, z: site.z, yaw: 0 };
        for (let i = 0; i < 25; i++) { f.step(.1); await new Promise(r => requestAnimationFrame(r)); }
      }, { dispatch: dispatch!, site });
      await page.screenshot({ path: join(output, `${theme}-${site.kind}-wet.png`) });
      await page.evaluate(() => { const f = (window as any).fixture; for (const m of f.gameScene.meshes.filter((m: any) => m.name.startsWith('wet-') || m.name.startsWith('shallow-border-'))) m.isVisible = false; f.step(0); });
      await page.screenshot({ path: join(output, `${theme}-${site.kind}-dry.png`) });
      await page.evaluate(() => { const f = (window as any).fixture; for (const m of f.gameScene.meshes.filter((m: any) => m.name.startsWith('wet-') || m.name.startsWith('shallow-border-'))) m.isVisible = true; f.step(0); });
      captures.push({ theme, site: site.id });
    }
  }
  const accessibility = await page.evaluate(() => {
    const f = (window as any).fixture; f.renderer.setSettings({ quality: 'high', reducedShake: true, reducedFlash: true }); f.step(.1);
    const start = f.renderer.getStats(); for (let i = 0; i < 10; i++) f.step(.1); const reduced = f.renderer.getStats();
    f.renderer.setSettings({ reducedShake: false, reducedFlash: false, quality: 'low' }); f.step(.1); const low = f.renderer.getStats();
    f.renderer.setSettings({ quality: 'medium' }); f.step(.1); const medium = f.renderer.getStats();
    f.renderer.setSettings({ quality: 'high' }); f.step(.1);
    return { start, reduced, low, medium };
  });
  assert.equal(accessibility.reduced.waterTime, accessibility.start.waterTime, 'reduced motion freezes water');
  assert.equal(accessibility.reduced.sourceGlints, 0, 'reduced flash removes source halos');
  assert.equal(accessibility.low.headlightLights, 0); assert.equal(accessibility.low.sourceGlints, 0); assert.equal(accessibility.low.waterRipples, false);
  assert.ok(accessibility.medium.headlightLights <= 1); assert.equal(accessibility.low.environmentLights, accessibility.medium.environmentLights);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const media = await page.evaluate(() => { const f = (window as any).fixture, before = f.renderer.getStats().waterTime; f.step(.1); return { before, after: f.renderer.getStats().waterTime }; });
  assert.equal(media.after, media.before, 'OS reduced-motion preference freezes decorative water too');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const occlusion = await page.evaluate(() => {
    const f = (window as any).fixture, backup = structuredClone(f.frame);
    f.frame.vehicles = []; f.frame.cameraTarget = { x: 4, z: -40, yaw: 0 };
    const lamp = { ...f.authoredProps.find((p: any) => p.kind === 'lamp'), entityId: 'occlusion-lamp', rotation: { x: 0, y: 0, z: 0, w: 1 }, position: { x: 27.4, y: 2.5, z: -20 } };
    f.frame.props = [lamp]; for (let i = 0; i < 30; i++) f.step(.1); const hidden = f.renderer.getStats().sourceGlints;
    lamp.position = { x: 7.4, y: 2.5, z: -35 }; f.step(0); const clear = f.renderer.getStats().sourceGlints;
    f.gameScene.activeCamera.setTarget(new f.gameScene.activeCamera.position.constructor(4, 43, -140)); f.gameScene.render();
    f.frame.props = []; f.step(0); const removed = f.renderer.getStats().sourceGlints;
    Object.assign(f.frame, backup); f.step(0); return { hidden, clear, removed };
  });
  assert.equal(occlusion.hidden, 0, 'a source behind the precinct cannot leak a halo'); assert.equal(occlusion.clear, 1); assert.equal(occlusion.removed, 0);
  // Reproduce former finish settings at the same camera, then restore the shipped materials.
  await page.evaluate(() => { const f = (window as any).fixture; f.renderer.setDispatch('express-distress'); f.frame.cameraTarget = { x: 4, z: -40, yaw: 0 }; for (let i = 0; i < 30; i++) f.step(.1); });
  await page.screenshot({ path: join(output, 'surface-after.png') });
  await page.evaluate(() => {
    const f = (window as any).fixture; f.finishBackup = [];
    for (const m of f.gameScene.materials) {
      if (m.name.startsWith('paint-') || m.name === 'glass') { f.finishBackup.push({ m, roughness: m.roughness, metallic: m.metallic, coat: m.clearCoat.isEnabled }); m.roughness = .28; m.metallic = m.name === 'glass' ? .65 : .4; m.clearCoat.isEnabled = true; }
    }
    f.contactBackup = f.gameScene.meshes.filter((m: any) => m.name.startsWith('vehicle-contact-') && m.isVisible);
    for (const m of f.contactBackup) m.isVisible = false; f.gameScene.render();
  });
  await page.screenshot({ path: join(output, 'surface-before.png') });
  await page.evaluate(() => { const f = (window as any).fixture; for (const b of f.finishBackup) { b.m.roughness = b.roughness; b.m.metallic = b.metallic; b.m.clearCoat.isEnabled = b.coat; } f.step(0); });
  const motion = [];
  for (let i = 0; i < 4; i++) {
    motion.push(await page.evaluate(() => { const f = (window as any).fixture; f.frame.cameraTarget.x += 1; f.step(.1); return f.renderer.getStats(); }));
    await page.screenshot({ path: join(output, `camera-motion-${i}.png`) });
  }
  const lifecycle = await page.evaluate(() => {
    const f = (window as any).fixture, counts = () => f.gameScene.getEngine().scenes.map((s: any) => [s.meshes.length, s.materials.length, s.lights.length, s.textures.length]);
    f.renderer.setGaragePreview('patrol'); f.step(0); f.renderer.setGaragePreview(null); f.step(0); const before = counts(), cycles = [];
    for (let i = 0; i < 10; i++) {
      f.renderer.setDispatch('green-light'); f.step(0); f.renderer.setGaragePreview('patrol'); f.step(0);
      const garage = f.renderer.getStats(); if (garage.headlightLights || garage.sourceGlints || garage.contactPatches) throw Error('garage retained district lighting/contact effects');
      f.renderer.setGaragePreview(null); f.renderer.setDispatch(null); f.step(0); cycles.push(counts());
    }
    const after = counts(); f.renderer.dispose(); return { before, after, cycles, disposed: f.gameScene.isDisposed, remainingMeshes: f.gameScene.meshes.length };
  });
  assert.deepEqual(lifecycle.before, lifecycle.after); assert.ok(lifecycle.cycles.every(c => JSON.stringify(c) === JSON.stringify(lifecycle.before)));
  assert.equal(lifecycle.disposed, true); assert.equal(lifecycle.remainingMeshes, 0);
  assert.deepEqual(errors, []);
  const rect = (x: number, z: number, w: number, d: number, fill: string) => `<rect x="${x - w / 2}" y="${z - d / 2}" width="${w}" height="${d}" fill="${fill}"/>`;
  const map = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-135 -145 270 290"><rect x="-135" y="-145" width="270" height="290" fill="#e9e8dc"/><text x="-125" y="-133" font-size="5">Water / buildings / spawn clearance / walking and shortcut routes</text>${buildings.map(b => rect(b.x, b.z, b.width, b.depth, '#828b86')).join('')}${districtMap.surfaces.filter(s => s.surface === 'dirt').map(s => `<polygon points="${s.polygonXZ.join(' ')}" fill="#c9a575"/>`).join('')}${PEDESTRIAN_ROUTES.map(r => `<polygon points="${r.points.map(p => `${p.x},${p.z}`).join(' ')}" fill="none" stroke="#588d66" stroke-width=".6"/>`).join('')}${districtMap.spawns.map(s => `<circle cx="${s.pose.x}" cy="${s.pose.z}" r="${s.clearanceRadius}" fill="none" stroke="#c96a3e" stroke-width=".7"/>`).join('')}${DISTRICT_WATER.map(s => rect(s.x, s.z, s.width, s.depth, '#287d9d')).join('')}</svg>`;
  await writeFile(join(output, 'water-map.svg'), map);
  await writeFile(join(output, 'evidence.json'), JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: true, browser: browser.version(), viewport: { width: 1440, height: 900 }, water, waterAppearance, probes, lightDetail, surfaces, contacts, captures, accessibility, media, occlusion, motion, lifecycle, errors }, null, 2));
  console.log(JSON.stringify({ output, probes, lightDetail, occlusion, resources: lifecycle.before, errors }));
} finally { await browser.close(); }
