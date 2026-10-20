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
  .replace(/\b\d{4}[/-](\d{1,2})[/-](\d{1,2})(?=$|[\sT])/g,(_,month,day)=>`${Number(month)}月${Number(day)}日`)

  .replace(/\d{4}\s*年(?=\s*\d{1,2}\s*月)/g,'')
  .replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/g,'$1月$2日')
  .replace(/：/g,':').replace(/\s+/g,' ').trim();
}
/** The deadline caption is shown once, outside the date value. Relative phrases stay intact. */
export function headlineTime(value:string):string{
 const teaching=value.match(/（按学期设置：([^）]+)）$/);
 if(teaching)return `${displayTime(teaching[1])} · 按学期`;
 return displayTime(value.replace(/^(?:报名)?截止(?:时间)?[：:]?\s*(?=\d)/,''));
}
/** Keep verbose scheduling explanations inside details, never a multi-line badge. */
export function compactHeadlineTime(value:string):string{
 const text=headlineTime(value).replace(/^[^\d:：]{1,80}[:：]\s*/,'');
 return [...text].length<=28?text:'';
}
export function timeKey(value:string):string{
 return plainReadingText(value).replace(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?=$|\s)/g,(_,year,month,day)=>`${year}年${Number(month)}月${Number(day)}日`).replace(/[\s：:]/g,'').replace(/(\d{1,2})月(\d{1,2})(?:日|号)?/g,'$1月$2日').replace(/以前|之前/g,'前').replace(/[—–]/g,'-').replace(/^截止/,'');
}
export function taskTime(task:Task):string{
 return task.localDeadline?`截止：${formatDate(task.localDeadline)}`:task.timeText||(task.time?formatDate(task.time):'');
}
export function sameHeadlineTime(value:string,n:Notice):boolean{
 return !!value&&timeKey(noticeOverview(n).times[0]??'')===timeKey(value);
}

const dateGap='[^\\S\\r\\n\\u2028\\u2029\\v\\f]*';
const dateBreak='[\\r\\n\\u2028\\u2029\\v\\f]+';
const datePhrase=new RegExp(`(?:\\d{4}${dateGap}年${dateGap})?\\d{1,2}${dateGap}月${dateGap}\\d{1,2}${dateGap}(?:日|号)?(?:${dateGap}(?:上午|下午|晚上)?${dateGap}\\d{1,2}[:：]\\d{2}(?:${dateGap}[-—–至]${dateGap}\\d{1,2}[:：]\\d{2})?)?(?:以前|之前|前|后)?`,'g');
const splitYearPrefix=new RegExp(`\\d{4}(?:${dateGap}年${dateGap}${dateBreak}${dateGap}|${dateGap}${dateBreak}${dateGap}年${dateGap})(?:在|于)?$`);
const splitDateSuffix=new RegExp(`^${dateBreak}${dateGap}(?:日|号|(?:上午|下午|晚上)?${dateGap}\\d{1,2}[:：]\\d{2})`);
function splitDateBoundary(whole:string,offset:number,length:number):boolean{
 return splitYearPrefix.test(whole.slice(0,offset))||splitDateSuffix.test(whole.slice(offset+length));
}
/** Omit only identical time phrases that already have their own visible fact or task field. */
export function readingSummary(n:Notice):string{
 const supplied=[...noticeOverview(n).times,...n.tasks.map(taskTime),...n.timeline.map(entry=>entry.timeText||(entry.time?formatDate(entry.time):''))];
 const keys=new Set(supplied.flatMap(value=>[...value.matchAll(datePhrase)].filter(match=>!splitDateBoundary(value,match.index,match[0].length)).map(match=>timeKey(match[0]))));
 let omitted=false;
 // Remove the entire emphasis pair only when it contains just a repeated deadline caption.
 // Other emphasized dates retain their wording and balanced Markdown.
 const caption=new RegExp(`(?<![\\\\*_])(\\*\\*|__|\\*|_)(?:报名)?截止(?:时间|日期)?[为是：:]?${dateGap}(${datePhrase.source})\\1(?![*_])`,'g');
 const withoutCaption=n.summary.replace(caption,(value,_mark:string,date:string)=>{
  if(!keys.has(timeKey(date)))return value;
  omitted=true;return '';
 });
 const summary=withoutCaption.replace(new RegExp(`(?:在|于)?${datePhrase.source}`,'g'),(value,offset:number,whole:string)=>{
  // A date fragment adjacent to a line-broken year/day/clock is not a complete duplicate.
  if(splitDateBoundary(whole,offset,value.length))return value;
  // A Markdown emphasis pair must remain balanced; such phrases are left intact.
  if(whole.slice(Math.max(0,offset-2),offset).includes('*')||whole.slice(offset+value.length,offset+value.length+2).includes('*'))return value;
  if(!keys.has(timeKey(value.replace(/^[在于]/,''))))return value;
  omitted=true;return '';
 });
 // Remove a caption left empty by the omitted date, including one between two clauses.
 // An original "报名截止" statement or a relative deadline remains untouched.
 if(!omitted)return summary;
 return summary.replace(/(^|[，,；;])\s*(?:报名)?截止(?:时间|日期)?[为是：:]?\s*(?=[，,；;。.]|$)/g,'$1')
  .replace(/([，,；;])\s*[，,；;]+/g,'$1')
  .replace(/[,，；;]\s*[。.]?\s*$/,'。').replace(/^\s*[,，；;]\s*/,'').replace(/\s+/g,' ').trim();
}
/** Keep useful whole clauses, never a one-line ellipsis or a cut-off audience condition. */
export function summaryPreview(n:Notice):{text:string;full:string;more:boolean}{
 const full=readingSummary(n);
 const clauses=full.match(/[^，；。！？]+[，；。！？]?/g)??[];
 let text='';
 for(const clause of clauses){if(text&&Array.from(text+clause).length>72)break;text+=clause;}
 return {text:text||full,full,more:text!==full};
}
/** Short reading labels only. The expanded reminder still renders its original text. */
export function reminderHeading(text:string):string{
 const plain=plainReadingText(text).replace(/\[([^\]]+)\]\([^\s)]+\)/g,'$1').replace(/https?:\/\/\S+/g,'').trim();
 const conditional=plain.match(/^如需([^请，,；;]{1,8})请/);
 if(conditional)return `${conditional[1]}说明`;
 const book=plain.match(/^《[^》]+》/);
 if(book&&Array.from(book[0]).length<=24)return book[0];
 const clauses=plain.split(/[，,；;。！？\n：:、]/).map(value=>value.trim()).filter(Boolean);
 const first=clauses[0]??'';
 const label=/^(?:附件\s*\d+|参考资料)$/.test(first)?clauses[1]??first:first;
 return Array.from(label.replace(/^(?:请)?(?:各位同学|同学们|大家)[，,：:\s]*/,'')).slice(0,24).join('')||'提醒';
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
