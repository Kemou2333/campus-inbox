import {afterEach,expect,test,vi} from 'vitest';
import {createGuideSession,GUIDE_NOTICE_ID} from '../src/features/onboarding/guide-session';
import {canAdvanceGuide,GUIDE_READING_PAUSE,guideStepTarget} from '../src/features/onboarding/guide-progress';
import {guideLayout} from '../src/features/onboarding/guide-layout';

afterEach(()=>vi.useRealTimers());
test('practice only generates after the real fill action and can update its isolated notice',async()=>{
 vi.useFakeTimers();const changed=vi.fn(),session=createGuideSession(changed);
 expect(await session.organize()).toBe(false);expect(session.snapshot.notice).toBeNull();
 session.fill();expect(session.snapshot.draft.text.length).toBeGreaterThan(200);
 const generated=session.organize();expect(session.snapshot.busy).toBe(true);
 await vi.advanceTimersByTimeAsync(1800);expect(await generated).toBe(true);
 expect(session.snapshot.notice?.id).toBe(GUIDE_NOTICE_ID);
 const result=session.act(GUIDE_NOTICE_ID,n=>({...n,completed:true}));
 expect(result?.before.completed).toBe(false);expect(result?.after.completed).toBe(true);
 expect(session.act('a-real-notice',n=>({...n,completed:true}))).toBeUndefined();
 session.dispose();expect(session.snapshot.notice).toBeNull();expect(session.snapshot.draft.text).toBe('');
});
test('closing mid-generation cancels work and a new practice cannot receive old results',async()=>{
 vi.useFakeTimers();const session=createGuideSession();session.fill();const work=session.organize();
 session.dispose();expect(await work).toBe(false);session.reset();await vi.advanceTimersByTimeAsync(4000);
 expect(session.snapshot.notice).toBeNull();expect(session.snapshot.filled).toBe(false);expect(session.snapshot.busy).toBe(false);
});
test('steps gate on performed actions and retain a reading pause',()=>{
 const empty={pasted:false,generated:false,reviewed:false,completed:false};
 for(let step=0;step<4;step++)expect(canAdvanceGuide(step,empty)).toBe(false);
 const read={pasted:true,generated:true,reviewed:true,completed:false};
 expect(canAdvanceGuide(2,read)).toBe(true);expect(canAdvanceGuide(3,read)).toBe(false);
 expect(guideStepTarget(2,read,true)).toBe('.task-content');
 expect(guideStepTarget(2,{...read,reviewed:false},true)).toBe('.task-expand');
 expect(GUIDE_READING_PAUSE).toBeGreaterThanOrEqual(1000);
});
test('phone caption leaves the reading hole above it and desktop uses available side space',()=>{
 const phone=guideLayout({width:390,height:844},{x:12,y:90,width:366,height:600},{x:24,y:120,width:120,height:44},210);
 expect(phone.side).toBe(false);expect(phone.focus.y+phone.focus.height).toBeLessThan(phone.panel.y);
 expect(phone.panel.x).toBeGreaterThanOrEqual(12);expect(phone.panel.x+phone.panel.width).toBeLessThanOrEqual(378);
 const desktop=guideLayout({width:1440,height:900},{x:100,y:100,width:320,height:430},null,220);
 expect(desktop.side).toBe(true);expect(desktop.panel.x).toBeGreaterThan(420);
});
