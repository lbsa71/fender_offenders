import {afterEach,describe,it,expect,vi} from 'vitest';
import {MotorAudio} from './audio';
class Param{value=0;values:number[]=[];setTargetAtTime(v:number){this.values.push(v);}setValueAtTime(v:number){this.values.push(v);}exponentialRampToValueAtTime(v:number){this.values.push(v);}linearRampToValueAtTime(v:number){this.values.push(v);}}
class Node{gain=new Param();frequency=new Param();type='';onended:(()=>void)|null=null;connect(){}disconnect(){}start(){}stop(when?:number){if(when===undefined||when<=0)this.onended?.();}}
class Context{static instances:Context[]=[];currentTime=0;destination={};oscillators:Node[]=[];closed=false;constructor(){Context.instances.push(this);}createGain(){return new Node();}createBiquadFilter(){return new Node();}createOscillator(){const n=new Node();this.oscillators.push(n);return n;}resume(){return Promise.resolve();}close(){this.closed=true;return Promise.resolve();}}
afterEach(()=>{vi.unstubAllGlobals();Context.instances=[];});
describe('original bounded novelty audio',()=>{
 it('requires intentional audio activation, makes short pitched cues, respects mute and caps voices',()=>{
  vi.stubGlobal('AudioContext',Context);const audio=new MotorAudio();
  expect(audio).toHaveProperty('cartoon');const cue=Reflect.get(audio,'cartoon') as (kind:'boing'|'squeak')=>void;
  cue.call(audio,'boing');expect(Context.instances).toHaveLength(0);
  audio.unlock();const context=Context.instances[0]!;cue.call(audio,'boing');cue.call(audio,'squeak');
  expect(context.oscillators[2]!.frequency.values.length).toBeGreaterThanOrEqual(3);expect(Math.max(...context.oscillators[3]!.frequency.values)).toBeGreaterThan(800);
  const before=context.oscillators.length;audio.muted=true;cue.call(audio,'boing');expect(context.oscillators).toHaveLength(before);audio.muted=false;
  for(let i=0;i<30;i++)cue.call(audio,'boing');expect(context.oscillators.length).toBeLessThanOrEqual(14);
  audio.dispose();expect(context.closed).toBe(true);
 });
});
