import primaryDemo from '../features/onboarding/demo-notice.json';
import extraDemos from '../features/onboarding/guest-demo-notices.json';
import {parseNotice} from '../domain/notice';
import {LOCAL_DEMO_ID_PREFIX} from '../domain/local-demo';

const reviewedDemos=[primaryDemo,...extraDemos];
export const GUEST_DEMO_SOURCES=reviewedDemos.map(demo=>demo.notice.originalText);
export const GUEST_DEMO_SOURCE=GUEST_DEMO_SOURCES[0];
export const GUEST_DEMO_DELAY_MS=3_000;
export const GUEST_DEMO_MARKER='prebuilt-v1' as const;
const rotationKey='campus-inbox:guest-demo-next:v1';
type RotationStorage=Pick<Storage,'getItem'|'setItem'>;
let fallbackIndex=0;
/** Device-only sequence. Filling a sample never enables the separate example catalog. */
export function nextGuestDemoSource(storage:RotationStorage=localStorage):string{
 let index=fallbackIndex;
 try{const raw=storage.getItem(rotationKey),stored=raw===null?0:Number(raw);if(Number.isSafeInteger(stored)&&stored>=0)index=stored%reviewedDemos.length;}catch{/* Keep the in-session sequence when storage is unavailable. */}
 fallbackIndex=(index+1)%reviewedDemos.length;
 try{storage.setItem(rotationKey,String(fallbackIndex));}catch{/* Sample filling remains available in restricted storage. */}
 return GUEST_DEMO_SOURCES[index];
}
export interface GuestDemoDraft {text:string;attachments:string[];demo?:typeof GUEST_DEMO_MARKER}
/** Never match arbitrary user text to a canned answer. Filling the sample is explicit. */
export function isGuestDemoDraft(draft:GuestDemoDraft):boolean{
 return draft.demo===GUEST_DEMO_MARKER&&GUEST_DEMO_SOURCES.includes(draft.text)&&draft.attachments.length===0;
}
export function createGuestDemoNotice(draftID:string=crypto.randomUUID(),source=GUEST_DEMO_SOURCE){
 const fixture=reviewedDemos.find(demo=>demo.notice.originalText===source);
 if(!fixture)throw new Error('示例已修改，请重新填入。');
 const notice=parseNotice(fixture.notice),now=new Date().toISOString();
 return {...notice,id:`${LOCAL_DEMO_ID_PREFIX}${draftID}`,createdAt:now,updatedAt:now,
  tasks:notice.tasks.map(task=>({...task,id:`demo-${crypto.randomUUID()}`,steps:task.steps.map(step=>({...step,id:`demo-${crypto.randomUUID()}`}))})),
  reminders:notice.reminders.map(reminder=>({...reminder,id:`demo-${crypto.randomUUID()}`}))};
}
/** This wait models the product flow only; no provider or business endpoint is called. */
export function waitForGuestDemo(signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('示例体验已停止','AbortError'));return;}
  const done=()=>{signal.removeEventListener('abort',cancel);resolve();};
  const timer=setTimeout(done,GUEST_DEMO_DELAY_MS);
  const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(new DOMException('示例体验已停止','AbortError'));};
  signal.addEventListener('abort',cancel,{once:true});
 });
}
