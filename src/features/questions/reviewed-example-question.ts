import type {Notice} from '../../domain/types';
import {isLocalDemoNotice} from '../../domain/local-demo';
import questions from './reviewed-example-questions.json';

export interface ReviewedExampleQuestion {
 catalogId:string;
 sourceSha256:string;
 contentSha256:string;
 question:string;
 answer:string;
 evidence:string[];
 origin:'human-reviewed-example';
 providerCalled:false;
 manualContentReview:true;
}
export const REVIEWED_EXAMPLE_QUESTIONS:readonly ReviewedExampleQuestion[]=questions as ReviewedExampleQuestion[];

/** Identity checks only use the reviewed source and reading fields. Local
 * notes, attachment bytes, account details and progress never enter a hash. */
export function reviewedQuestionContent(notice:Notice):unknown {
 const {schemaVersion,kind,title,summary,deadline,deadlineText,deadlineSpec,timeline,materials,warnings,sourceRefs,reminderTitles}=notice;
 return {schemaVersion,kind,title,summary,deadline,deadlineText,deadlineSpec,timeline,materials,warnings,sourceRefs,reminderTitles,
  tasks:notice.tasks.map(task=>{
   const {text,assignee,scope,condition,details,time,timeText,location,timeSpec}=task;
   return {text,assignee,scope,condition,details,time,timeText,location,timeSpec,steps:task.steps.map(({text,details})=>({text,details}))};
  }),reminders:notice.reminders.map(reminder=>reminder.text)};
}
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,entry])=>[key,canonical(entry)]));
 return value;
}
async function sha256(text:string):Promise<string> {
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
 return Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function reviewedQuestionContentHash(notice:Notice):Promise<string>{return sha256(JSON.stringify(canonical(reviewedQuestionContent(notice))));}

/** A personal notice with matching text is still personal. Demo clones must
 * retain every reviewed reading field; edited/corrected sources fail closed. */
export async function findReviewedExampleQuestion(notice:Notice):Promise<ReviewedExampleQuestion|null> {
 if(notice.corrections?.values.length||notice.attachments.length)return null;
 const candidates=REVIEWED_EXAMPLE_QUESTIONS.filter(entry=>entry.catalogId===notice.id||isLocalDemoNotice(notice));
 if(!candidates.length)return null;
 try{
  const sourceHash=await sha256(notice.originalText),sameSource=candidates.filter(entry=>entry.sourceSha256===sourceHash);
  if(!sameSource.length)return null;
  const contentHash=await reviewedQuestionContentHash(notice);
  const entry=sameSource.find(entry=>entry.contentSha256===contentHash);
  return entry?{...entry,evidence:[...entry.evidence]}:null;
 }catch{return null;}
}
