import {parseNotices} from '../domain/notice';
import type {Notice} from '../domain/types';

const COMPOSE='campus-inbox:compose:v2',OLD_DRAFT='campus-inbox:draft:v1';
const OLD_RESULT='campus-inbox:pending-analysis:v1',OLD_EDITOR='campus-inbox:editor-draft:v1:personal';
const RESULT='campus-inbox:legacy-pending:v5',EDIT='campus-inbox:legacy-edit:v5',MIGRATED='campus-inbox:legacy-draft:v5';
export interface ComposerDraft {id:string;text:string;attachments:string[]}
export interface LegacyWork {drafts:ComposerDraft[];records:Notice[];text:string;missingFiles:boolean}
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

/** Keep the original keys. Uncommitted edits are offered for review, never applied to saved notes. */
export function readLegacyWork(local:Store,session:Store):LegacyWork{
 const work:LegacyWork={drafts:[],records:[],text:'',missingFiles:false};
 const pieces:string[]=[];
 try{
  const raw=local.getItem(COMPOSE),value=raw&&raw.length<120000?JSON.parse(raw):null;
  const entries=value?.version===2&&Array.isArray(value.entries)?value.entries:null;
  if(entries?.length&&entries.length<=20&&entries.every((e:unknown)=>!!e&&typeof e==='object'&&typeof (e as {text?:unknown}).text==='string')){
   work.drafts=entries.map((e:{text:string;fileCount?:number})=>({id:crypto.randomUUID(),text:e.text,attachments:[]}));
   work.missingFiles=!local.getItem(MIGRATED)&&entries.some((e:{fileCount?:number})=>!!e.fileCount);
  }else{const text=local.getItem(OLD_DRAFT);if(text&&text.length<=12000)work.drafts=[{id:crypto.randomUUID(),text,attachments:[]}];}
  if(work.drafts.some(d=>d.text))pieces.push(...work.drafts.map((d,i)=>`通知草稿 ${i+1}\n${d.text}`));
 }catch{/* The unchanged old keys remain available for manual recovery. */}
 try{
  const raw=local.getItem(RESULT)||session.getItem(OLD_RESULT),value=raw&&raw.length<=500000?JSON.parse(raw):null;
  if(value?.version===1&&Array.isArray(value.records)){work.records=parseNotices(value.records);local.setItem(RESULT,raw!);}
 }catch{/* Do not replace invalid or unsaved records. */}
 try{
  const raw=local.getItem(EDIT)||session.getItem(OLD_EDITOR),value=raw&&raw.length<=50000?JSON.parse(raw):null;
  if(value?.version===1&&value.values&&typeof value.values==='object'){
   pieces.push(`未保存编辑 · ${value.target?.title||'事项'}\n${JSON.stringify(value.values,null,2)}`);
   local.setItem(EDIT,raw!);
  }
 }catch{/* Keep the source instead of guessing its target. */}
 work.text=pieces.join('\n\n');return work;
}

export function restoreLegacyDraft(local:Store,work:LegacyWork,current:ComposerDraft[]|null):ComposerDraft[]|null{
 if(local.getItem(MIGRATED)||!work.drafts.some(d=>d.text)||current?.some(d=>d.text||d.attachments.length))return current;
 // Persist before marking migration complete; a full device must not lose the original.
 local.setItem('campus-inbox:draft:v5',JSON.stringify(work.drafts));local.setItem(MIGRATED,'done');
 return work.drafts;
}
export function finishLegacyResult(local:Store,session:Store):void{local.removeItem(RESULT);session.removeItem(OLD_RESULT);}
