/** Keep the requested test step rate when a host timer delivers several ticks together. */
export function controlledCadence(rate:number,step:()=>void):(elapsedMs:number)=>void {
  const interval=1000/rate;let remainder=0;
  return elapsedMs=>{
    remainder+=Number.isFinite(elapsedMs)?Math.max(0,Math.min(250,elapsedMs)):0;
    while(remainder+1e-7>=interval){remainder-=interval;step();}
    if(remainder<0)remainder=0;
  };
}
