import {createDemoNotice,demoOriginal} from '../features/onboarding/demo-notice';
import {LOCAL_DEMO_ID_PREFIX} from '../domain/local-demo';

export const GUEST_DEMO_SOURCE=demoOriginal;
export const GUEST_DEMO_DELAY_MS=3_000;
export const GUEST_DEMO_MARKER='prebuilt-v1' as const;
export interface GuestDemoDraft {text:string;attachments:string[];demo?:typeof GUEST_DEMO_MARKER}
/** Never match arbitrary user text to a canned answer. Filling the sample is explicit. */
export function isGuestDemoDraft(draft:GuestDemoDraft):boolean{
 return draft.demo===GUEST_DEMO_MARKER&&draft.text===GUEST_DEMO_SOURCE&&draft.attachments.length===0;
}
export function createGuestDemoNotice(draftID:string=crypto.randomUUID()){
 return {...createDemoNotice(),id:`${LOCAL_DEMO_ID_PREFIX}${draftID}`};
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
