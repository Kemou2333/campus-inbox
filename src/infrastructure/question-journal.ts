import {newID} from '../domain/notice';
import {parseQuestionAnswer,type NoticeQuestionAnswer} from './notice-question-client';
const KEY='campus-inbox:questions:v1';
export interface QuestionRecord {account:string;noticeID:string;sourceHash:string;question:string;requestId:string;result?:NoticeQuestionAnswer;rejectedBeforeAdmission?:boolean}
async function sourceHash(text:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}
function records(storage:Storage):QuestionRecord[]{try{const v=JSON.parse(storage.getItem(KEY)??'[]');return Array.isArray(v)&&v.length<=20?v.filter(r=>r&&typeof r.account==='string'&&typeof r.noticeID==='string'&&/^[a-f0-9]{64}$/.test(r.sourceHash)&&typeof r.question==='string'&&r.question.length<=240&&/^[A-Za-z0-9_-]{16,100}$/.test(r.requestId)):[];}catch{return [];}}
export async function readQuestion(storage:Storage,account:string,noticeID:string,sourceText:string):Promise<QuestionRecord|null>{
 const record=records(storage).find(r=>r.account===account&&r.noticeID===noticeID);if(!record||record.sourceHash!==await sourceHash(sourceText))return null;
 if(record.result){try{return {...record,result:parseQuestionAnswer(record.result,sourceText)};}catch{return {...record,result:undefined};}}return record;
}
function write(storage:Storage,record:QuestionRecord){const remaining=records(storage).filter(r=>r.account!==record.account||r.noticeID!==record.noticeID);storage.setItem(KEY,JSON.stringify([record,...remaining].slice(0,20)));}
/** Persist the intent before dispatch; reopening uses the same ID, never a paid automatic retry. */
export async function prepareQuestion(storage:Storage,account:string,noticeID:string,sourceText:string,question:string):Promise<QuestionRecord>{
 const previous=await readQuestion(storage,account,noticeID,sourceText);if(previous?.question===question.trim()){if(previous.rejectedBeforeAdmission){const next={...previous,rejectedBeforeAdmission:false};write(storage,next);return next;}return previous;}
 const next={account,noticeID,sourceHash:await sourceHash(sourceText),question:question.trim(),requestId:newID()};write(storage,next);return next;
}
export function saveQuestionResult(storage:Storage,record:QuestionRecord,result:NoticeQuestionAnswer){write(storage,{...record,result});}
export function markQuestionRejected(storage:Storage,record:QuestionRecord){write(storage,{...record,rejectedBeforeAdmission:true});}
