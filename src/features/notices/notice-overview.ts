import {taskAudience} from '../../domain/notice';
import {plainReadingText} from '../../domain/reading';
import type {Notice,Task,TimelineEntry} from '../../domain/types';

function unique(values:(string|null|undefined)[]):string[]{
 const seen=new Set<string>();
 return values.flatMap(value=>{
  const label=plainReadingText(value??'').trim();
  const key=label.replace(/[\s：:]/g,'');
  if(!key||seen.has(key))return [];
  seen.add(key);return [label];
 });
}
export function formatDate(value:string,short=false):string{
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return value;
 return date.toLocaleString('zh-CN',{...(short?{}:{year:'numeric'}),month:'numeric',day:'numeric',...(short?{}:{hour:'2-digit',minute:'2-digit'})});
}

/** A compact view of saved fields. It never guesses missing dates, roles or places. */
export function noticeOverview(n:Notice){
 const active=n.tasks.filter(task=>!task.dismissed);
 const completed=active.filter(task=>task.completed).length;
 const deadline=n.localDeadline?`截止：${formatDate(n.localDeadline)}`:n.deadlineText||(n.deadline?`截止：${formatDate(n.deadline)}`:'');
 const times=deadline?unique([deadline]):unique(active.map(taskTime));
 const timeKey=(value:string)=>plainReadingText(value).replace(/[\s：:]/g,'').replace(/^截止/,'');
 const seenTimes=new Set(times.map(timeKey));
 for(const entry of times.length?[]:n.timeline){
  const time=entry.timeText||(entry.time?formatDate(entry.time):'');
  if(time&&!seenTimes.has(timeKey(time))){times.push(`${plainReadingText(entry.label)}：${plainReadingText(time)}`);seenTimes.add(timeKey(time));}
 }
 return {
  audiences:unique(active.map(task=>task.scope==='role'&&task.condition?`${taskAudience(task)} · ${task.condition}`:taskAudience(task))),
  times,
  locations:unique([...active.map(task=>task.location),...n.timeline.map(entry=>entry.location)]),
  completed,total:active.length,remaining:active.length-completed,
  notes:!!n.note||n.tasks.some(task=>!!task.note||task.steps.some(step=>!!step.note))||n.reminders.some(reminder=>!!reminder.note),
 };
}

/** Month/day is a reading format only; saved dates and calendar exports keep their year. */
export function displayTime(value:string):string{
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)&&Number.isFinite(Date.parse(value)))return displayTime(formatDate(value));
 return plainReadingText(value)

  .replace(/\d{4}\s*年(?=\s*\d{1,2}\s*月)/g,'')
  .replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/g,'$1月$2日')
  .replace(/：/g,':').replace(/\s+/g,' ').trim();
}
export function timeKey(value:string):string{
 return plainReadingText(value).replace(/[\s：:]/g,'').replace(/(\d{1,2})月(\d{1,2})(?:日|号)?/g,'$1月$2日').replace(/以前|之前/g,'前').replace(/[—–]/g,'-').replace(/^截止/,'');
}
export function taskTime(task:Task):string{
 return task.localDeadline?`截止：${formatDate(task.localDeadline)}`:task.timeText||(task.time?formatDate(task.time):'');
}
export function sameHeadlineTime(value:string,n:Notice):boolean{
 return !!value&&timeKey(noticeOverview(n).times[0]??'')===timeKey(value);
}

const datePhrase=/(?:\d{4}\s*年)?\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?(?:\s*(?:上午|下午|晚上)?\s*\d{1,2}[:：]\d{2}(?:\s*[-—–至]\s*\d{1,2}[:：]\d{2})?)?(?:以前|之前|前|后)?/g;
/** Omit only identical time phrases that already have their own visible fact or task field. */
export function readingSummary(n:Notice):string{
 const supplied=[...noticeOverview(n).times,...n.tasks.map(taskTime),...n.timeline.map(entry=>entry.timeText||(entry.time?formatDate(entry.time):''))];
 const keys=new Set(supplied.flatMap(value=>(value.match(datePhrase)??[]).map(timeKey)));
 return n.summary.replace(new RegExp(`(?:在|于)?${datePhrase.source}`,'g'),(value,offset:number,whole:string)=>{
  // A Markdown emphasis pair must remain balanced; such phrases are left intact.
  if(whole.slice(Math.max(0,offset-2),offset).includes('*')||whole.slice(offset+value.length,offset+value.length+2).includes('*'))return value;
  return keys.has(timeKey(value.replace(/^[在于]/,'')))?'':value;
 })
  .replace(/[,，；;]\s*截止[。.]?\s*$/,'。').replace(/\s+/g,' ').trim();
}
/** Keep useful whole clauses, never a one-line ellipsis or a cut-off audience condition. */
export function summaryPreview(n:Notice):{text:string;full:string;more:boolean}{
 const full=readingSummary(n);
 const clauses=full.match(/[^，；。！？]+[，；。！？]?/g)??[];
 let text='';
 for(const clause of clauses){if(text&&Array.from(text+clause).length>72)break;text+=clause;}
 return {text:text||full,full,more:text!==full};
}
/** Remove an event's repeated timeline copy only when the same action and facts are retained. */
export function extraTimeline(n:Notice):TimelineEntry[]{
 return n.timeline.filter(entry=>{
  const time=entry.timeText||(entry.time?formatDate(entry.time):'');
  const label=plainReadingText(entry.label).trim();
  return !n.tasks.some(task=>{
   const text=plainReadingText(task.text);
   return !!time&&timeKey(time)===timeKey(taskTime(task))&&entry.location===task.location&&!!label&&(text.includes(label)||label.includes(text));
  });
 });
}

/** Search can lead directly to content hidden by the compact list. */
export function matchesHiddenDetail(n:Notice,query:string):boolean{
 const needle=query.trim().toLocaleLowerCase();if(!needle)return false;
 const match=(value:string)=>plainReadingText(value).toLocaleLowerCase().includes(needle);
 const overview=noticeOverview(n);
 if([n.title,n.summary,n.note,...overview.audiences,...overview.times,...overview.locations,...n.materials,...n.warnings,...n.timeline.flatMap(entry=>[entry.label,entry.timeText,entry.location??'']),...n.reminders.flatMap(reminder=>[reminder.text,reminder.note])].some(match))return false;
 return [n.originalText,...n.tasks.flatMap(task=>[task.text,task.note,...task.details,...task.steps.flatMap(step=>[step.text,step.note,...step.details])])].some(match);
}
