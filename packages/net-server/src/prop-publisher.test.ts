import { expect,it } from 'vitest';
import { packSnapshot,type PropState,type WorldSnapshot } from '@fender/contracts';
import { createPropPublisher } from './prop-publisher.js';
const prop=(entityId='a'):PropState=>({entityId,kind:'barrel',scale:1,position:{x:0,y:.6,z:0},rotation:{x:0,y:0,z:0,w:1},mode:'dynamic',sleeping:false,discontinuityId:0});
function wire(props:PropState[]=[prop()]){return packSnapshot({protocolVersion:1,mapRevision:'map',gameplayRevision:'v4',sessionEpoch:'e',serverTick:0,matchId:'m',phase:'lobby',phaseEndsAtTick:null,vehicles:[],projectiles:[],scores:[],local:null,props} satisfies WorldSnapshot);}
it('sends full first/reset baselines but omits all redundant prop tuples on quiet snapshots',()=>{
 const publisher=createPropPublisher(),packet=wire();expect(publisher.filter(packet).props).toHaveLength(1);
 const quiet=publisher.filter(packet);expect(quiet.propsPatch).toBe(true);expect(quiet).not.toHaveProperty('props');expect(packet.props).toHaveLength(1);
 expect(publisher.filter(packet,true).props).toHaveLength(1);expect(publisher.filter(packet,true).propsPatch).not.toBe(true);
});
it('compares against the last SENT pose so slow motion accumulates into a meaningful change',()=>{
 const publisher=createPropPublisher();publisher.filter(wire());
 for(const x of [.005,.01,.019])expect(publisher.filter(wire([{...prop(),position:{x,y:.6,z:0}}])).props).toBeUndefined();
 expect(publisher.filter(wire([{...prop(),position:{x:.021,y:.6,z:0}}])).props).toHaveLength(1);
 expect(publisher.filter(wire([{...prop(),position:{x:.03,y:.6,z:0}}])).props).toBeUndefined();
});
it('suppresses quaternion noise and sign flips but publishes meaningful rotation and metadata changes',()=>{
 const publisher=createPropPublisher();publisher.filter(wire());
 expect(publisher.filter(wire([{...prop(),rotation:{x:0,y:0,z:0,w:-1}}])).props).toBeUndefined();
 expect(publisher.filter(wire([{...prop(),rotation:{x:0,y:.001,z:0,w:1}}])).props).toBeUndefined();
 expect(publisher.filter(wire([{...prop(),rotation:{x:0,y:.003,z:0,w:1}}])).props).toHaveLength(1);
 for(const patch of [{sleeping:true},{mode:'fixed' as const},{scale:1.1},{discontinuityId:1}]){const p={...prop(),...patch};expect(publisher.filter(wire([p])).props).toHaveLength(1);expect(publisher.filter(wire([p])).props).toBeUndefined();}
});
it('forces a full baseline on roster/match changes and keeps independent per-client caches',()=>{
 const a=createPropPublisher(),b=createPropPublisher();a.filter(wire());expect(b.filter(wire()).propsPatch).not.toBe(true);
 expect(a.filter(wire([prop(),prop('b')])).propsPatch).not.toBe(true);
 const removed=a.filter(wire([]));expect(removed.props).toEqual([]);expect(removed.propsPatch).not.toBe(true);
 expect(a.filter({...wire(),m:'new-match'}).propsPatch).not.toBe(true);
});
