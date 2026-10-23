import type { WireSnapshot } from '@fender/contracts';
type Tuple=NonNullable<WireSnapshot['props']>[number];
function changed(a:Tuple,b:Tuple):boolean {
 if([1,2,10,11,12].some(i=>a[i]!==b[i]))return true;
 if(Math.hypot(a[3]-b[3],a[4]-b[4],a[5]-b[5])>=.02)return true;
 const same=Math.max(...[6,7,8,9].map(i=>Math.abs((a[i] as number)-(b[i] as number))));
 const opposite=Math.max(...[6,7,8,9].map(i=>Math.abs((a[i] as number)+(b[i] as number))));
 return Math.min(same,opposite)>=.002;
}
/** One cache per recipient; only last-sent quantized state advances the meaningful-motion threshold. */
export function createPropPublisher(){
 let sent:Map<string,Tuple>|null=null,matchId='';
 return {filter(wire:WireSnapshot,forceBaseline=false):WireSnapshot{
  const props=wire.props??[],result={...wire};
  const full=forceBaseline||!sent||matchId!==wire.m||props.length!==sent.size||props.some(p=>!sent!.has(p[0]));
  if(full){sent=new Map(props.map(p=>[p[0],[...p] as Tuple]));matchId=wire.m;result.props=props;delete result.propsPatch;return result;}
  const delta=props.filter(p=>changed(p,sent!.get(p[0])!));for(const p of delta)sent!.set(p[0],[...p] as Tuple);
  result.propsPatch=true;if(delta.length)result.props=delta;else delete result.props;return result;
 }};
}
