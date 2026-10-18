import type {Notice} from '../../domain/types';
import {plainReadingText} from '../../domain/reading';
export interface NoticeSearchMatch {label:string;text:string;path?:string}
/** Show where a result matched, including folded details and the original. */
export function noticeSearchMatches(n:Notice,query:string):NoticeSearchMatch[]{
 const needle=query.trim().toLocaleLowerCase();if(!needle)return [];
 const fields:NoticeSearchMatch[]=[{label:'简介',text:n.summary,path:'summary'},{label:'截止',text:n.deadlineText,path:'deadlineText'},{label:'笔记',text:n.note,path:'note'}];
 n.tasks.forEach((t,i)=>{const label=`待办 ${i+1}`;fields.push({label,text:t.text,path:`tasks.${i}.text`},{label:`${label} · 对象`,text:t.assignee??'',path:`tasks.${i}.assignee`},{label:`${label} · 条件`,text:t.condition??'',path:`tasks.${i}.condition`},{label:`${label} · 时间`,text:t.timeText,path:`tasks.${i}.timeText`},{label:`${label} · 地点`,text:t.location??'',path:`tasks.${i}.location`},{label:`${label} · 笔记`,text:t.note,path:`tasks.${i}.note`});t.details.forEach((text,j)=>fields.push({label:`${label} · 说明`,text,path:`tasks.${i}.details.${j}`}));t.steps.forEach((step,j)=>{fields.push({label:`${label} · 步骤`,text:step.text,path:`tasks.${i}.steps.${j}.text`},{label:`${label} · 笔记`,text:step.note,path:`tasks.${i}.steps.${j}.note`});step.details.forEach((text,k)=>fields.push({label:`${label} · 说明`,text,path:`tasks.${i}.steps.${j}.details.${k}`}));});});
 n.reminders.forEach((r,i)=>fields.push({label:`提醒 ${i+1}`,text:r.text,path:`reminders.${i}`},{label:`提醒 ${i+1} · 笔记`,text:r.note,path:`reminders.${i}.note`}));
 n.warnings.forEach((text,i)=>fields.push({label:`注意 ${i+1}`,text,path:`warnings.${i}`}));n.materials.forEach((text,i)=>fields.push({label:'材料',text,path:`materials.${i}`}));
 n.timeline.forEach((t,i)=>fields.push({label:'时间',text:[t.label,t.timeText,t.location].filter(Boolean).join(' '),path:`timeline.${i}`}));
 fields.push({label:'原文',text:n.originalText,path:'originalText'});
 const seen=new Set<string>(),out:NoticeSearchMatch[]=[];
 for(const field of fields){const text=plainReadingText(field.text),at=text.toLocaleLowerCase().indexOf(needle);if(at<0||seen.has(text))continue;seen.add(text);const start=Math.max(0,at-24),end=Math.min(text.length,at+needle.length+48);out.push({...field,text:`${start?'…':''}${text.slice(start,end)}${end<text.length?'…':''}`});if(out.length===3)break;}
 return out;
}
