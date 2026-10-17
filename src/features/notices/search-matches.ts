import type {Notice} from '../../domain/types';
import {plainReadingText} from '../../domain/reading';
export interface NoticeSearchMatch {label:string;text:string;path?:string}
/** Show where a result matched, including folded details and the original. */
export function noticeSearchMatches(n:Notice,query:string):NoticeSearchMatch[]{
 const needle=query.trim().toLocaleLowerCase();if(!needle)return [];
 const fields:NoticeSearchMatch[]=[{label:'简介',text:n.summary},{label:'截止',text:n.deadlineText},{label:'笔记',text:n.note}];
 n.tasks.forEach((t,i)=>{const label=`待办 ${i+1}`;fields.push({label,text:t.text,path:`tasks.${i}.text`},{label:`${label} · 对象`,text:t.assignee??''},{label:`${label} · 条件`,text:t.condition??''},{label:`${label} · 时间`,text:t.timeText},{label:`${label} · 地点`,text:t.location??''},{label:`${label} · 笔记`,text:t.note});t.details.forEach(text=>fields.push({label:`${label} · 说明`,text}));t.steps.forEach(step=>{fields.push({label:`${label} · 步骤`,text:step.text},{label:`${label} · 笔记`,text:step.note});step.details.forEach(text=>fields.push({label:`${label} · 说明`,text}));});});
 n.reminders.forEach((r,i)=>fields.push({label:`提醒 ${i+1}`,text:r.text},{label:`提醒 ${i+1} · 笔记`,text:r.note}));
 n.warnings.forEach((text,i)=>fields.push({label:`注意 ${i+1}`,text,path:`warnings.${i}`}));n.materials.forEach(text=>fields.push({label:'材料',text}));
 n.timeline.forEach(t=>fields.push({label:'时间',text:[t.label,t.timeText,t.location].filter(Boolean).join(' ')}));
 fields.push({label:'原文',text:n.originalText});
 const seen=new Set<string>(),out:NoticeSearchMatch[]=[];
 for(const field of fields){const text=plainReadingText(field.text),at=text.toLocaleLowerCase().indexOf(needle);if(at<0||seen.has(text))continue;seen.add(text);const start=Math.max(0,at-24),end=Math.min(text.length,at+needle.length+48);out.push({...field,text:`${start?'…':''}${text.slice(start,end)}${end<text.length?'…':''}`});if(out.length===3)break;}
 return out;
}
