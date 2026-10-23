import { expect, it } from 'vitest';
import { BOSS_TACTICS, getBossTactics } from './boss-tactics.js';
it('authors ten armed dispatch profiles with a strictly increasing difficulty and bounded readable attacks',()=>{
 expect(BOSS_TACTICS).toHaveLength(10);
 expect(BOSS_TACTICS.map(t=>t.difficulty)).toEqual([1,2,3,4,5,6,7,8,9,10]);
 expect(new Set(BOSS_TACTICS.map(t=>t.id)).size).toBe(10);
 for(const t of BOSS_TACTICS){expect(t.label.length).toBeGreaterThan(3);expect(t.description.length).toBeGreaterThan(40);expect(['burst','grenades','mixed']).toContain(t.weapon);expect(t.windupTicks).toBeGreaterThanOrEqual(30);expect(t.burstRecoveryTicks).toBeGreaterThanOrEqual(120);expect(t.burstIntervalTicks).toBeGreaterThanOrEqual(12);expect(t.bulletDamage).toBeLessThanOrEqual(10);expect(t.grenadeFuseTicks).toBeGreaterThanOrEqual(72);expect(t.grenadeFlightTicks).toBeLessThan(t.grenadeFuseTicks);expect(t.grenadeRadius).toBeLessThanOrEqual(7);expect(t.grenadeDamage).toBeLessThanOrEqual(34);expect(Object.isFrozen(t)).toBe(true);}
 expect(Object.isFrozen(BOSS_TACTICS)).toBe(true);
});
it('gives the four ringleaders distinct driving and weapon signatures with progressively shorter attack recovery',()=>{
 expect(BOSS_TACTICS).toHaveLength(10);
 expect(getBossTactics(1)).toMatchObject({drivingStyle:'brake-check',weapon:'burst'});
 expect(getBossTactics(4)).toMatchObject({drivingStyle:'weaver',weapon:'grenades'});
 expect(getBossTactics(7)).toMatchObject({drivingStyle:'weaver',weapon:'burst'});
 expect(getBossTactics(9)).toMatchObject({drivingStyle:'interceptor',weapon:'mixed'});
 expect(getBossTactics(7).weaveAmplitude).toBeGreaterThan(getBossTactics(4).weaveAmplitude);
 expect(getBossTactics(1).burstRecoveryTicks).toBeGreaterThan(getBossTactics(4).burstRecoveryTicks);expect(getBossTactics(4).burstRecoveryTicks).toBeGreaterThan(getBossTactics(7).burstRecoveryTicks);expect(getBossTactics(7).burstRecoveryTicks).toBeGreaterThan(getBossTactics(9).burstRecoveryTicks);
 expect(getBossTactics(0).windupTicks).toBeGreaterThan(getBossTactics(9).windupTicks);
});
it('bounds invalid or out-of-range dispatch indices to a valid authored profile',()=>{
 expect(BOSS_TACTICS).toHaveLength(10);expect(getBossTactics(-1)).toBe(BOSS_TACTICS[0]);expect(getBossTactics(NaN)).toBe(BOSS_TACTICS[0]);expect(getBossTactics(99)).toBe(BOSS_TACTICS[9]);expect(getBossTactics(4.8)).toBe(BOSS_TACTICS[4]);
});
