import primaryDemo from '../features/onboarding/demo-notice.json';
import extraDemos from '../features/onboarding/guest-demo-notices.json';
import {parseNotice} from '../domain/notice';
import {LOCAL_DEMO_ID_PREFIX} from '../domain/local-demo';

const reviewedDemos=[primaryDemo,...extraDemos];
function reviewedDemoForSource(source:string){
 return reviewedDemos.find(demo=>demo.notice.originalText===source||demo.legacyOriginalTexts.some(previous=>previous.text===source));
}
export const GUEST_DEMO_SOURCES=reviewedDemos.map(demo=>demo.notice.originalText);
export const GUEST_DEMO_SOURCE=GUEST_DEMO_SOURCES[0];
export const GUEST_DEMO_DELAY_MS=3_000;
export const GUEST_DEMO_MARKER='prebuilt-v1' as const;
const rotationKey='campus-inbox:guest-demo-cycle:v2';
const legacyRotationKey='campus-inbox:guest-demo-next:v1';
type RotationStorage=Pick<Storage,'getItem'|'setItem'>;
interface DemoCycle {remaining:number[];last:number|null}
const fallbackCycles=new WeakMap<RotationStorage,DemoCycle>();
function shuffled(values:number[],random:()=>number):number[]{
 const result=[...values];
 for(let i=result.length-1;i>0;i--){const draw=random(),j=Math.floor(Math.max(0,Math.min(.999999999,Number.isFinite(draw)?draw:0))* (i+1));[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
function readCycle(storage:RotationStorage):DemoCycle|null {
 try{
  const raw=storage.getItem(rotationKey);if(!raw)return null;
  const value=JSON.parse(raw) as DemoCycle;
  if(!value||!Array.isArray(value.remaining)||value.remaining.length>reviewedDemos.length||new Set(value.remaining).size!==value.remaining.length||value.remaining.some(index=>!Number.isSafeInteger(index)||index<0||index>=reviewedDemos.length)||value.last!==null&&(!Number.isSafeInteger(value.last)||value.last<0||value.last>=reviewedDemos.length))return null;
  return {remaining:[...value.remaining],last:value.last};
 }catch{return null;}
}
/** A device-only shuffled deck, with no repeat until every sample was used.
 * The first new visitor still receives the familiar useful evaluation sample. */
export function nextGuestDemoSource(storage:RotationStorage=localStorage,random:()=>number=Math.random):string{
 let cycle=readCycle(storage)??fallbackCycles.get(storage);
 if(!cycle){
  let first=0;
  try{const legacy=storage.getItem(legacyRotationKey);if(legacy!==null&&Number.isSafeInteger(Number(legacy))&&Number(legacy)>=0)first=Number(legacy)%Math.min(3,reviewedDemos.length);}catch{/* Preserve the first-use default. */}
  cycle={remaining:[first,...shuffled(reviewedDemos.map((_,i)=>i).filter(i=>i!==first),random)],last:null};
 }
 if(!cycle.remaining.length){
  cycle.remaining=shuffled(reviewedDemos.map((_,i)=>i),random);
  if(cycle.remaining.length>1&&cycle.remaining[0]===cycle.last){const swap=cycle.remaining.findIndex(i=>i!==cycle.last);[cycle.remaining[0],cycle.remaining[swap]]=[cycle.remaining[swap],cycle.remaining[0]];}
 }
 const index=cycle.remaining.shift()!;cycle.last=index;fallbackCycles.set(storage,cycle);
 try{storage.setItem(rotationKey,JSON.stringify(cycle));}catch{/* Filling stays available when local storage is restricted. */}
 return GUEST_DEMO_SOURCES[index];
}
export interface GuestDemoDraft {text:string;attachments:string[];demo?:typeof GUEST_DEMO_MARKER}
/** Never match arbitrary user text to a canned answer. Filling the sample is explicit. */
export function isGuestDemoDraft(draft:GuestDemoDraft):boolean{
 return draft.demo===GUEST_DEMO_MARKER&&!!reviewedDemoForSource(draft.text)&&draft.attachments.length===0;
}
export function createGuestDemoNotice(draftID:string=crypto.randomUUID(),source=GUEST_DEMO_SOURCE){
 // Previously filled, exact built-in text stays a free sample after a release.
 // Only the known sample alias upgrades to the current curated display; any
 // personal edit or attachment still fails the explicit demo check above.
 const fixture=reviewedDemoForSource(source);
 if(!fixture)throw new Error('示例已修改，请重新填入。');
 const notice=parseNotice(fixture.notice),now=new Date().toISOString();
 return {...notice,id:`${LOCAL_DEMO_ID_PREFIX}${draftID}`,createdAt:now,updatedAt:now,
  tasks:notice.tasks.map(task=>({...task,id:`demo-${crypto.randomUUID()}`,steps:task.steps.map(step=>({...step,id:`demo-${crypto.randomUUID()}`}))})),
  reminders:notice.reminders.map(reminder=>({...reminder,id:`demo-${crypto.randomUUID()}`}))};
}
/** This wait models the product flow only; no provider or business endpoint is called. */
export function waitForGuestDemo(signal:AbortSignal,delay=GUEST_DEMO_DELAY_MS):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('示例体验已停止','AbortError'));return;}
  const done=()=>{signal.removeEventListener('abort',cancel);resolve();};
  const timer=setTimeout(done,delay);
  const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(new DOMException('示例体验已停止','AbortError'));};
  signal.addEventListener('abort',cancel,{once:true});
 });
}
