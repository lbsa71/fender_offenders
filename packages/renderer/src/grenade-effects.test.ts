import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Logger} from '@babylonjs/core/Misc/logger';
import type {ParticleSystem} from '@babylonjs/core/Particles/particleSystem';
import type {GrenadeState} from '@fender/contracts';
import {GrenadeEffects,grenadeVisualPose,type GrenadeCue} from './grenade-effects';
const grenade=(id='g'):GrenadeState=>({entityId:id,ownerEntityId:'boss',origin:{x:4,z:-30,yaw:0},target:{x:4,z:-10,yaw:0},bornTick:100,landsAtTick:160,detonatesAtTick:220,blastRadius:6,damage:35});
let engine:NullEngine,scene:Scene,effects:GrenadeEffects;
beforeEach(()=>{engine=new NullEngine();scene=new Scene(engine);effects=new GrenadeEffects(scene);});
afterEach(()=>{effects.dispose();scene.dispose();engine.dispose();});
describe('authority-driven cartoon grenades',()=>{
 it('bursts into soft textured particles that spread, cool and fade into rising smoke',()=>{
  effects.explode('g',grenade().target,6,220);
  const systems=scene.particleSystems.filter(s=>s.name.startsWith('grenade-blast-0-')) as ParticleSystem[];
  expect(systems).toHaveLength(3);
  for(const system of systems){expect(system.particleTexture?.hasAlpha).toBe(true);expect(system.particles.length).toBeGreaterThan(8);}
  const fire=systems.find(s=>s.name.endsWith('-fire'))!,smoke=systems.find(s=>s.name.endsWith('-smoke'))!,embers=systems.find(s=>s.name.endsWith('-embers'))!;
  const start=fire.particles.map(p=>p.position.clone());
  effects.update(0);effects.update(.2);effects.update(.1);
  expect(fire.particles.some((p,i)=>p.position.subtract(start[i]!).length()>1)).toBe(true);
  expect(new Set(fire.particles.map(p=>p.size.toFixed(3))).size).toBeGreaterThan(8);
  expect(embers.particles.some(p=>p.position.y>1)).toBe(true);
  const earlySmoke=smoke.particles.map(p=>({y:p.position.y,size:p.size,alpha:p.color.a}));
  for(let i=0;i<5;i++)effects.update(.2);
  expect(fire.particles.every(p=>p.color.a===0)).toBe(true);
  expect(smoke.particles.some((p,i)=>p.position.y>earlySmoke[i]!.y+1&&p.size>earlySmoke[i]!.size)).toBe(true);
  expect(smoke.particles.reduce((sum,p)=>sum+p.color.a,0)).toBeLessThan(earlySmoke.reduce((sum,p)=>sum+p.alpha,0));
  expect(scene.meshes.filter(m=>m.isEnabled()&&m.isVisible&&m.name.startsWith('grenade-blast-'))).toHaveLength(0);
 });
 it('reuses particle systems and textures across blast saturation and releases them on disposal',()=>{
  const resources={systems:scene.particleSystems.length,textures:scene.textures.length,meshes:scene.meshes.length};
  expect(resources.systems).toBe(24);
  for(let i=0;i<40;i++)effects.explode('burst-'+i,{x:i,z:0,yaw:0},6,220);
  expect(scene.particleSystems.reduce((sum,s)=>sum+s.getActiveCount(),0)).toBeLessThanOrEqual(640);
  expect({systems:scene.particleSystems.length,textures:scene.textures.length,meshes:scene.meshes.length}).toEqual(resources);
  effects.reset();expect(scene.particleSystems.every(s=>s.getActiveCount()===0)).toBe(true);
  effects.dispose();expect(scene.particleSystems).toHaveLength(0);expect(scene.textures).toHaveLength(0);
 });
 it('lobs from authority origin to one fixed landing point and settles without changing inputs',()=>{
  const g=grenade(),original=JSON.stringify(g),start=grenadeVisualPose(g,100),middle=grenadeVisualPose(g,130),land=grenadeVisualPose(g,160),fuse=grenadeVisualPose(g,210);expect(start).not.toBeNull();expect(start!.x).toBe(4);expect(start!.z).toBe(-30);expect(middle!.y).toBeGreaterThan(5);expect(middle!.z).toBe(-20);expect(land!.z).toBe(-10);expect(land!.landed).toBe(true);expect(fuse!.x).toBe(4);expect(fuse!.z).toBe(-10);expect(fuse!.y).toBeLessThan(.7);expect(JSON.stringify(g)).toBe(original);
 });
 it('uses finite reduced-motion positions without the high lob, tumbling or bouncing',()=>{
  const g=grenade();for(const tick of [0,100,130,160,180,219]){const p=grenadeVisualPose(g,tick,true);expect(p).not.toBeNull();expect(Object.values(p!).every(v=>typeof v!=='number'||Number.isFinite(v))).toBe(true);expect(p!.y).toBeLessThanOrEqual(.7);expect(p!.spin).toBe(0);}expect(grenadeVisualPose({...g,target:{...g.target,x:NaN}},150)).toBeNull();
 });
 it('reconstructs a late-join warning with the actual blast radius and fixed target without an event',()=>{
  effects.render([grenade()],185);expect(effects.getStats().grenades).toBe(1);expect(effects.getStats().grenadeWarnings).toBe(1);const warning=scene.getTransformNodeByName('grenade-warning-0')!;expect(warning.position.asArray()).toEqual([-4,.065,-10]);expect(warning.scaling.x).toBe(6);expect(warning.scaling.z).toBe(6);const body=scene.getTransformNodeByName('grenade-body-0')!;expect(body.position.x).toBe(-4);expect(body.position.z).toBe(-10);effects.render([grenade()],219);expect(warning.scaling.x).toBe(6);
 });
 it('clears warning at detonation and refuses stale snapshot resurrection after an early event',()=>{
  const g=grenade();effects.render([g],180);expect(effects.explode('g',g.target,6,220)).toBe(true);effects.render([g],181);expect(effects.getStats().grenades).toBe(0);expect(effects.getStats().grenadeWarnings).toBe(0);expect(effects.getStats().grenadeBlasts).toBe(1);expect(effects.explode('g',g.target,6,220)).toBe(false);
  effects.reset();effects.render([g],220);expect(effects.getStats().grenades).toBe(0);effects.render([g],180);expect(effects.getStats().grenades).toBe(0);expect(effects.explode('g',g.target,6,220)).toBe(true);
 });
 it('keeps one first-visible blast frame at low FPS then naturally cleans every pooled piece',()=>{
  const g=grenade();effects.explode('g',g.target,6,220);effects.update(.1);expect(effects.getStats().grenadeFireballs).toBeGreaterThan(0);expect(effects.getStats().grenadeSmoke).toBeGreaterThan(0);for(let i=0;i<25;i++)effects.update(.1);expect(effects.getStats().grenadeBlasts).toBe(0);expect(effects.getStats().grenadeSmoke).toBe(0);
 });
 it('deduplicates throw/land/fuse/blast cues and does not replay a late-join throw',()=>{
  const g=grenade(),cues:GrenadeCue[]=[];effects.noteThrow(g);effects.noteThrow(g);effects.render([g],130);effects.drainCues(c=>cues.push(c));expect(cues.filter(c=>c.kind==='lob')).toHaveLength(1);effects.render([g],160);effects.render([g],160);effects.drainCues(c=>cues.push(c));expect(cues.filter(c=>c.kind==='land')).toHaveLength(1);expect(cues.filter(c=>c.kind==='fuse')).toHaveLength(1);effects.explode('g',g.target,6,220);effects.explode('g',g.target,6,220);effects.drainCues(c=>cues.push(c));expect(cues.filter(c=>c.kind==='blast')).toHaveLength(1);
  effects.reset();cues.length=0;effects.render([grenade('late')],185);effects.drainCues(c=>cues.push(c));expect(cues.some(c=>c.kind==='lob'||c.kind==='land')).toBe(false);
 });
 it('bounds repeated grenade/blast traffic to eight slots each without per-update resources',()=>{
  const before={meshes:scene.meshes.length,materials:scene.materials.length};effects.render(Array.from({length:40},(_,i)=>grenade('active'+i)),140);expect(effects.getStats().grenades).toBe(8);expect(effects.getStats().grenadeWarnings).toBe(8);for(let i=0;i<40;i++)effects.explode('blast'+i,{x:i,z:0,yaw:0},6,220);expect(effects.getStats().grenadeBlasts).toBe(8);for(let i=0;i<100;i++){effects.render([grenade('fresh'+i)],140);effects.update(.016);}expect(scene.meshes.length).toBe(before.meshes);expect(scene.materials.length).toBe(before.materials);
 });
 it('reduces flash/motion while preserving the warning and a readable smoke blast',()=>{
  effects.render([grenade()],180,{reducedMotion:true,reducedFlash:true});expect(effects.getStats().grenadeWarnings).toBe(1);effects.explode('g',grenade().target,6,220,{reducedMotion:true,reducedFlash:true});effects.update(.1,{reducedMotion:true,reducedFlash:true});expect(effects.getStats().grenadeFireballs).toBeLessThanOrEqual(3);expect(effects.getStats().grenadeSmoke).toBeGreaterThan(0);expect(effects.getStats().grenadeSparks).toBe(0);
 });
 it('clears absent snapshot warnings, pending cues, retired IDs and all resources on reset/dispose',()=>{
  effects.render([grenade()],120);expect(effects.getStats().grenadeWarnings).toBe(1);effects.render([],121);expect(effects.getStats().grenadeWarnings).toBe(0);effects.explode('g',grenade().target,6,220);effects.reset();expect(effects.getStats().grenadeBlasts).toBe(0);const cues:GrenadeCue[]=[];effects.drainCues(c=>cues.push(c));expect(cues).toHaveLength(0);expect(effects.noteThrow(grenade())).toBe(true);effects.dispose();expect(effects.getStats().grenades).toBe(0);expect(scene.meshes).toHaveLength(0);expect(scene.transformNodes).toHaveLength(0);expect(effects.noteThrow(grenade())).toBe(false);
 });
 it('drops queued flight/fuse cues when the same batch already confirms detonation',()=>{const g=grenade(),cues:GrenadeCue[]=[];effects.noteThrow(g);effects.render([g],180);effects.explode('g',g.target,6,220);effects.drainCues(c=>cues.push(c));expect(cues.map(c=>c.kind)).toEqual(['blast']);});
 it('hides malformed replacement data instead of retaining its previous warning',()=>{const g=grenade();effects.render([g],180);effects.render([{...g,blastRadius:NaN}],181);expect(effects.getStats().grenades).toBe(0);expect(effects.getStats().grenadeWarnings).toBe(0);});
 it('creates pooled resources without unsupported instance-property warnings',()=>{const warning=vi.spyOn(Logger,'Warn').mockImplementation(()=>{});const extra=new GrenadeEffects(scene);try{expect(warning.mock.calls.flat().join(' ')).not.toMatch(/instanced mesh.*no effect/i);}finally{extra.dispose();warning.mockRestore();}});
 it('keeps the bright warning perimeter above its dark outline so the radius is readable',()=>{const ring=scene.getMeshByName('grenade-0-warning-ring')!,outline=scene.getMeshByName('grenade-0-warning-outline')!;expect(ring.position.y+ring.getBoundingInfo().boundingBox.maximum.y).toBeGreaterThan(outline.position.y+outline.getBoundingInfo().boundingBox.maximum.y+.004);});
});
