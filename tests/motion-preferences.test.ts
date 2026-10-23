import {afterEach,expect,test,vi} from 'vitest';
import {createTheme} from '@mui/material/styles';
import {MOTION_PREFERENCES_KEY,readMotionPreferences,setMotionSpeed} from '../src/shared/motion-preferences';
import {withNoticeMotion} from '../src/features/notices/notice-motion';

afterEach(()=>vi.unstubAllGlobals());
const storage=(raw:string|null)=>({getItem:()=>raw});
test('each local rate accepts only the supported choices and otherwise keeps the entry 1.5 and expansion 1.25 defaults',()=>{
 expect(readMotionPreferences(storage(null))).toEqual({entry:1.5,notice:1.25});
 expect(readMotionPreferences(storage('{"entry":2,"notice":1.25}'))).toEqual({entry:2,notice:1.25});
 expect(readMotionPreferences(storage('{"entry":0,"notice":1.75}'))).toEqual({entry:1.5,notice:1.75});
 expect(readMotionPreferences(storage('not json'))).toEqual({entry:1.5,notice:1.25});
 expect(readMotionPreferences({getItem:()=>{throw new Error('blocked');}})).toEqual({entry:1.5,notice:1.25});
});
test('changing one rate preserves the other and applies local fade speed immediately',()=>{
 const values=new Map([[MOTION_PREFERENCES_KEY,'{"entry":1.5,"notice":1.75}']]),css=vi.fn(),window=new EventTarget(),changed=vi.fn();
 vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
 vi.stubGlobal('window',window);vi.stubGlobal('document',{documentElement:{style:{setProperty:css}}});
 window.addEventListener('campus-inbox:motion-preferences-changed',changed);
 setMotionSpeed('entry',2);
 expect(readMotionPreferences()).toEqual({entry:2,notice:1.75});
 expect(css).toHaveBeenLastCalledWith('--entry-motion-speed','2');expect(changed).toHaveBeenCalledOnce();
 setMotionSpeed('notice',1.25);expect(JSON.parse(values.get(MOTION_PREFERENCES_KEY)!)).toEqual({entry:2,notice:1.25});
});
test('height-aware notice timing is shorter for small contents and preserves the rest of the theme',()=>{
 const original=createTheme({palette:{mode:'dark'}}),slow=withNoticeMotion(original,1.25),fast=withNoticeMotion(original,2);
 expect(fast.palette).toBe(original.palette);expect(fast.components).toBe(original.components);expect(fast.transitions.duration).toBe(original.transitions.duration);
 expect(fast.transitions.getAutoHeightDuration(0)).toBe(0);
 expect(fast.transitions.getAutoHeightDuration(70)).toBeLessThan(fast.transitions.getAutoHeightDuration(700));
 expect(fast.transitions.getAutoHeightDuration(700)).toBeLessThan(slow.transitions.getAutoHeightDuration(700));
 expect(fast.transitions.getAutoHeightDuration(100000)).toBeLessThanOrEqual(310);
 expect(original.transitions.getAutoHeightDuration(700)).toBeGreaterThan(slow.transitions.getAutoHeightDuration(700));
});
test('nested notice themes do not multiply the selected speed again',()=>{
 const original=createTheme(),once=withNoticeMotion(original,1.5),nested=withNoticeMotion(once,1.5);
 expect(nested.transitions.getAutoHeightDuration(300)).toBe(once.transitions.getAutoHeightDuration(300));
});
