import type { PlanarPose } from '@fender/contracts';
export const MUZZLE_FORWARD = 2.45, MUZZLE_LATERAL = .63;
/** Ordered left/right physical muzzle tips, relative to the authoritative car heading. */
export function getVolleyOrigins(pose: PlanarPose): [PlanarPose,PlanarPose] {
  const fx=Math.sin(pose.yaw),fz=Math.cos(pose.yaw),rx=fz,rz=-fx;
  return [-MUZZLE_LATERAL,MUZZLE_LATERAL].map(side=>({x:pose.x+fx*MUZZLE_FORWARD+rx*side,z:pose.z+fz*MUZZLE_FORWARD+rz*side,yaw:pose.yaw})) as [PlanarPose,PlanarPose];
}
