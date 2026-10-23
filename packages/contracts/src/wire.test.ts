import {describe,it,expect} from 'vitest';
import {packSnapshot,unpackSnapshot,type WorldSnapshot} from './index';
const snapshot:WorldSnapshot={protocolVersion:1,mapRevision:'map',gameplayRevision:'rules',sessionEpoch:'epoch',serverTick:0,matchId:'match',phase:'lobby',phaseEndsAtTick:null,vehicles:[],projectiles:[],scores:[{playerId:'a',nickname:'Alpha',score:0,wrecks:0,connection:'connected'}],local:null};
describe('scoreboard latency wire compatibility',()=>{
  it('roundtrips complete authoritative prop poses and defaults legacy packets to no props',()=>{
    const props=[{entityId:'barrel-1',kind:'barrel',scale:1,position:{x:1.125,y:2.5,z:-3.25},rotation:{x:0,y:0.6,z:0,w:0.8},mode:'dynamic',sleeping:false,discontinuityId:2}];
    expect(unpackSnapshot(packSnapshot({...snapshot,props} as WorldSnapshot))).toMatchObject({props});
    expect(unpackSnapshot(packSnapshot(snapshot))).toHaveProperty('props',[]);
  });
  it('merges sparse prop patches, retains quiet patches, and explicitly replaces full baselines',()=>{
    const prop={entityId:'a',kind:'barrel' as const,scale:1,position:{x:0,y:.6,z:0},rotation:{x:0,y:0,z:0,w:1},mode:'dynamic' as const,sleeping:false,discontinuityId:0};
    const baseline=packSnapshot({...snapshot,props:[prop,{...prop,entityId:'b'}]});
    const previous=unpackSnapshot(baseline).props!;
    const patch={...packSnapshot({...snapshot,props:[{...prop,position:{x:2,y:.6,z:0}}]}),propsPatch:true};
    const merged=unpackSnapshot(patch,previous).props!;
    expect(merged).toHaveLength(2);expect(merged[0]!.position.x).toBe(2);expect(merged[1]).toEqual(previous[1]);expect(previous[0]!.position.x).toBe(0);
    const quiet={...baseline,props:undefined,propsPatch:true};expect(unpackSnapshot(quiet,merged).props).toEqual(merged);
    expect(unpackSnapshot({...baseline,props:[]},merged).props).toEqual([]);
  });
  it('preserves per-car maximum health and accepts older vehicle tuples',()=>{
    const car={entityId:'army-car',playerId:'a',bodyAssetId:'army',pose:{x:0,z:0,yaw:0},velocity:{x:0,z:0,yawRate:0},health:95,maxHealth:130,status:'active' as const,protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0};
    const wire=packSnapshot({...snapshot,vehicles:[car]});
    expect(unpackSnapshot(wire).vehicles[0]!.maxHealth).toBe(130);
    wire.cars[0]!.splice(15);
    expect(unpackSnapshot(wire).vehicles[0]!.maxHealth).toBe(100);
  });
  it('defaults an older score row without latency to unavailable',()=>{
    const legacyWire=packSnapshot(snapshot);delete legacyWire.scores[0]!.pingMs;
    expect(unpackSnapshot(legacyWire).scores[0]!.pingMs).toBeNull();
  });
  it('roundtrips known latency without changing the original score row',()=>{
    const source={...snapshot,scores:[{...snapshot.scores[0]!,pingMs:137}]};
    expect((unpackSnapshot(packSnapshot(source)).scores[0] as unknown as {pingMs:number|null}).pingMs).toBe(137);
    expect(snapshot.scores[0]).not.toHaveProperty('pingMs');
  });
});
