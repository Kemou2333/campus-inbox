import type {Notice, NoticeAnalysis} from './types';
import {timeFromText,timeSpecToISO} from './time';
import {parseCorrections as sharedParseCorrections} from '../../server/contracts/source-evidence.js';

export interface TextField {path:string;label:string;value:string;max:number;allowEmpty:boolean;choices?:{value:string;label:string}[]}
/** Only named prose fields may be corrected. IDs, dates, state and source cannot be edited here. */
export function noticeTextFields(n:NoticeAnalysis|Notice):TextField[]{
 const result:TextField[]=[];
 function add(path:string,label:string,value:string|null|undefined,max=2000,allowEmpty=false){
  if(value!==undefined)result.push({path,label,value:value??'',max,allowEmpty});
 }
 add('title','标题',n.title,200);add('summary','简介',n.summary,2000);
 add('deadlineText','截止描述',n.deadlineText,500,true);
 n.tasks.forEach((t,i)=>{
  const prefix=`tasks.${i}`,label=`待办 ${i+1}`;
  add(`${prefix}.text`,`${label} · 标题`,t.text,2000);
  result.push({path:`${prefix}.scope`,label:`${label} · 适用范围`,value:t.scope,max:11,allowEmpty:false,choices:[{value:'all',label:'全体同学'},{value:'conditional',label:'符合条件的同学'},{value:'role',label:'指定对象'},{value:'unspecified',label:'对象待确认'}]});
  add(`${prefix}.assignee`,`${label} · 对象`,t.assignee,80,true);
  add(`${prefix}.condition`,`${label} · 条件`,t.condition,120,true);
  add(`${prefix}.timeText`,`${label} · 时间`,t.timeText,500,true);
  add(`${prefix}.location`,`${label} · 地点`,t.location,500,true);
  t.details.forEach((value,j)=>add(`${prefix}.details.${j}`,`${label} · 说明 ${j+1}`,value));
  t.steps.forEach((step,j)=>{
   add(`${prefix}.steps.${j}.text`,`${label} · 步骤 ${j+1}`,step.text,60);
   step.details.forEach((value,k)=>add(`${prefix}.steps.${j}.details.${k}`,`${label} · 步骤 ${j+1}说明 ${k+1}`,value,500));
  });
 });
 n.timeline.forEach((t,i)=>{
  add(`timeline.${i}.label`,`时间 ${i+1} · 标题`,t.label,200);
  add(`timeline.${i}.timeText`,`时间 ${i+1} · 日期`,t.timeText,500,true);
  add(`timeline.${i}.location`,`时间 ${i+1} · 地点`,t.location,500,true);
 });
 for(const group of ['materials','warnings'] as const)n[group].forEach((value,i)=>add(`${group}.${i}`,`${group==='materials'?'材料':'注意'} ${i+1}`,value));
 n.reminders.forEach((r,i)=>add(`reminders.${i}`,`提醒 ${i+1}`,typeof r==='string'?r:r.text));
 n.reminderTitles?.forEach((value,i)=>add(`reminderTitles.${i}`,`提醒 ${i+1} · 标题`,value,16));
 return result;
}
export function textField(n:NoticeAnalysis|Notice,path:string){return noticeTextFields(n).find(field=>field.path===path);}

export function parseCorrections(value:unknown,n:Notice):Notice['corrections']{
 return sharedParseCorrections(value,n);
}
/** The persisted AI record is never replaced. This copy is for reading/search only. */
export function effectiveNotice(n:Notice):Notice{
 if(!n.corrections?.values.length)return n;
 const out=structuredClone(n);
 for(const {path,value} of n.corrections.values){
  if(!textField(n,path))continue;
  const parts=path.split('.');let target:Record<string,unknown>|unknown[]=out as unknown as Record<string,unknown>;
  if(parts[0]==='reminders'&&parts.length===2){out.reminders[Number(parts[1])].text=value;continue;}
  for(const part of parts.slice(0,-1))target=(target as Record<string,unknown>)[part] as Record<string,unknown>;
  (target as Record<string,unknown>)[parts.at(-1)!]=value;
 }
 const edited=new Set(n.corrections.values.map(v=>v.path));
 if(edited.has('deadlineText')){out.deadlineSpec=timeFromText(out.deadlineText);out.deadline=timeSpecToISO(out.deadlineSpec);}
 out.tasks.forEach((t,i)=>{if(edited.has(`tasks.${i}.timeText`)){t.timeSpec=timeFromText(t.timeText);t.time=timeSpecToISO(t.timeSpec);}});
 out.timeline.forEach((t,i)=>{if(edited.has(`timeline.${i}.timeText`)){t.timeSpec=timeFromText(t.timeText);t.time=timeSpecToISO(t.timeSpec);}});
 return out;
}
export function setCorrections(n:Notice,values:{path:string;value:string}[]):Notice{
 const now=new Date().toISOString(),corrections=parseCorrections({updatedAt:now,values},n);
 return {...n,updatedAt:now,corrections};
}
export function restoreAIContent(n:Notice):Notice{
 const {corrections:_,...original}=n;return {...original,updatedAt:new Date().toISOString()};
}
