import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateBubble} from './validate.mjs';

function fixture() {
  const nodes=[{name:'car',children:[]}];
  for(const [name,x,z] of [['wheel_fl',-.67,.75],['wheel_fr',.67,.75],['wheel_rl',-.67,-.75],['wheel_rr',.67,-.75]]) {
    nodes[0].children.push(nodes.length);nodes.push({name,mesh:0,translation:[x,0,z]});
  }
  for(const [side,x] of [['left',-.35],['right',.35]]) {
    const i=nodes.length;nodes[0].children.push(i);
    nodes.push({name:`gun_${side}`,mesh:1,translation:[x,.7,.3],extras:{optionalEquipment:true},children:[i+1]});
    nodes.push({name:`muzzle_${side}`,translation:[0,0,.22]});
  }
  return {nodes,scenes:[{nodes:[0],extras:{assetRights:'Original Fender Offenders; GPL-3.0-or-later'}}],scene:0,meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]},{primitives:[{attributes:{POSITION:2},indices:1}]}],accessors:[{count:3,min:[-.2,-.2,-.2],max:[.2,.2,.2]},{count:3},{count:3,min:[-.12,-.12,0],max:[.12,.12,1]}],materials:[{}]};
}
const limits={triangles:100,primitives:10};
test('accepts separate wheels and optional forward-facing equipment',()=>assert.deepEqual(validateBubble(fixture(),limits),[]));
test('rejects a merged or misplaced wheel that cannot steer at its axle',()=>{
  const d=fixture();delete d.nodes[1].mesh;d.nodes[2].translation[0]=-.67;
  assert.match(validateBubble(d,limits).join(' '),/wheel_fl/);
  assert.match(validateBubble(d,limits).join(' '),/wheel_fr/);
});
test('rejects transformed car root, mandatory guns and backwards muzzles',()=>{
  const d=fixture();d.nodes[0].scale=[2,2,2];d.nodes[5].extras.optionalEquipment=false;d.nodes[6].translation[2]=-.22;
  const errors=validateBubble(d,limits).join(' ');
  assert.match(errors,/root/);assert.match(errors,/optional/);assert.match(errors,/muzzle_left/);
});
test('rejects missing provenance and rendering budgets',()=>{
  const d=fixture();delete d.scenes[0].extras;d.accessors[1].count=600;
  const errors=validateBubble(d,{triangles:100,primitives:0}).join(' ');
  assert.match(errors,/rights/);assert.match(errors,/triangle/);assert.match(errors,/primitive/);
});
test('rejects external images or buffers so the model remains self contained',()=>{
  const d=fixture();d.buffers=[{uri:'outside.bin'}];d.images=[{uri:'missing.png'}];
  assert.match(validateBubble(d,limits).join(' '),/external/);
});

test('rejects an ordinary short barrel where oversized equipment is promised',()=>{
 const d=fixture();d.accessors[2].max=[.05,.05,.25];d.accessors[2].min=[-.05,-.05,0];
 assert.match(validateBubble(d,limits).join(' '),/oversized/);
});
test('rejects a stretched sedan instead of a tiny bubble car',()=>{
 const d=fixture();d.nodes[1].translation[2]=2.5;
 assert.match(validateBubble(d,limits).join(' '),/tiny/);
});
