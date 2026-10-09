import {taskAudience} from '../../domain/notice';
import {plainReadingText} from '../../domain/reading';
import type {Notice} from '../../domain/types';

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
 const times=deadline?unique([deadline]):unique(active.map(task=>task.timeText||(task.localDeadline||task.time?formatDate((task.localDeadline||task.time)!):'')));
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

/** Search can lead directly to content hidden by the compact list. */
export function matchesHiddenDetail(n:Notice,query:string):boolean{
 const needle=query.trim().toLocaleLowerCase();if(!needle)return false;
 const match=(value:string)=>plainReadingText(value).toLocaleLowerCase().includes(needle);
 const overview=noticeOverview(n);
 if([n.title,n.summary,n.note,...overview.audiences,...overview.times,...overview.locations,...n.materials,...n.warnings,...n.timeline.flatMap(entry=>[entry.label,entry.timeText,entry.location??'']),...n.reminders.flatMap(reminder=>[reminder.text,reminder.note])].some(match))return false;
 return [n.originalText,...n.tasks.flatMap(task=>[task.text,task.note,...task.details,...task.steps.flatMap(step=>[step.text,step.note,...step.details])])].some(match);
}
