import { expect,it } from 'vitest';
import { ContactLedger } from './contact-ledger';
const motion=(contactRevision=0,x=10)=>({sequence:1,discontinuityId:7,contactRevision,pose:{x,z:0,yaw:0},velocity:{x:0,z:0,yawRate:0}});
const delta=(x:number)=>({entityId:'unit',pose:{x,z:0,yaw:0},velocity:{x:0,z:0,yawRate:0}});

it('translates old and acknowledged reports into the same corrected frame without counting a separation twice',()=>{
  const ledger=new ContactLedger(7);ledger.record(delta(-.2));ledger.record(delta(-.1));
  expect(ledger.adjust(motion(0))).toEqual(motion(2,9.7));
  expect(ledger.adjust(motion(1,9.8))).toEqual(motion(2,9.7));
  expect(ledger.adjust(motion(2,9.7))).toEqual(motion(2,9.7));
  const published=ledger.state;published.pose.x=900;expect(ledger.state.pose.x).toBeCloseTo(-.3,10);
});
it('bounds retained correction history and refuses unknown, expired or forged acknowledgements',()=>{
  const ledger=new ContactLedger(7);for(let i=0;i<260;i++)ledger.record(delta(.0001));
  for(const revision of [0,-1,261,NaN,Infinity,.5])expect(ledger.adjust(motion(revision))).toBeNull();
  expect(ledger.adjust(motion(260))).toEqual(motion(260));
});
it('retains contact state within one life and starts a new baseline after a true life change',()=>{
  const ledger=new ContactLedger(7);ledger.record(delta(-.2));ledger.sync(7);expect(ledger.state.revision).toBe(1);
  ledger.sync(8);expect(ledger.state).toEqual({revision:0,pose:{x:0,z:0,yaw:0},velocity:{x:0,z:0,yawRate:0}});
  expect(ledger.adjust(motion(1))).toBeNull();expect(ledger.adjust(motion(0))).toEqual(motion(0));
});
