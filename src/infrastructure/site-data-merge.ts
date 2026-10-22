import {parseNotices} from '../domain/notice';
import {migrateLegacy,NOTICE_KEY,LEGACY_NOTICE_KEY} from './legacy-migration';

export type SiteStorage=Record<string,string>;
export const isSiteKey=(key:string)=>key.startsWith('campus-inbox:')&&!key.startsWith('campus-inbox:site-transfer:');
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

function mergeValues(current:unknown,incoming:unknown,previous:unknown,drafts=false,fileSizes:Record<string,number>={}):unknown{
 if(same(incoming,previous))return current;
 if(current===undefined)return incoming;
 if(Array.isArray(current)&&Array.isArray(incoming)){
  const result=[...current],old=Array.isArray(previous)?previous:[];
  for(const entry of incoming){
   if(object(entry)&&typeof entry.id==='string'){
    const before=old.find(value=>object(value)&&value.id===entry.id);
    if(same(entry,before))continue;
    const index=result.findIndex(value=>object(value)&&value.id===entry.id);
    if(index<0){result.push(entry);continue;}
    if(same(result[index],entry))continue;
    if(drafts){if(entry.text||(Array.isArray(entry.attachments)&&entry.attachments.length))result.push({...entry,id:crypto.randomUUID()});continue;}
    const left=result[index] as Record<string,unknown>;
    const sourceNewer=typeof entry.updatedAt==='string'&&typeof left.updatedAt==='string'&&entry.updatedAt>left.updatedAt;
    if(entry.schemaVersion===5&&left.schemaVersion===5&&Array.isArray(entry.attachments)&&Array.isArray(left.attachments)){
     const files=[...new Set([...left.attachments,...entry.attachments])] as string[],winner=sourceNewer?entry:left;
     if(files.length<=10&&files.reduce((sum,id)=>sum+(fileSizes[id]??0),0)<=20*1024*1024)result[index]={...winner,attachments:files};
     else {
      const other=structuredClone(sourceNewer?left:entry);other.id=crypto.randomUUID();other.title=String(other.title).slice(0,64)+'（另一份附件）';
      if(Array.isArray(other.tasks))other.tasks=other.tasks.map(task=>{const copy:Record<string,unknown>={...(task as Record<string,unknown>),id:crypto.randomUUID()};if(Array.isArray(copy.steps))copy.steps=copy.steps.map((step:Record<string,unknown>)=>({...step,id:crypto.randomUUID()}));return copy;});
      if(Array.isArray(other.reminders))other.reminders=other.reminders.map(reminder=>({...reminder,id:crypto.randomUUID()}));
      result[index]=winner;result.push(other);
     }
    }else if(sourceNewer)result[index]=entry;
   }else if(!result.some(value=>same(value,entry)))result.push(entry);
  }
  return drafts?result.filter(value=>!object(value)||!!value.text||(Array.isArray(value.attachments)&&value.attachments.length)):result;
 }
 if(object(current)&&object(incoming)){
  const result={...current};for(const [key,value] of Object.entries(incoming))result[key]=mergeValues(current[key],value,object(previous)?previous[key]:undefined,false,fileSizes);
  return result;
 }
 // Incompatible scalar preferences keep the established destination choice.
 // Both complete originals are archived locally before any write.
 return current;
}

export function normalizedSiteStorage(storage:SiteStorage):SiteStorage{
 const result={...storage};
 if(!result[NOTICE_KEY]&&result[LEGACY_NOTICE_KEY])result[NOTICE_KEY]=JSON.stringify({version:5,revision:1,notices:migrateLegacy(JSON.parse(result[LEGACY_NOTICE_KEY]))});
 return result;
}

export function planSiteMerge(target:SiteStorage,source:SiteStorage,previous:SiteStorage={},fileSizes:Record<string,number>={}):SiteStorage{
 const oldAccount=source['campus-inbox:account-username:v1']?.trim().toLowerCase(),currentAccount=target['campus-inbox:account-username:v1']?.trim().toLowerCase();
 if(oldAccount&&currentAccount&&oldAccount!==currentAccount)throw new Error('两个网址登录了不同账号。原数据已保留，请先使用同一个账号再合并。');
 const incoming=normalizedSiteStorage(source),last=normalizedSiteStorage(previous),changes:SiteStorage={};
 for(const [key,raw] of Object.entries(incoming)){
  if(!isSiteKey(key)||raw===last[key]||raw===target[key])continue;
  const current=target[key];
  if(current===undefined){changes[key]=raw;continue;}
  if(key==='campus-inbox:tutorial:v2'||key==='campus-inbox:first-entry:v1'){if(raw==='seen')changes[key]='seen';continue;}
  // Session CAS metadata is one coherent object, never merge cursors/hashes
  // from two sessions. The existing destination session takes precedence.
  if(key.startsWith('campus-inbox:sync:v1:'))continue;
  try{
   const value=JSON.parse(raw),present=JSON.parse(current),before=last[key]===undefined?undefined:JSON.parse(last[key]);
   if(key===NOTICE_KEY){
    if(!object(value)||!object(present)||value.version!==5||present.version!==5)throw Error('format');
    const notices=mergeValues(parseNotices(present.notices),parseNotices(value.notices),object(before)?before.notices:undefined,false,fileSizes);
    parseNotices(notices);changes[key]=JSON.stringify({...present,revision:Number(present.revision)+1,notices});
   }else if(key==='campus-inbox:notices:local-demo:v1'){
    const notices=mergeValues(parseNotices(present),parseNotices(value),before,false,fileSizes);parseNotices(notices);changes[key]=JSON.stringify(notices);
   }else changes[key]=JSON.stringify(mergeValues(present,value,before,key==='campus-inbox:draft:v5'));
  }catch(error){
   // Invalid primary notification stores must not be silently replaced.
   if(key===NOTICE_KEY||key==='campus-inbox:notices:local-demo:v1')throw error;
  }
 }
 return changes;
}
