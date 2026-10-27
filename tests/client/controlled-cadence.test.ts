import {expect,it} from 'vitest';
import {controlledCadence} from '../support/controlled-cadence';
it.each([20,60])('runs the requested %i ticks under nominal timer callbacks',rate=>{let ticks=0;const advance=controlledCadence(rate,()=>ticks++);for(let i=0;i<rate;i++)advance(1000/rate);expect(ticks).toBe(rate);});

it.each([[20,62.5],[60,31.25]])('keeps %i Hz authority over six seconds when Windows coarsens callbacks to %i ms',(rate,callbackMs)=>{let ticks=0;const advance=controlledCadence(rate!,()=>ticks++);for(let elapsed=0;elapsed<6000;elapsed+=callbackMs!)advance(callbackMs!);expect(ticks).toBe(rate!*6);});
it('retains a fractional tick and does not advance for empty or invalid elapsed time',()=>{let ticks=0;const advance=controlledCadence(60,()=>ticks++);advance(10);expect(ticks).toBe(0);advance(10);expect(ticks).toBe(1);advance(0);advance(NaN);advance(-10);expect(ticks).toBe(1);advance(1000/60-10/3);expect(ticks).toBe(2);});
