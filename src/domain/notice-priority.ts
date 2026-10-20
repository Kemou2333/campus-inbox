import type {ManualPriority,Notice,TimeSpec} from './types';
import {parseDate} from './notice';
import {timeFromText} from './time';
export const manualPriorities:ReadonlyArray<{value:ManualPriority;label:string;color:'error'|'warning'|'info'|'success'}>=[
 {value:'important-urgent',label:'重要紧急',color:'error'},
 {value:'important',label:'重要',color:'warning'},
 {value:'urgent',label:'紧急',color:'info'},
 {value:'later',label:'稍后',color:'success'},
];
export function setManualPriority(n:Notice,value:ManualPriority|null):Notice{return {...n,manualPriority:value,updatedAt:new Date().toISOString()};}
/** A seven-day calendar window ending today. Creation time never substitutes for notice dates. */
export function inPastSevenDays(n:Notice,now:number):boolean{
 const days:Array<{year:number;month:number;day:number}>=[];
 for(let i=0;i<7;i++){const d=new Date(now);d.setHours(12,0,0,0);d.setDate(d.getDate()-i);days.push({year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate()});}
 const matches=(s:TimeSpec|null|undefined)=>!!s&&s.type!=='relative'&&s.type!=='unknown'&&s.month!==null&&s.day!==null&&days.some(d=>(s.year===null||s.year===d.year)&&s.month===d.month&&s.day===d.day);
 const iso=(value:string|null|undefined)=>{try{if(!value||!parseDate(value))return false;const d=new Date(value);return days.some(k=>k.year===d.getFullYear()&&k.month===d.getMonth()+1&&k.day===d.getDate());}catch{return false;}};
 if(iso(n.localDeadline)||iso(n.deadline)||matches(n.deadlineSpec)||matches(timeFromText(n.deadlineText)))return true;
 return [...n.tasks,...n.timeline].some(t=>iso('localDeadline' in t?t.localDeadline:null)||iso(t.time)||matches(t.timeSpec)||matches(timeFromText(t.timeText)));
}
/** Only actual written date parts become a front-page time badge. Ambiguous phrases stay in details. */
export function compactDateLabel(raw:string,spec?:TimeSpec,iso?:string|null):string{
 let s=spec??timeFromText(raw);
 if((s.month===null||s.day===null)&&iso){try{if(parseDate(iso)){const d=new Date(iso);return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}}catch{/* Invalid input has no badge. */}}
 if(s.type==='relative'||s.type==='unknown'||s.month===null||s.day===null)return '';
 const clock=s.hour===null?'':` ${String(s.hour).padStart(2,'0')}:${String(s.minute??0).padStart(2,'0')}`;
 const range=raw.match(/(?:\d{1,2})[:：]\d{2}\s*[-—–至]\s*(\d{1,2})[:：](\d{2})/);
 const end=range&&Number(range[1])<=24&&Number(range[2])<60?`–${range[1].padStart(2,'0')}:${range[2]}`:'';
 return `${s.month}月${s.day}日${clock}${end}`;
}
