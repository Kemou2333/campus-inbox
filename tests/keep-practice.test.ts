import {expect,test} from 'vitest';
import {createDemoNotice} from '../src/features/onboarding/demo-notice';
import {GUIDE_NOTICE_ID} from '../src/features/onboarding/guide-session';
import {keepFirstPractice,KEPT_PRACTICE_ID} from '../src/features/onboarding/keep-practice';
import {isLocalDemoNotice} from '../src/domain/local-demo';

test('completed first practice survives session disposal without changing personal data',()=>{
 const practice={...createDemoNotice(),id:GUIDE_NOTICE_ID,completed:true};
 const personal={...createDemoNotice(),id:'personal-notice',note:'我的笔记'};
 const result=keepFirstPractice([personal],practice,'2026-10-21T12:00:00.000Z')!;
 expect(result.notices[0]).toBe(personal);expect(result.notices[1].completed).toBe(true);
 expect(isLocalDemoNotice(result.notices[1])).toBe(true);expect(result.id).toBe(KEPT_PRACTICE_ID);
 practice.note='later change';expect(result.notices[1].note).not.toBe('later change');
});
test('repeat finish never replaces an edited practice or accepts unfinished and personal notices',()=>{
 const practice={...createDemoNotice(),id:GUIDE_NOTICE_ID,completed:true};
 const saved={...practice,id:KEPT_PRACTICE_ID,note:'保留的笔记',favorite:true};const current=[saved];
 expect(keepFirstPractice(current,practice)?.notices).toBe(current);
 expect(keepFirstPractice(current,{...practice,completed:false})).toBeNull();
 expect(keepFirstPractice(current,{...practice,id:'personal'})).toBeNull();
});
