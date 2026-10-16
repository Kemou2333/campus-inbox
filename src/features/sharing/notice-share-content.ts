import type {Notice} from '../../domain/types';
import type {ShareTextBlock,ShareTaskState,ShareTextTone} from '../../domain/share-image';
import {plainReadingText} from '../../domain/reading';
import {effectiveNotice} from '../../domain/corrections';
import {displayTime,extraTimeline,noticeOverview,readingSummary,sameHeadlineTime,taskTime} from '../notices/notice-overview';
import {reminderReadingTitle} from '../notices/reminder-reading';
import {taskAudience} from '../../domain/notice';

function text(value:string){return plainReadingText(value).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'$1（$2）').trim();}
/** Explicit allowlist: never traverse originalText, notes, attachments, source
 * references, IDs or account data. Personal content is not anonymized. */
export function noticeShareBlocks(record:Notice,details:boolean):ShareTextBlock[]{
 const n=effectiveNotice(record),overview=noticeOverview(n),blocks:ShareTextBlock[]=[];
 const add=(kind:ShareTextBlock['kind'],value:string,state?:ShareTaskState,tone?:ShareTextTone)=>{const plain=text(value);if(plain)blocks.push({kind,text:plain,...(state?{state}:{}),...(tone?{tone}:{})});};
 const timeLabel=(value:string,deadline=false)=>deadline?`截止：${value.replace(/^(?:报名)?截止(?:时间|日期)?[：:]?\s*/,'')}`:/^(?:报名)?截止/.test(value)?value:`时间：${value}`;
 add('title',n.title);const summary=readingSummary(n);if(text(summary)!==text(n.title))add('summary',summary);
 if(n.dismissed)add('fact','不适用');else if(n.completed)add('fact',n.kind==='task'?'已完成':'已知悉',undefined,'accent');
 if(overview.audiences.length===1)add('fact',`适用：${overview.audiences[0]}`);
 for(const time of overview.times)add('fact',timeLabel(displayTime(time),!!(n.localDeadline||n.deadlineText||n.deadline)),undefined,'time');
 if(overview.locations.length===1)add('fact',`地点：${overview.locations[0]}`);
 if(n.tasks.length)add('heading','待办',undefined,'accent');
 n.tasks.forEach(task=>{
  add('task',task.text,task.dismissed?'dismissed':task.completed?'completed':'pending');
  const audience=taskAudience(task),roleCondition=task.scope==='role'&&task.condition?`；${task.condition}`:'';
  if(overview.audiences.length!==1)add('detail',`适用：${audience}${roleCondition}`);
  const time=taskTime(task);if(time&&!sameHeadlineTime(time,n))add('fact',timeLabel(displayTime(time)),undefined,'time');
  if(task.location&&overview.locations.length!==1)add('fact',`地点：${task.location}`);
  if(details){
   task.details.forEach(value=>add('detail',value));
   task.steps.forEach((step,index)=>{add('step',`${index+1}. ${step.text}`,task.dismissed?'dismissed':step.completed?'completed':'pending');step.details.forEach(value=>add('detail',value));});
  }
 });
 if(n.reminders.length){add('heading','提醒',undefined,'reminder');n.reminders.forEach((reminder,index)=>add('body',details?reminder.text:reminderReadingTitle({text:reminder.text,title:n.reminderTitles?.[index]},index),undefined,'reminder'));}
 if(details){
  const timeline=extraTimeline(n);if(timeline.length){add('heading','时间安排',undefined,'time');for(const entry of timeline)add('body',[entry.label,displayTime(entry.timeText||entry.time||''),entry.location].filter(Boolean).join(' · '),undefined,'time');}
  for(const [heading,values] of [['材料',n.materials],['注意',n.warnings]] as const){if(values.length){const tone=heading==='注意'?'warning':'accent';add('heading',heading,undefined,tone);values.forEach(value=>add('body',`• ${value}`,undefined,tone));}}
 }
 return blocks;
}
