import { expect, it } from 'vitest';
import { helicopterPoseAt, type HelicopterState } from './helicopter';
import { packSnapshot, unpackSnapshot } from './wire';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, type WorldSnapshot } from './index';
const helicopter:HelicopterState={entityId:'air-5',dispatchIndex:4,phase:'attack',health:60,from:{x:0,z:10},to:{x:20,z:10},yaw:Math.PI/2,startedAtTick:100,endsAtTick:200};
it('evaluates the same bounded authoritative flight trajectory at any presentation tick',()=>{
 expect(helicopterPoseAt(helicopter,150)).toEqual({x:10,z:10,yaw:Math.PI/2});
 expect(helicopterPoseAt(helicopter,0).x).toBe(0);expect(helicopterPoseAt(helicopter,999).x).toBe(20);
});
it('roundtrips flight, damage, terminal downed state and elevated bomb origins for late joiners',()=>{
 const state:WorldSnapshot={protocolVersion:PROTOCOL_VERSION,mapRevision:'map',gameplayRevision:GAMEPLAY_REVISION,sessionEpoch:'e',serverTick:150,matchId:'m',phase:'playing',phaseEndsAtTick:1000,vehicles:[],projectiles:[],scores:[],local:null,helicopter,
 grenades:[{entityId:'air-bomb',ownerEntityId:'air-5',origin:{x:4,z:10,yaw:0},originHeight:18,target:{x:8,z:10,yaw:0},bornTick:100,landsAtTick:124,detonatesAtTick:148,blastRadius:5,damage:24}]};
 expect(unpackSnapshot(packSnapshot(state)).helicopter).toEqual(helicopter);
 expect(unpackSnapshot(packSnapshot(state)).grenades![0]!.originHeight).toBe(18);
 state.helicopter={...helicopter,health:0,phase:'downed'};expect(unpackSnapshot(packSnapshot(state)).helicopter?.phase).toBe('downed');
 delete state.helicopter;expect(unpackSnapshot(packSnapshot(state)).helicopter).toBeUndefined();
});
