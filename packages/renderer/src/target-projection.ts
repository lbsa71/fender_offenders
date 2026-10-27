import type {TargetIndicator} from '@fender/contracts';
/** Invert the ground-plane projection at the car, including reflected X and pixel aspect. */
export function screenDirectionToHeading(m:ArrayLike<number>,origin:{x:number;z:number},width:number,height:number,dx:number,dy:number):number{
 const x=-origin.x,z=origin.z,cx=x*m[0]!+z*m[8]!+m[12]!,cy=x*m[1]!+z*m[9]!+m[13]!,w=x*m[3]!+z*m[11]!+m[15]!;
 const a=-(m[0]!*w-cx*m[3]!)*width,b=(m[8]!*w-cx*m[11]!)*width;
 const c=(m[1]!*w-cy*m[3]!)*height,d=-(m[9]!*w-cy*m[11]!)*height,det=a*d-b*c;
 if(!Number.isFinite(det)||Math.abs(det)<1e-8)return Math.atan2(dx,-dy);
 return Math.atan2((d*dx-b*dy)/det,(a*dy-c*dx)/det);
}
export interface HomogeneousTarget{x:number;y:number;z?:number;w:number}
/** Babylon viewport coordinates: x from left, y from bottom. */
export interface TargetViewport{x:number;y:number;width:number;height:number}
/** Clip coordinates are already in renderer space; no further world-axis reflection belongs here. */
export function targetIndicatorFromClip(clip:HomogeneousTarget,width:number,height:number,distanceMeters:number,viewport:TargetViewport={x:0,y:0,width:1,height:1}):TargetIndicator|null{
 if(![clip.x,clip.y,clip.w,width,height,viewport.x,viewport.y,viewport.width,viewport.height].every(Number.isFinite)||width<=0||height<=0||viewport.width<=0||viewport.height<=0)return null;
 const vx=viewport.x*width,vy=(1-viewport.y-viewport.height)*height,vw=viewport.width*width,vh=viewport.height*height,cx=vx+vw/2,cy=vy+vh/2;
 const denominator=Math.max(Math.abs(clip.w),.000001);let dx=clip.x/denominator*vw/2,dy=-clip.y/denominator*vh/2;
 if(Math.abs(dx)+Math.abs(dy)<.000001){dx=0;dy=clip.w>0?-1:1;}
 const angle=(Math.atan2(dx,-dy)+Math.PI*2)%(Math.PI*2),depthVisible=clip.z===undefined||clip.z>=-clip.w&&clip.z<=clip.w;
 const offscreen=clip.w<=.000001||!depthVisible||Math.abs(clip.x)>clip.w||Math.abs(clip.y)>clip.w;
 const distance=Number.isFinite(distanceMeters)?Math.max(0,distanceMeters):0;
 if(!offscreen)return{x:(cx+clip.x/clip.w*vw/2)/width,y:(cy-clip.y/clip.w*vh/2)/height,angle,offscreen:false,distanceMeters:distance};
 const left=vx+Math.min(84,vw*.4),right=vx+vw-Math.min(84,vw*.4),top=vy+Math.min(width>740?150:104,vh*.4),bottom=vy+vh-Math.min(210,vh*.4);
 const tx=dx>0?(right-cx)/dx:dx<0?(left-cx)/dx:Infinity,ty=dy>0?(bottom-cy)/dy:dy<0?(top-cy)/dy:Infinity,scale=Math.max(0,Math.min(tx,ty));
 return{x:Math.max(left,Math.min(right,cx+dx*scale))/width,y:Math.max(top,Math.min(bottom,cy+dy*scale))/height,angle,offscreen:true,distanceMeters:distance};
}
