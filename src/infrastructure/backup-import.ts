import {MAX_NOTICES,parseBackup} from '../domain/notice';
import type {Notice} from '../domain/types';
import {cleanupFiles,getFile,restoreFiles,validateFiles,type StoredAttachment} from './attachment-store';

interface ImportTarget {
 load():Notice[];
 save(notices:Notice[]):void;
 /** Read fresh references, including drafts, pending jobs and every account's trash. */
 references():readonly Pick<Notice,'attachments'>[];
 isCurrent():boolean;
}
export interface BackupImportResult {added:number;linkedAttachments:number}

// Two explicit imports on the same page cannot race each other into duplicate
// files. Cross-tab notification saves retain the repository's existing CAS check.
let importing:Promise<unknown>=Promise.resolve();
export function importNoticeBackup(data:unknown,target:ImportTarget):Promise<BackupImportResult>{
 const next=importing.catch(()=>{}).then(()=>performImport(data,target));
 importing=next.then(()=>{},()=>{});return next;
}

async function performImport(data:unknown,target:ImportTarget):Promise<BackupImportResult>{
 const assertCurrent=()=>{if(!target.isCurrent())throw new Error('账号已切换，请在当前账号重新导入备份。');};
 assertCurrent();
 const records=parseBackup(data),attachments=(data as {attachments?:unknown}).attachments??[];
 const before=target.load(),beforeIDs=new Set(before.map(notice=>notice.id));
 if(before.length+records.filter(notice=>!beforeIDs.has(notice.id)).length>MAX_NOTICES)throw new Error(`最多保存 ${MAX_NOTICES} 条通知`);
 const reuseIDs=[...new Set(target.references().flatMap(notice=>notice.attachments))];
 let created:string[]=[];
 try{
  const restored=await restoreFiles(attachments,records,reuseIDs);created=restored.ids;assertCurrent();
  // Load after asynchronous file restoration so edits made while decoding the
  // backup remain authoritative, even when this notification ID already exists.
  const current=target.load(),snapshot=JSON.stringify(current),currentIDs=new Set(current.map(notice=>notice.id));
  const incoming=new Map(restored.notices.map(notice=>[notice.id,notice]));
  const original=new Map(records.map(notice=>[notice.id,notice]));
  const files=new Map<string,StoredAttachment|null>(restored.files);
  const lookup=async(id:string)=>{if(!files.has(id))files.set(id,await getFile(id));return files.get(id)!;};
  const next:Notice[]=[];
  for(const notice of current){
   const backup=incoming.get(notice.id);
   if(!backup?.attachments.length){next.push(notice);continue;}
   const oldFiles=await Promise.all(notice.attachments.map(lookup));assertCurrent();
   // A legacy reference whose bytes are missing can be repaired when the backup
   // contains that exact old ID. Unrelated references are never guessed away.
   const links=notice.attachments.map((id,index)=>!oldFiles[index]&&original.get(notice.id)!.attachments.includes(id)?restored.mapping.get(id)??id:id);
   const merged=[...new Set([...links,...backup.attachments])];
   const mergedFiles=await Promise.all(merged.map(lookup));assertCurrent();
   validateFiles(mergedFiles.map(file=>({size:file?.size??0})));
   next.push(JSON.stringify(merged)===JSON.stringify(notice.attachments)?notice:{...notice,attachments:merged});
  }
  const added=restored.notices.filter(notice=>!currentIDs.has(notice.id));next.push(...added);
  if(next.length>MAX_NOTICES)throw new Error(`最多保存 ${MAX_NOTICES} 条通知`);
  assertCurrent();
  // Do not refresh the repository CAS baseline and then write a stale snapshot.
  // The final read must still equal what was used above; save has no intervening await.
  if(JSON.stringify(target.load())!==snapshot)throw new Error('通知已有新修改，请重新导入备份。');
  const existingLinks=new Set(current.flatMap(notice=>notice.attachments));
  const linkedAttachments=new Set(next.flatMap(notice=>notice.attachments).filter(id=>!existingLinks.has(id))).size;
  if(JSON.stringify(next)!==snapshot)target.save(next);
  return {added:added.length,linkedAttachments};
 }catch(issue){
  if(created.length){
   try{await cleanupFiles(created,target.references());}
   catch{throw new Error('备份未能导入，新增附件暂时无法清理；原通知和已有附件仍保留。',{cause:issue});}
  }
  throw issue;
 }
}
