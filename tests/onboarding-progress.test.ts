import {expect,test} from 'vitest';
import {canAdvanceGuide,type GuideProgress} from '../src/features/onboarding/guide-progress';
const untouched:GuideProgress={pasted:false,generated:false,reviewed:false,completed:false};
const pasted={...untouched,pasted:true},generated={...pasted,generated:true},reviewed={...generated,reviewed:true};
test('the practice cannot advance before paste, generation and actual item expansion',()=>{
 expect(canAdvanceGuide(0,untouched)).toBe(false);expect(canAdvanceGuide(0,pasted)).toBe(true);
 expect(canAdvanceGuide(1,pasted)).toBe(false);expect(canAdvanceGuide(1,generated)).toBe(true);
 expect(canAdvanceGuide(2,generated)).toBe(false);expect(canAdvanceGuide(2,reviewed)).toBe(true);
});
test('finishing requires a checkmark without bypassing earlier practice',()=>{
 expect(canAdvanceGuide(3,reviewed)).toBe(false);
 expect(canAdvanceGuide(3,{...reviewed,completed:true})).toBe(true);
 expect(canAdvanceGuide(3,{...untouched,completed:true})).toBe(false);
 expect(canAdvanceGuide(4,{...reviewed,completed:true})).toBe(false);
});
