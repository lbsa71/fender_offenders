import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDb5 } from './validate.mjs';
const fixture=()=>({nodes:[{name:'car',children:[1,2,3,4,5,6]},...['fl','fr','rl','rr'].map((s,i)=>({name:'wheel_'+s,mesh:0,translation:[i%2?1:-1,0,i<2?1:-1]})),{name:'gun_left',mesh:0,children:[7],extras:{optionalEquipment:true}},{name:'gun_right',mesh:0,children:[8],extras:{optionalEquipment:true}},{name:'muzzle_left',translation:[0,0,.1]},{name:'muzzle_right',translation:[0,0,.1]}],meshes:[{primitives:[{indices:0,attributes:{POSITION:1}}]}],accessors:[{count:12},{count:4}],extras:{assetRights:'CC-BY-3.0 with supplied noncommercial fan-art restriction'}});
test('accepts four axle nodes and optional guns with local forward muzzles',()=>assert.deepEqual(validateDb5(fixture(),15000),[]));
test('rejects a car whose rear-right tire cannot detach independently',()=>{const d=fixture();d.nodes[4].name='combined_body';assert.ok(validateDb5(d,15000).some(e=>e.includes('wheel_rr')));});
test('rejects mandatory guns or an accidentally backwards muzzle',()=>{const d=fixture();delete d.nodes[5].extras;d.nodes[8].translation[2]=-.2;const e=validateDb5(d,15000);assert.ok(e.some(e=>e.includes('optionalEquipment')));assert.ok(e.some(e=>e.includes('muzzle_right')));});
test('rejects missing rights notice and excess driving triangles',()=>{const d=fixture();d.extras={};d.accessors[0].count=60000;const e=validateDb5(d,15000);assert.ok(e.some(e=>e.includes('rights')));assert.ok(e.some(e=>e.includes('budget')));});
