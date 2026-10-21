import {afterEach,expect,test,vi} from 'vitest';
import {createGuideSession,GUIDE_NOTICE_ID} from '../src/features/onboarding/guide-session';
import {canAdvanceGuide,GUIDE_READING_PAUSE,GUIDE_COMPLETE_TARGET,guideBlockedMessage,guideReadingTarget,guideStepTarget} from '../src/features/onboarding/guide-progress';
import {followGuideRect,guideLayout,guideRectOffset} from '../src/features/onboarding/guide-layout';
import {setNoticeCompleted} from '../src/domain/notice';

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
test('going back after completion restores the previous practice so the big check can work again',async()=>{
 const session=createGuideSession();session.fill();await session.organize(0);
 const before=structuredClone(session.snapshot.notice!);
 session.act(GUIDE_NOTICE_ID,n=>setNoticeCompleted(n,true));expect(session.snapshot.notice?.completed).toBe(true);
 session.rewindCompletion();expect(session.snapshot.notice).toEqual(before);
 session.act(GUIDE_NOTICE_ID,n=>setNoticeCompleted(n,true));expect(session.snapshot.notice?.completed).toBe(true);
 session.rewindCompletion();expect(session.snapshot.notice).toEqual(before);session.dispose();
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

test('filled example targets the real textarea and completion targets the whole-notice button',()=>{
 const filled={pasted:true,generated:false,reviewed:false,completed:false};
 expect(guideStepTarget(0,filled,false)).toBe('.composer-text textarea');
 expect(guideReadingTarget(0,filled)).toBe('.composer-text textarea');
 const reviewed={...filled,generated:true,reviewed:true};
 expect(guideStepTarget(3,reviewed,true)).toBe(GUIDE_COMPLETE_TARGET);
 expect(guideReadingTarget(3,reviewed)).toBe(GUIDE_COMPLETE_TARGET);
 expect(guideStepTarget(3,{...reviewed,completed:true},true)).toBe('.notice-card');
 expect(guideReadingTarget(3,{...reviewed,completed:true})).toBe('.notice-card');
 expect(GUIDE_COMPLETE_TARGET).not.toContain('Checkbox');
});
test('blocked attempts explain the current action, including the reading pause',()=>{
 const generated={pasted:true,generated:true,reviewed:false,completed:false};
 expect(guideBlockedMessage(1,generated,false)).toContain('先看看整理后的通知');
 expect(guideBlockedMessage(2,generated,false)).toContain('发光的箭头');
 expect(guideBlockedMessage(2,generated,true)).toContain('待办标题');
 expect(guideBlockedMessage(3,generated,true)).toContain('大勾');
 expect(guideBlockedMessage(3,{...generated,reviewed:true,completed:true},true)).toContain('已经完成');
});
test('live scroll and expansion follow the measurement without restarting the intentional move',()=>{
 const before={x:40,y:100,width:100,height:44},destination={x:180,y:400,width:56,height:56};
 const offset=guideRectOffset(before,destination);
 expect(followGuideRect(destination,offset,1)).toEqual(before);
 const midpoint=followGuideRect(destination,offset,.5);
 const scrolled=followGuideRect({...destination,y:destination.y-120,height:destination.height+30},offset,.5);
 expect(scrolled.y-midpoint.y).toBe(-120);
 expect(scrolled.height-midpoint.height).toBe(30);
 const settled={...destination,y:250,height:86};
 expect(followGuideRect(settled,offset,0)).toEqual(settled);
});

test('a scrolled textarea ring clips to its visible area, not its original full height',()=>{
 const context={x:20,y:-180,width:350,height:600};
 const layout=guideLayout({width:390,height:844,top:74},context,context,210);
 expect(layout.control!.y).toBe(74);
 expect(layout.control!.height).toBe(350);
 expect(layout.control!.y+layout.control!.height).toBeLessThan(layout.panel.y);
 const gone=guideLayout({width:390,height:844,top:74},{...context,y:-800},{...context,y:-800},210);
 expect(gone.control).toBeNull();
 expect(gone.focus.height).toBe(0);
});

test('the generated-result reading step reveals the overview without the expand controls',()=>{
 const generated={pasted:true,generated:true,reviewed:false,completed:false};
 expect(guideStepTarget(1,generated,false)).toBe('.notice-overview');
 expect(guideReadingTarget(1,generated)).toBe('.notice-overview');
 expect(guideStepTarget(2,generated,false)).toBe('.notice-expand');
});
