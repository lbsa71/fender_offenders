import {describe,it,expect} from 'vitest';
import {packSnapshot,unpackSnapshot,type WorldSnapshot} from './index';
const snapshot:WorldSnapshot={protocolVersion:1,mapRevision:'map',gameplayRevision:'rules',sessionEpoch:'epoch',serverTick:0,matchId:'match',phase:'lobby',phaseEndsAtTick:null,vehicles:[],projectiles:[],scores:[{playerId:'a',nickname:'Alpha',score:0,wrecks:0,connection:'connected'}],local:null};
describe('scoreboard latency wire compatibility',()=>{
  it('retains smog exposure timing for each affected car through wire reconstruction',()=>{
    const cloud={entityId:'smog-1',ownerEntityId:'boss',kind:'smog',pose:{x:3,z:-8,yaw:0},bornTick:10,activeAtTick:70,expiresTick:460,exposures:[{vehicleId:'unit',bornTick:90,expiresTick:300}]};
    const source={...snapshot,gadgets:[cloud]} as unknown as WorldSnapshot;
    expect(unpackSnapshot(packSnapshot(source)).gadgets).toEqual([cloud]);
    expect(cloud.exposures).toEqual([{vehicleId:'unit',bornTick:90,expiresTick:300}]);
  });
  it('reconstructs fixed oil warnings and hubcap timing for peers and late joins',()=>{
    const gadgets=[{entityId:'oil-1',ownerEntityId:'boss',kind:'oil' as const,pose:{x:3.125,z:-8.5,yaw:.25},bornTick:10,activeAtTick:55,expiresTick:355},{entityId:'blades-1',ownerEntityId:'boss-2',kind:'blades' as const,pose:{x:-4,z:8,yaw:0},bornTick:20,activeAtTick:80,expiresTick:170}];
    const source={...snapshot,gadgets};expect(unpackSnapshot(packSnapshot(source))).toHaveProperty('gadgets',gadgets);
    expect(unpackSnapshot(packSnapshot(snapshot))).toHaveProperty('gadgets',[]);expect(source.gadgets).toEqual(gadgets);
  });
  it('preserves recoil load and the prediction tick in the local authority baseline',()=>{
    const vehicle={entityId:'recoil-car',playerId:'a',bodyAssetId:'patrol',pose:{x:0,z:0,yaw:0},velocity:{x:0,z:15,yawRate:0},health:100,status:'active' as const,protectedUntilTick:0,respawnAtTick:null,sirenOn:false,discontinuityId:0};
    const driver={resolvedSteering:.2,reverseHoldTicks:0,nextFireTick:132,shotOrdinal:4,nextRecoveryTick:0,lastDamageTick:null,recoilStrength:.75,simulatedTick:120};
    const source={...snapshot,vehicles:[vehicle],local:{vehicle,driver,lastConsumedSequence:42}};
    expect(unpackSnapshot(packSnapshot(source)).local!.driver).toEqual(driver);
  });
  it('preserves grenade landing warnings and fuse ticks across a real wire roundtrip, without mutating authority',()=>{
    const grenade={entityId:'lob-1',ownerEntityId:'boss',origin:{x:3.125,z:4.75,yaw:.25},target:{x:-8.5,z:9.125,yaw:0},bornTick:60,landsAtTick:105,detonatesAtTick:150,blastRadius:6.5,damage:30};
    const source={...snapshot,grenades:[grenade]};
    const decoded=unpackSnapshot(packSnapshot(source));
    expect(decoded).toHaveProperty('grenades',[grenade]);
    expect(unpackSnapshot(packSnapshot(snapshot))).toHaveProperty('grenades',[]);
    (decoded as WorldSnapshot & {grenades:typeof grenade[]}).grenades[0]!.target.x=99;
    expect(grenade.target.x).toBe(-8.5);
  });
  it('roundtrips ordered campaign resolutions for late joins and reconnects, including a completed tenth dispatch',()=>{
    const campaign={campaignId:'parking-scheme',dispatchIndex:9,status:'complete' as const,outcomes:Array.from({length:10},(_,dispatchIndex)=>({dispatchIndex,outcome:dispatchIndex%2?'wrecked' as const:'arrested' as const,playerId:dispatchIndex%2?'b':'a',callsign:dispatchIndex%2?'Officer B':'Officer A',elapsedTicks:180+dispatchIndex}))};
    const source={...snapshot,campaign};
    expect(unpackSnapshot(packSnapshot(source))).toHaveProperty('campaign',campaign);
    expect(unpackSnapshot(packSnapshot(snapshot))).not.toHaveProperty('campaign');
  });
  it('roundtrips authoritative pursuit identity, independent progress and the apprehending winner',()=>{
    const pursuit={state:'arresting' as const,suspectId:'wanted',progress:.75,elapsedTicks:300,arrestingPlayerId:'b',winnerPlayerId:null,contenders:[{playerId:'a',progress:.25},{playerId:'b',progress:.75}]};
    expect(unpackSnapshot(packSnapshot({...snapshot,pursuit})).pursuit).toEqual(pursuit);
    const complete={...pursuit,state:'complete' as const,progress:1,winnerPlayerId:'b'};
    expect(unpackSnapshot(packSnapshot({...snapshot,phase:'results',pursuit:complete})).pursuit).toEqual(complete);
  });
  it('roundtrips distinct barrels of one volley and accepts older projectile tuples',()=>{
    const projectile={entityId:'round-left',ownerEntityId:'car',pose:{x:-.63,z:2.45,yaw:0},velocity:{x:0,z:70,yawRate:0},bornTick:1,expiresTick:40,sourceCommandSequence:9,sourceShotOrdinal:2,volleyId:'volley-2',barrelIndex:0 as const,damage:5};
    const wire=packSnapshot({...snapshot,projectiles:[projectile]});expect(unpackSnapshot(wire).projectiles[0]).toMatchObject({volleyId:'volley-2',barrelIndex:0,damage:5});
    wire.shots[0]!.splice(11);expect(unpackSnapshot(wire).projectiles[0]).not.toHaveProperty('volleyId');
  });
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
