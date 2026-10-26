import {expect,it} from 'vitest';
import {STORYLINES} from '@fender/contracts';
import {themeForDispatch} from './environment';

it('uses the authored lighting for every dispatch in all five cases',()=>{
 expect(STORYLINES).toHaveLength(5);
 for(const story of STORYLINES)for(const dispatch of story.dispatches)expect(themeForDispatch(dispatch.id),`${story.title}: ${dispatch.title}`).toBe(dispatch.theme);
 expect(themeForDispatch('missing')).toBe('noon');expect(themeForDispatch(null)).toBe('noon');
});
