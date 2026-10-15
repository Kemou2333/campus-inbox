import {parseNotice} from '../../domain/notice';
import fixture from './demo-notice.json';

/** Previously generated, manually redacted real notice. No live AI call. */
export const demoOriginal=fixture.notice.originalText;
export function createDemoNotice(){
 const notice=parseNotice(fixture.notice),now=new Date().toISOString();
 return {...notice,id:`demo-${crypto.randomUUID()}`,createdAt:now,updatedAt:now,
  tasks:notice.tasks.map(task=>({...task,id:`demo-${crypto.randomUUID()}`,steps:task.steps.map(step=>({...step,id:`demo-${crypto.randomUUID()}`}))})),
  reminders:notice.reminders.map(reminder=>({...reminder,id:`demo-${crypto.randomUUID()}`}))};
}
