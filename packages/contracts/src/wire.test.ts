import {describe,it,expect} from 'vitest';
import {packSnapshot,unpackSnapshot,type WorldSnapshot} from './index';
const snapshot:WorldSnapshot={protocolVersion:1,mapRevision:'map',gameplayRevision:'rules',sessionEpoch:'epoch',serverTick:0,matchId:'match',phase:'lobby',phaseEndsAtTick:null,vehicles:[],projectiles:[],scores:[{playerId:'a',nickname:'Alpha',score:0,wrecks:0,connection:'connected'}],local:null};
describe('scoreboard latency wire compatibility',()=>{
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
