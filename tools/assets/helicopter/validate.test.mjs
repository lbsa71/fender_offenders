import assert from 'node:assert/strict';
import test from 'node:test';
import { validateHelicopter } from './validate.mjs';
const fixture = () => ({
  asset: { version: '2.0' },
  nodes: [{name:'helicopter',children:[1,2,3]}, {name:'cabin',mesh:0}, {name:'rotor_main',mesh:0}, {name:'rotor_tail',mesh:0}],
  meshes: [{primitives:[{indices:0,attributes:{POSITION:1}}]}],
  accessors: [{count:12,componentType:5123,type:'SCALAR'},{count:4,componentType:5126,type:'VEC3',min:[-1,-1,-1],max:[1,1,1]}],
  animations: [{channels:[{target:{node:2,path:'rotation'}},{target:{node:3,path:'rotation'}}]}],
  materials: [{name:'charcoal'}],
});
test('accepts separate named rotor meshes with rotation channels',()=>assert.deepEqual(validateHelicopter(fixture()),[]));
test('rejects a visually intact export without an independently animated main rotor',()=>{
 const d=fixture(); d.nodes[2].name='merged_body';
 assert.ok(validateHelicopter(d).some(e=>e.includes('rotor_main')));
});
test('rejects mirrored export transforms and an oversized triangle budget',()=>{
 const d=fixture(); d.nodes[1].scale=[-1,1,1]; d.accessors[0].count=18000;
 const errors=validateHelicopter(d);
 assert.ok(errors.some(e=>e.includes('negative scale')));
 assert.ok(errors.some(e=>e.includes('triangle budget')));
});
test('rejects an animation channel that moves the body instead of spinning the tail',()=>{
 const d=fixture(); d.animations[0].channels[1].target={node:1,path:'translation'};
 assert.ok(validateHelicopter(d).some(e=>e.includes('rotor_tail rotation')));
});
