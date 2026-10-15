import {expect,test} from 'vitest';
import {createDemoNotice,demoOriginal} from '../src/features/onboarding/demo-notice';
import fixture from '../src/features/onboarding/demo-notice.json';
import catalog from '../public/examples.json';
import {getNoticeStatus,toggleTask} from '../src/domain/notice';

test('guided example preserves a reviewed real notice and its previous AI result',()=>{
 const source=catalog.notices.find(notice=>notice.id===fixture.provenance.exampleId);
 expect(fixture.notice).toEqual(source);
 expect(fixture.provenance.manualIdentityReview).toBe(true);
 expect(fixture.provenance.manualPrivacyEdits).toBe(true);
 expect(fixture.provenance.manualContentCorrections).toBe(false);
 const demo=createDemoNotice();expect(demo.originalText).toBe(demoOriginal);
 expect(demoOriginal.length).toBeGreaterThan(150);expect(demoOriginal.length).toBeLessThan(500);
 for(const field of ['title','summary','deadline','deadlineText','timeline','materials','warnings'] as const)expect(demo[field]).toEqual(fixture.notice[field]);
 expect(demo.tasks.map(({id,steps,...task})=>({...task,steps:steps.map(({id,...step})=>step)}))).toEqual(fixture.notice.tasks.map(({id,steps,...task})=>({...task,steps:steps.map(({id,...step})=>step)})));
});
test('practice IDs and progress are isolated from catalog and later practice sessions',()=>{
 const first=createDemoNotice(),second=createDemoNotice();
 expect(first.id).not.toBe(second.id);expect(first.tasks[0].id).not.toBe(second.tasks[0].id);
 const completed=toggleTask(first,first.tasks[0].id);expect(getNoticeStatus(completed)).toBe('completed');
 expect(getNoticeStatus(second)).toBe('pending');expect(fixture.notice.tasks[0].completed).toBe(false);
 expect(first.id).not.toBe(fixture.notice.id);
});
