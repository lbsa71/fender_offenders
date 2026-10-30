import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader.js';
const rendererRequire=createRequire(new URL('../../../packages/renderer/package.json',import.meta.url));
await import(pathToFileURL(rendererRequire.resolve('@babylonjs/loaders/glTF/2.0/glTFLoader.js')).href);
await import(pathToFileURL(rendererRequire.resolve('@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_clearcoat.js')).href);

for(const lod of ['briefing','driving','distant'])test(`${lod} imports PBR materials and semantic parts through the real Babylon loader`,async()=>{
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  try {
    const asset=await LoadAssetContainerAsync(new Uint8Array(readFileSync(`packages/content/runtime/models/bubble/bubble-${lod}.glb`)),scene,{pluginExtension:'.glb',name:`bubble-${lod}.glb`});
    asset.addAllToScene();
    const node=(name)=>[...asset.meshes,...asset.transformNodes].find(n=>n.name===name);
    const metadata=JSON.parse(readFileSync('packages/content/runtime/models/bubble/components.json'));
    for(const component of metadata.lods[lod].components){const n=node(component.name);assert.ok(n,component.name);n.computeWorldMatrix(true);n.getAbsolutePosition().asArray().forEach((v,i)=>assert.ok(Math.abs(v-component.pivot[i])<1e-6,component.name));}
    for(const side of ['left','right']){const muzzle=node(`muzzle_${side}`);muzzle.computeWorldMatrix(true);assert.equal(muzzle.parent.name,`gun_${side}`);assert.ok(Math.abs(muzzle.getAbsolutePosition().z-1.30)<1e-6);}
    assert.equal(asset.materials.length,7);
    assert.ok(asset.materials.find(m=>m.name==='mint_enamel').clearCoat.isEnabled);
    assert.ok(asset.meshes.filter(m=>m.getTotalVertices()>0).every(m=>m.material),'all imported geometry has a material');
    asset.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.transformNodes.length,0);assert.equal(scene.materials.length,0);
  } finally {scene.dispose();engine.dispose();}
});
