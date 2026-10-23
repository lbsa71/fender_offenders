export interface VehicleFeedback{impactAge:number;impactFresh:boolean;strength:number;normalX:number;normalZ:number;recoilAge:number;recoilFresh:boolean;recoilStrength:number;scaleX:number;scaleY:number;scaleZ:number;offsetX:number;offsetZ:number;pitch:number;roll:number}
export const newVehicleFeedback=():VehicleFeedback=>({impactAge:10,impactFresh:false,strength:0,normalX:0,normalZ:0,recoilAge:10,recoilFresh:false,recoilStrength:0,scaleX:1,scaleY:1,scaleZ:1,offsetX:0,offsetZ:0,pitch:0,roll:0});
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
/** Authored normal is converted into vehicle space once; all outputs are presentation offsets. */
export function kickImpact(state:VehicleFeedback,normal:{x:number;z:number},yaw:number,speed:number):VehicleFeedback{
 const length=Math.hypot(normal.x,normal.z);
 if(!Number.isFinite(length)||!Number.isFinite(yaw)||!Number.isFinite(speed)||length<.001||speed<3)return state;
 const x=normal.x/length,z=normal.z/length,sin=Math.sin(yaw),cos=Math.cos(yaw);
 return{...state,impactAge:0,impactFresh:true,strength:clamp(speed/22,.12,1),normalX:x*cos-z*sin,normalZ:x*sin+z*cos};
}
export function kickRecoil(state:VehicleFeedback):VehicleFeedback{return{...state,recoilAge:0,recoilFresh:true,recoilStrength:Math.min(1,state.recoilAge<.12?state.recoilStrength+.25:.8)};}
/** A short damped spring squashes first and overshoots; clipping protects combined effects. */
export function stepVehicleFeedback(state:VehicleFeedback,delta:number,reducedMotion:boolean):VehicleFeedback{
 if(reducedMotion)return newVehicleFeedback();
 const dt=clamp(Number.isFinite(delta)?delta:0,0,.1),impactAge=Math.min(10,state.impactAge+(state.impactFresh?Math.min(dt,.035):dt)),recoilAge=Math.min(10,state.recoilAge+(state.recoilFresh?Math.min(dt,.025):dt));
 const wave=impactAge<1.8?state.strength*Math.exp(-5*impactAge)*Math.cos(16*impactAge):0;
 const recoil=recoilAge<.55?.1*state.recoilStrength*Math.exp(-18*recoilAge)*Math.cos(30*recoilAge):0;
 const pulse=-.34*wave,nx=state.normalX,nz=state.normalZ;
 return{...state,impactAge,recoilAge,impactFresh:state.impactFresh&&dt===0,recoilFresh:state.recoilFresh&&dt===0,scaleX:clamp(1+pulse*nx*nx-pulse*.32*nz*nz,.62,1.36),scaleY:clamp(1-pulse*.32,.85,1.18),scaleZ:clamp(1+pulse*nz*nz-pulse*.32*nx*nx-recoil*.25,.62,1.36),offsetX:clamp(nx*wave*.12,-.18,.18),offsetZ:clamp(nz*wave*.12-recoil,-.18,.18),pitch:-nz*wave*.16-recoil*.4,roll:nx*wave*.16};
}
