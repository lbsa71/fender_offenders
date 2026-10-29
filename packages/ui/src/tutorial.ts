import type { DeviceKind } from '@fender/contracts';
const actions = [
  ['throttle','DRIVE','W / ↑','RT','DRAG ↑'],['brakeReverse','BRAKE / REVERSE','S / ↓','LT','DRAG ↓'],
  ['steer','STEER','A D / ← →','◀ L ▶','DRAG ← →'],['handbrake','DRIFT','SHIFT','A','DRIFT'],
  ['bomb','THROW BOMB','B','LB','BOMB'],['oil','DROP OIL','Q','LS','OIL'],['blades','EXTEND BLADES','C','RS','BLADES'],
  ['smog','RELEASE SMOG','G','↓','SMOG'],
  ['siren','SIREN','E','X','SIREN'],['recover','HOLD TO RECOVER','R','Y','RECOVER'],['fire','FIRE','SPACE','RB','FIRE'],
] as const;
const keyName=(key:string)=>key.replace(/^Key/,'').replace(/^Digit/,'').replace(/Left$|Right$/,'').replace('ArrowUp','↑').replace('ArrowDown','↓').replace('ArrowLeft','←').replace('ArrowRight','→').toUpperCase();
export function controlHints(device:DeviceKind,bindings:Record<string,string[]>,guns:boolean,weapons:{bombsEnabled?:boolean;oilEnabled?:boolean;bladesEnabled?:boolean;smogEnabled?:boolean}={},previous?:{gunsEnabled:boolean;bombsEnabled?:boolean;oilEnabled?:boolean;bladesEnabled?:boolean;smogEnabled?:boolean}):{action:string;label:string;glyph:string}[]{
 const hints=actions.filter(([action])=>(action!=='fire'||guns)&&(action!=='bomb'||weapons.bombsEnabled)&&(action!=='oil'||weapons.oilEnabled)&&(action!=='blades'||weapons.bladesEnabled)&&(action!=='smog'||weapons.smogEnabled)).map(([action,label,key,pad,touch])=>({action,label,glyph:device==='touch'?touch:device==='gamepad'?pad:action==='steer'?[...(bindings.left??['KeyA']),...(bindings.right??['KeyD'])].map(keyName).join(' '):(bindings[action]?.map(keyName).join(' / ')??key)}));
 const current=device==='keyboard'?hints:[{action:'drive',label:'PULL TOWARD WHERE YOU WANT TO GO',glyph:device==='touch'?'DRAG':'L'},...hints.filter(h=>h.action!=='steer'&&(device!=='touch'||h.action!=='throttle'&&h.action!=='brakeReverse'))];
 const known=new Set(previous?controlHints(device,bindings,previous.gunsEnabled,previous).map(h=>h.action):[]);
 return current.filter(h=>!known.has(h.action));
}
export function placeControlCard(anchor:{x:number;y:number},width:number,height:number,cardWidth:number,cardHeight:number,target:{x:number;y:number}|null){
 const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(Math.max(min,max),v));
 const px=anchor.x*width,py=anchor.y*height;
 const candidates=[{x:px+120,y:py-20},{x:px-cardWidth-120,y:py-20},{x:px-cardWidth/2,y:py+90},{x:px-cardWidth/2,y:py-cardHeight-90}].map(p=>({x:clamp(p.x,12,width-cardWidth-12),y:clamp(p.y,110,height-cardHeight-150)}));
 const overlaps=(p:{x:number;y:number},x:number,y:number,w:number,h:number)=>p.x<x+w&&p.x+cardWidth>x&&p.y<y+h&&p.y+cardHeight>y;
 return candidates.find(p=>!overlaps(p,px-42,py-32,84,76)&&(!target||!overlaps(p,target.x*width-100,target.y*height-50,200,110)))??candidates[candidates.length-1]!;
}
