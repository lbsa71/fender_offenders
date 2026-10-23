import { expect,it } from 'vitest';
import * as content from './index.js';
it('authors bounded stable props for all existing trees and street furniture plus loose objects',()=>{
 expect(content).toHaveProperty('districtProps',expect.any(Array));
 const props=Reflect.get(content,'districtProps') as {entityId:string;kind:string;position:{x:number;y:number;z:number}}[];
 expect(props.length).toBeLessThanOrEqual(192);expect(new Set(props.map(p=>p.entityId)).size).toBe(props.length);
 expect(props.filter(p=>p.kind==='tree')).toHaveLength(content.trees.length);
 for(const kind of ['barrel','crate','bin','lamp','sign','tree','bench'])expect(props.some(p=>p.kind===kind)).toBe(true);
 expect(props.filter(p=>p.kind==='lamp')).toHaveLength(30);expect(props.filter(p=>p.kind==='bench')).toHaveLength(30);expect(props.filter(p=>p.kind==='bin')).toHaveLength(30);
 expect(props.every(p=>Object.values(p.position).every(Number.isFinite))).toBe(true);
});
