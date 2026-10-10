import {useEffect, useRef, useState} from 'react';
import {createLocalRepository} from '../infrastructure/local-repository';
import {createCloudSync, type CloudSync, type SyncState} from '../infrastructure/sync-client';
import {createAuthClient, type AuthClient, type AuthSession, type AuthOptions} from '../infrastructure/auth-client';
import {AnalysisError,type AnalyzeOptions} from '../infrastructure/ai-client';
import {AnalysisJobsClient,AnalysisJobJournal,submitAnalysisJob,withoutSubmittedDrafts,attachJobFiles,pendingAnalysisFiles,type AnalysisJob,type LocalAnalysisSubmission} from '../infrastructure/analysis-jobs';
import {addFiles, cleanupFiles, exportFiles, getFile, restoreFiles, MAX_NOTICE_FILES, MAX_NOTICE_FILE_BYTES} from '../infrastructure/attachment-store';
import {createNotice, exportBackup, exportTextBackup, newID, parseAnalysisBatch, parseBackup, parseNotices} from '../domain/notice';
import {mergeExamples} from '../domain/examples';
import type {Notice} from '../domain/types';
import {createPlatform, type PlatformCapabilities} from '../platform';
import {loadConfig, type RuntimeConfig} from './config';
import {readLegacyWork,restoreLegacyDraft,finishLegacyResult} from '../infrastructure/legacy-work';
import type {ThemePreference} from './theme';

export interface Draft {id:string; text:string; attachments:string[]}
export interface DraftSelection {start:number;end:number;expectedText:string}
export interface Toast {id:number; text:string; undo?:()=>void}
const DRAFT_KEY='campus-inbox:draft:v5';
const RESULT_KEY='campus-inbox:pending-analysis:v5';
const USERNAME_KEY='campus-inbox:account-username:v1';
const makeDraft=():Draft=>({id:newID(),text:'',attachments:[]});
const message=(e:unknown)=>e instanceof Error?e.message:'操作未完成，请重试。';
const initialSync:SyncState={connected:false,status:'disconnected',lastSyncedAt:null,error:null,pendingChanges:0,hasMore:false,conflicts:[]};

/** Business operations live here; presentation components do not write storage or call AI. */
export function useCampus(options:Pick<AnalyzeOptions,'onHumanVerification'>={}){
 const [platform]=useState(createPlatform);
 const [repository]=useState(createLocalRepository);
 const [boot]=useState(()=>{try{return {notices:repository.load(),error:''};}catch(e){return {notices:[] as Notice[],error:message(e)};}});
 const [notices,setNotices]=useState(boot.notices);
 const [error,setError]=useState(boot.error);
 const [config,setConfig]=useState<RuntimeConfig|null>(null);
 const [capabilities,setCapabilities]=useState<PlatformCapabilities|null>(null);
 const [cloud,setCloud]=useState<CloudSync|null>(null);
 const [auth,setAuth]=useState<AuthClient|null>(null);
 const [authOptions,setAuthOptions]=useState<AuthOptions|null>(null);
 const [email,setEmail]=useState<string|null>(null);
 const [sync,setSync]=useState(initialSync);
 const [username,setUsername]=useState(()=>localStorage.getItem(USERNAME_KEY)||'');
 const [theme,setThemeState]=useState<ThemePreference>(()=>{
  const t=localStorage.getItem('campus-inbox:theme:v5');return t==='dark'||t==='light'?t:'system';
 });
 const [legacyWork]=useState(()=>readLegacyWork(localStorage,sessionStorage));
 const [legacyRecords,setLegacyRecords]=useState(legacyWork.records);
 const [legacyMissingFiles,setLegacyMissingFiles]=useState(legacyWork.missingFiles);
 const [drafts,setDrafts]=useState<Draft[]>(()=>{
  try{const value=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
   const current=Array.isArray(value)&&value.length&&value.length<=20&&value.every(d=>typeof d.id==='string'&&typeof d.text==='string'&&Array.isArray(d.attachments)&&d.attachments.every((a:unknown)=>typeof a==='string'))?value:null;
   const restored=restoreLegacyDraft(localStorage,legacyWork,current);if(restored)return restored;
  }catch{/* An unusable draft is not a notification backup. */}
  return [makeDraft()];
 });
 const [busy,setBusy]=useState(false);
 const [stage,setStage]=useState('');
 const [retryAt,setRetryAt]=useState(0);
 const [toast,setToast]=useState<Toast|null>(null);
 const [pending,setPending]=useState(()=>!!localStorage.getItem(RESULT_KEY));
 const [latestAddedID,setLatestAddedID]=useState<string|null>(null);
 const [analysisJobs,setAnalysisJobs]=useState<AnalysisJob[]>([]);
 const [unconfirmedSubmissions,setUnconfirmedSubmissions]=useState<LocalAnalysisSubmission[]>([]);
 const [jobStatusError,setJobStatusError]=useState('');
 const [jobAccount,setJobAccount]=useState<string|null>(null);
 const jobAccountRef=useRef<string|null>(null);
 const jobGeneration=useRef(0);
 const jobReads=useRef<AbortController|null>(null);
 const jobRefresh=useRef<{generation:number;promise:Promise<void>}|null>(null);
 const jobRefreshRerun=useRef(false);
 const jobNextPoll=useRef(0);
 const jobSeenCompleted=useRef(new Set<string>());
 const resultRef=useRef<{sources:Draft[];result:unknown}|null>(null);
 const abort=useRef<AbortController|null>(null);
 const analyzing=useRef(false);
 const attaching=useRef(new Set<string>());
 const draftRef=useRef(drafts);draftRef.current=drafts;
 const noticeRef=useRef(notices);noticeRef.current=notices;
 const draftWriteError=useRef(false);
 const receivingShare=useRef(false);

 function tell(text:string,undo?:()=>void){setToast({id:Date.now(),text,undo});}
 function report(e:unknown){setError(message(e));}
 function activateJobAccount(account:string|null){jobGeneration.current++;jobReads.current?.abort();jobAccountRef.current=account;jobNextPoll.current=0;jobRefreshRerun.current=false;jobSeenCompleted.current.clear();setJobAccount(account);setAnalysisJobs([]);setUnconfirmedSubmissions([]);setJobStatusError('');}
 function setTheme(value:ThemePreference){localStorage.setItem('campus-inbox:theme:v5',value);setThemeState(value);}
 function save(next:Notice[]){repository.save(next);setNotices(next);}
 function update(id:string,change:(n:Notice)=>Notice){
  try{const current=repository.load();const before=current.find(n=>n.id===id);if(!before){tell('这条通知已在其他设备上移除。');return;}
   const after=change(before);save(current.map(n=>n.id===id?after:n));return {before,after};
  }catch(e){report(e);}
 }
 function undoChange(before:Notice,after:Notice|null,position?:number){
  try{const current=repository.load(),found=current.find(n=>n.id===before.id);
   if(after?JSON.stringify(found)!==JSON.stringify(after):!!found){tell('这条通知已有新修改，无法撤销旧操作。');return;}
   const restored={...before,updatedAt:new Date().toISOString()};
   if(after)save(current.map(n=>n.id===before.id?restored:n));
   else{const next=[...current];next.splice(Math.min(position??next.length,next.length),0,restored);save(next);}
   tell('已撤销');
  }catch(e){report(e);}
 }
 function remove(id:string){
  try{const current=repository.load(),position=current.findIndex(n=>n.id===id),before=current[position];if(!before)return;
   save(current.filter(n=>n.id!==id));tell('已删除',()=>undoChange(before,null,position));
  }catch(e){report(e);}
 }
 function act(id:string,change:(n:Notice)=>Notice,text:string){const result=update(id,change);if(result)tell(text,()=>undoChange(result.before,result.after));}

 useEffect(()=>repository.subscribe(setNotices),[repository]);
 useEffect(()=>{let alive=true;void loadConfig(platform.kind==='android').then(value=>{if(alive)setConfig(value);});
  void platform.ready.then(value=>{if(alive)setCapabilities(value);}).catch(report);
  return()=>{alive=false;platform.dispose();abort.current?.abort();jobGeneration.current++;jobReads.current?.abort();};
 },[platform]);
 useEffect(()=>{try{localStorage.setItem(DRAFT_KEY,JSON.stringify(drafts));draftWriteError.current=false;}
  catch(e){if(!draftWriteError.current){report(e);draftWriteError.current=true;}}
 },[drafts]);
 useEffect(()=>{
  if(!config||boot.error)return;
  let c:CloudSync;
  try{c=createCloudSync(repository,config.syncEndpoint);}catch(e){report(e);return;}
  const a=createAuthClient(config.syncEndpoint);setCloud(c);setAuth(a);
  const unsubscribe=c.subscribe(setSync);
  let alive=true;
  void a.options().then(value=>{if(alive)setAuthOptions(value);}).catch(()=>{if(alive)setAuthOptions({emailEnabled:false,inviteEnabled:true,domains:[]});});
  const key=c.getKey();
  if(key)void a.status(key).then(status=>{if(!alive||c.getKey()!==key)return;if(status){setUsername(status.username);setEmail(status.email??null);localStorage.setItem(USERNAME_KEY,status.username);activateJobAccount(status.username);void c.syncNow();}
   else {activateJobAccount(null);c.disconnect();tell('登录已过期，请重新登录。');}
  }).catch(()=>{/* Offline work remains available; server authenticates every request. */});
  return()=>{alive=false;unsubscribe();};
 },[config,repository,boot.error]);
 useEffect(()=>{
  if(!cloud||!sync.connected)return;
  const kick=()=>{if(document.visibilityState==='visible')void cloud.syncNow();};
  const timer=setInterval(kick,20_000);window.addEventListener('online',kick);window.addEventListener('focus',kick);document.addEventListener('visibilitychange',kick);
  return()=>{clearInterval(timer);window.removeEventListener('online',kick);window.removeEventListener('focus',kick);document.removeEventListener('visibilitychange',kick);};
 },[cloud,sync.connected]);
 useEffect(()=>{if(!cloud||!sync.connected)return;const timer=setTimeout(()=>void cloud.syncNow(),700);return()=>clearTimeout(timer);},[notices,cloud,sync.connected]);

 useEffect(()=>{
  if(!cloud||!config||!jobAccount||!sync.connected)return;
  const kick=()=>{if(document.visibilityState==='visible')void refreshAnalysisJobs();};
  const poll=()=>{if(Date.now()>=jobNextPoll.current)kick();};
  kick();const timer=setInterval(poll,5_000);window.addEventListener('online',kick);window.addEventListener('focus',kick);document.addEventListener('visibilitychange',kick);
  return()=>{clearInterval(timer);window.removeEventListener('online',kick);window.removeEventListener('focus',kick);document.removeEventListener('visibilitychange',kick);jobReads.current?.abort();};
 },[cloud,config,jobAccount,sync.connected]);

 async function login(session:AuthSession){
  if(!cloud)throw new Error('同步服务尚未准备好。');
  activateJobAccount(session.username);
  setUsername(session.username);setEmail(session.email??null);localStorage.setItem(USERNAME_KEY,session.username);
  await cloud.connect(session.key);tell('已登录，通知会自动同步。');
 }
 async function bindEmail(challengeId:string,code:string){
  const key=cloud?.getKey();if(!key||!auth)throw new Error('请先登录原账号。');
  const status=await auth.bindEmail(challengeId,code,key);setEmail(status.email??null);tell('已绑定邮箱');
 }
 async function logout(){
  const key=cloud?.getKey();
  // Revoke first. A network failure must not leave a supposedly revoked session usable.
  if(key&&auth)await auth.logout(key);
  activateJobAccount(null);abort.current?.abort();cloud?.disconnect();setEmail(null);tell('已退出，本机通知仍然保留。');
 }
 function replaceDrafts(next:Draft[]){draftRef.current=next;setDrafts(next);}
 function fileReferences(draftList=draftRef.current){return [...noticeRef.current,...draftList.map(d=>({attachments:d.attachments}) as Notice),{attachments:pendingAnalysisFiles()} as Notice];}
 function changeDraft(id:string,text:string){replaceDrafts(draftRef.current.map(d=>d.id===id?{...d,text}:d));}
 function pasteDraft(id:string,text:string){const target=draftRef.current.find(d=>d.id===id);if(!target||target.text||busy){tell('输入框已有内容，请新建通知后再粘贴。');return;}changeDraft(id,text);}
 function insertDraft(id:string,text:string,selection?:DraftSelection){
  const target=draftRef.current.find(d=>d.id===id);if(!target||busy||analyzing.current)throw new Error('这条草稿暂时不能粘贴。');
  if(selection&&target.text!==selection.expectedText)throw new Error('原文已改变，请重新粘贴。');
  const start=selection?Math.min(Math.max(selection.start,0),target.text.length):target.text.length;
  const end=selection?Math.min(Math.max(selection.end,start),target.text.length):start;
  changeDraft(id,target.text.slice(0,start)+(!selection&&target.text&&text?'\n':'')+text+target.text.slice(end));
 }
 function addDraft(text=''){if(draftRef.current.length>=20){tell('一次最多整理 20 条通知。');return;}replaceDrafts([...draftRef.current,{...makeDraft(),text}]);}
 async function attach(id:string,files:File[]){
  const target=draftRef.current.find(d=>d.id===id);if(!target||busy||analyzing.current)throw new Error('当前不能保存附件，请稍后重试。');
  if(attaching.current.has(id))throw new Error('附件正在保存，请稍后再添加。');
  attaching.current.add(id);
  try{
  if(target.attachments.length+files.length>MAX_NOTICE_FILES)throw new Error(`每条通知最多 ${MAX_NOTICE_FILES} 个附件。`);
  const existing=await Promise.all(target.attachments.map(getFile));
  if(existing.reduce((n,f)=>n+(f?.size??0),0)+files.reduce((n,f)=>n+f.size,0)>MAX_NOTICE_FILE_BYTES)throw new Error('每条通知的附件总大小最多 20 MB。');
  const ids=await addFiles(files);const current=draftRef.current;
  if(!current.some(d=>d.id===id)){await cleanupFiles(ids,fileReferences(current));throw new Error('草稿已移除，附件没有保存。');}
  replaceDrafts(current.map(d=>d.id===id?{...d,attachments:[...d.attachments,...ids]}:d));
  }finally{attaching.current.delete(id);}
 }
 async function detach(draftID:string,fileID:string){
  const next=draftRef.current.map(d=>d.id===draftID?{...d,attachments:d.attachments.filter(id=>id!==fileID)}:d);replaceDrafts(next);
  await cleanupFiles([fileID],fileReferences(next));
 }
 async function removeDraft(id:string){
  const current=draftRef.current,index=current.findIndex(d=>d.id===id),removed=current[index];if(!removed)return;
  const next=current.filter(d=>d.id!==id),final=next.length?next:[makeDraft()],placeholder=next.length?null:final[0].id;replaceDrafts(final);
  if(removed.text||removed.attachments.length)tell('已移除草稿',()=>{
   const live=draftRef.current.filter(d=>d.id!==placeholder||d.text.trim()||d.attachments.length);
   if(live.some(d=>d.id===removed.id))return;
   if(live.length>=20){tell('草稿已满，先移除一条再恢复。');return;}
   live.splice(Math.min(index,live.length),0,removed);replaceDrafts(live);tell('已恢复草稿');
  });
  // Give undo time to restore the same files; do not delete a restored attachment.
  if(removed.attachments.length)setTimeout(()=>{try{void cleanupFiles(removed.attachments,fileReferences()).catch(report);}catch(e){report(e);}},20_000);
 }
 function consumeJobDrafts(sources:Draft[]){
  const remaining=withoutSubmittedDrafts(draftRef.current,sources),next=remaining.length?remaining:[makeDraft()];
  // Persist before acknowledging the clear, so closing immediately cannot offer the same paid submission again.
  localStorage.setItem(DRAFT_KEY,JSON.stringify(next));replaceDrafts(next);
 }
 function jobContext(){
  const key=cloud?.getKey(),account=jobAccountRef.current;
  if(!cloud||!config||!key||!account)throw new Error('请先登录，再使用 AI 整理。');
  const generation=jobGeneration.current;
  return {key,account,generation,cloud,journal:new AnalysisJobJournal(config.apiEndpoint,account),client:new AnalysisJobsClient(config.apiEndpoint),current:()=>generation===jobGeneration.current&&key===cloud.getKey()&&account===jobAccountRef.current};
 }
 function refreshAnalysisJobs():Promise<void>{
  let context:ReturnType<typeof jobContext>;try{context=jobContext();}catch{return Promise.resolve();}
  if(jobRefresh.current?.generation===context.generation){jobRefreshRerun.current=true;return jobRefresh.current.promise;}
  const controller=new AbortController();jobReads.current=controller;
  const promise=(async()=>{
   try{
    const local=context.journal.all(),unknown=new Set(local.filter(s=>!s.jobId).map(s=>s.requestId));
    const jobs=new Map<string,AnalysisJob>();let before:string|undefined;
    // ACK loss can be recovered across page reloads without another model request.
    for(let page=0;page<5;page++){
     const reply=await context.client.list(context.key,before,controller.signal);if(!context.current())return;
     for(const job of reply.jobs){jobs.set(job.id,job);unknown.delete(job.requestId);}
     if(!unknown.size||!reply.hasMore)break;before=reply.nextBefore;
    }
    for(const submission of context.journal.all()){
     let job=[...jobs.values()].find(j=>j.requestId===submission.requestId);
     if(!job&&submission.jobId){try{job=await context.client.read(context.key,submission.jobId,controller.signal);if(!context.current())return;jobs.set(job.id,job);}catch(e){if(e instanceof AnalysisError&&e.status===404)continue;throw e;}}
     if(!job)continue;
     if(submission.jobId&&submission.jobId!==job.id)throw new Error('云端整理记录不一致，请保留原文。');
     if(!submission.jobId){submission.jobId=job.id;context.journal.put(submission);consumeJobDrafts(submission.sources);}
    }
    if(!context.current())return;
    const visible=[...jobs.values()].filter(j=>j.status==='accepted'||j.status==='running'||j.status==='failed'&&!context.journal.dismissed(j.id));
    const unconfirmed=context.journal.all().filter(s=>!s.jobId);
    setAnalysisJobs(visible);setUnconfirmedSubmissions(unconfirmed);setJobStatusError('');
    jobNextPoll.current=Date.now()+(visible.some(j=>j.status==='accepted'||j.status==='running')||unconfirmed.length?5_000:30_000);
    const completed=[...jobs.values()].filter(j=>j.status==='completed');
    if(completed.some(j=>!jobSeenCompleted.current.has(j.id)||context.journal.all().some(s=>s.requestId===j.requestId))){
     const state=await context.cloud.syncNow();if(!context.current())return;
     // Failed or partial sync keeps the local attachment intent for the next read.
     if(state.status==='idle'&&!state.hasMore){
      for(const submission of context.journal.all()){
       const job=completed.find(j=>j.requestId===submission.requestId);if(!job)continue;
       const detail=await context.client.read(context.key,job.id,controller.signal);if(!context.current())return;
       const current=repository.load(),next=attachJobFiles(current,detail,submission);
       if(JSON.stringify(next)!==JSON.stringify(current))save(next);
       const first=detail.noticeIds.find(id=>next.some(n=>n.id===id));if(first)setLatestAddedID(first);
       context.journal.remove(submission.requestId);
      }
      for(const job of completed)jobSeenCompleted.current.add(job.id);
     }
    }
   }catch(e){
    if(!context.current()||controller.signal.aborted)return;
    if(e instanceof AnalysisError&&e.code==='AUTH_REQUIRED'){activateJobAccount(null);context.cloud.disconnect();}
    else setJobStatusError(message(e));
    jobNextPoll.current=Date.now()+5_000;
   }
  })().finally(()=>{
   if(jobRefresh.current?.promise===promise){jobRefresh.current=null;if(jobRefreshRerun.current&&context.current()){jobRefreshRerun.current=false;void refreshAnalysisJobs();}}
   if(jobReads.current===controller)jobReads.current=null;
  });
  jobRefresh.current={generation:context.generation,promise};return promise;
 }
 async function restoreAnalysisJob(jobID:string){
  const context=jobContext(),job=await context.client.read(context.key,jobID);if(!context.current())return;
  if(job.status!=='failed')throw new Error('这次整理仍在进行或已经保存，请先查看通知。');
  if(job.recoverableResult)throw new Error('整理结果已生成，请直接保存结果，无需再次整理。');
  const submission=context.journal.all().find(s=>s.requestId===job.requestId);
  const sources=job.sources!.map((s,i)=>{
   const local=submission?.sources[i];return local?.text.trim()===s.text.trim()?structuredClone(local):{...makeDraft(),text:s.text};
  });
  const current=draftRef.current.filter(d=>d.text.trim()||d.attachments.length),next=[...current];
  for(const source of sources){
   if(next.some(d=>d.id===source.id&&d.text===source.text&&JSON.stringify(d.attachments)===JSON.stringify(source.attachments)))continue;
   next.push(next.some(d=>d.id===source.id)?{...source,id:newID()}:source);
  }
  if(next.length>20)throw new Error('草稿已满，请先移除一条，再恢复原文。');
  localStorage.setItem(DRAFT_KEY,JSON.stringify(next));replaceDrafts(next);context.journal.dismiss(job.id);context.journal.remove(job.requestId);
  setAnalysisJobs(jobs=>jobs.filter(j=>j.id!==job.id));tell('原文已恢复。修改后可自行重新整理。');
 }
 async function saveAnalysisJob(jobID:string){
  if(analyzing.current||busy)return;
  const context=jobContext();analyzing.current=true;setBusy(true);setStage('保存中');abort.current=new AbortController();
  try{
   const job=await context.client.saveResult(context.key,jobID,abort.current.signal);if(!context.current())return;
   setAnalysisJobs(jobs=>[job,...jobs.filter(j=>j.id!==job.id)]);tell('结果已保存到云端，正在同步。');void refreshAnalysisJobs();
  }catch(e){if(context.current())report(e);}
  finally{analyzing.current=false;setBusy(false);setStage('');abort.current=null;}
 }
 async function sendJobSubmission(submission:LocalAnalysisSubmission,context:ReturnType<typeof jobContext>,previouslyUncertain=false){
  analyzing.current=true;setBusy(true);setStage('提交中');abort.current=new AbortController();
  try{
   const job=await submitAnalysisJob(submission.sources.map(d=>({text:d.text})),submission.requestId,{endpoint:config!.apiEndpoint,sessionKey:context.key,signal:abort.current.signal,onHumanVerification:options.onHumanVerification,onStage:s=>{if(context.current())setStage(s==='verifying'?'验证中':'提交中');}});
   if(!context.current())return false;
   submission.jobId=job.id;context.journal.put(submission);consumeJobDrafts(submission.sources);
   setAnalysisJobs(jobs=>[job,...jobs.filter(j=>j.id!==job.id)]);setUnconfirmedSubmissions(context.journal.all().filter(s=>!s.jobId));
   tell(job.status==='completed'?'结果已保存到云端，正在同步。':'已提交，可关闭页面或应用，稍后回来查看。');
   void refreshAnalysisJobs();return true;
  }catch(e){
   if(!context.current())return false;
   // A rejection before acceptance is safe to clear; network/timeout/cancel can lose the ACK and must retain the stable ID.
   if(!previouslyUncertain&&(e instanceof AnalysisError&&e.status>=400&&e.status<500&&![408,409].includes(e.status)
     ||e instanceof AnalysisError&&['INVALID_INPUT','INVALID_REQUEST_ID','INVALID_HUMAN_ANSWER','INVALID_CHALLENGE','HUMAN_VERIFICATION_REQUIRED','VERIFICATION_EXPIRED','PROOF_UNAVAILABLE','PROOF_TIMEOUT'].includes(e.code)))context.journal.remove(submission.requestId);
   setUnconfirmedSubmissions(context.journal.all().filter(s=>!s.jobId));
   if(e instanceof AnalysisError&&e.status===429&&e.retryAfterSeconds)setRetryAt(Date.now()+e.retryAfterSeconds*1000);
   if(e instanceof AnalysisError&&e.code==='AUTH_REQUIRED'){activateJobAccount(null);context.cloud.disconnect();}
   else if(context.journal.all().some(s=>s.requestId===submission.requestId))setError('提交状态尚未确认。原文已保留，请先确认本次提交，避免重复整理。');
   else report(e);
   void refreshAnalysisJobs();return false;
  }finally{analyzing.current=false;setBusy(false);setStage('');abort.current=null;}
 }
 async function confirmAnalysisSubmission(requestID:string){
  if(analyzing.current||busy||!config)return false;
  const context=jobContext(),submission=context.journal.all().find(s=>s.requestId===requestID&&!s.jobId);if(!submission)return false;
  return sendJobSubmission(submission,context,true);
 }
 function commitResult(value:{sources:Draft[];result:unknown}){
  const batch=parseAnalysisBatch(value.result);
  const indexes=batch.sourceIndexes??batch.notices.map((_,index)=>index);
  if(indexes.length!==batch.notices.length||indexes.some((v,i)=>v>=value.sources.length||i>0&&v<indexes[i-1])||new Set(indexes).size!==value.sources.length)throw new Error('整理结果未完整对应本次原文。');
  const current=repository.load();
  // Fixed IDs make recovering a result after refresh idempotent.
  const additions=batch.notices.map((a,i)=>{
   const source=value.sources[indexes[i]],ordinal=indexes.slice(0,i).filter(v=>v===indexes[i]).length;
   return {...createNotice(a,source.text),id:`ai-${source.id}${ordinal?`-${ordinal}`:''}`,attachments:source.attachments};
  });
  save([...current,...additions.filter(n=>!current.some(old=>old.id===n.id))]);
  if(additions.length)setLatestAddedID(additions[0].id);
  const consumed=new Set(value.sources.map(d=>d.id));const remaining=draftRef.current.filter(d=>!consumed.has(d.id));replaceDrafts(remaining.length?remaining:[makeDraft()]);
  localStorage.removeItem(RESULT_KEY);resultRef.current=null;setPending(false);setLegacyMissingFiles(false);tell(`已整理 ${additions.length} 条通知`);
 }
 async function analyze(){
  if(analyzing.current||busy||!config)return false;
  if(retryAt>Date.now())return false;
  if(pending)throw new Error('还有一份整理结果待恢复，请先保存它。');
  if(attaching.current.size)throw new Error('请等附件保存后再整理。');
  if(legacyRecords.length)throw new Error('旧版还有整理结果未保存，请先恢复它。');
  const context=jobContext();
  if(context.journal.all().some(s=>!s.jobId))throw new Error('还有一次提交状态未确认，请先确认它，避免重复整理。');
  const sources=structuredClone(draftRef.current.filter(d=>d.text.trim()));
  if(!sources.length||sources.some(d=>!d.text.trim())||sources.reduce((n,d)=>n+d.text.length,0)>4000)throw new Error('通知总字数需在 1–4,000 之间。');
  if(draftRef.current.some(d=>!d.text.trim()&&d.attachments.length))throw new Error('有附件的通知还没填写原文，请补上后再整理。');
  const submission:LocalAnalysisSubmission={requestId:newID(),sources,jobId:null,createdAt:new Date().toISOString()};
  // Persist the intent before sending. Reload recovery is read-only until the user explicitly confirms an unknown ACK.
  context.journal.put(submission);return sendJobSubmission(submission,context);
 }
 function recoverResult(){try{const raw=localStorage.getItem(RESULT_KEY);const value=resultRef.current||(raw?JSON.parse(raw):null);if(value)commitResult(value);}catch(e){report(e);}}
 function recoverLegacyResult(){try{const current=repository.load();save([...current,...legacyRecords.filter(n=>!current.some(old=>old.id===n.id))]);finishLegacyResult(localStorage,sessionStorage);setLegacyRecords([]);tell('旧版整理结果已保存');}catch(e){report(e);}}
 async function exportLegacyWork(){const result=await platform.saveFile(new Blob([legacyWork.text],{type:'text/plain;charset=utf-8'}),'campus-inbox-old-drafts.txt');if(result.status!=='cancelled')tell('旧版草稿已导出');}
 async function loadExamples(){
  const response=await fetch('./examples.json');if(!response.ok)throw new Error('示例暂时无法载入。');
  const records=parseBackup(await response.json());let registry:unknown=null;
  try{const response=await fetch('./examples-legacy.json',{signal:AbortSignal.timeout(5000)});if(response.ok)registry=await response.json();}catch{/* Existing records stay intact when legacy fingerprints are unavailable. */}
  const current=repository.load(),merged=await mergeExamples(current,records,registry);
  // Hashing yields to other edits. Do not overwrite changes made while it ran.
  if(JSON.stringify(repository.load())!==JSON.stringify(current))throw new Error('通知正在更新，请稍后再载入示例。');
  if(merged.added||merged.replaced)save(merged.notices);
  tell(merged.replaced?'已更新示例':merged.added?`已载入 ${merged.added} 条示例`:'示例已载入');
 }
 async function backup(includeAttachments=true){
  const records=repository.load();const data=includeAttachments?exportBackup(records,await exportFiles(records)):exportTextBackup(records);
  const result=await platform.saveFile(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`campus-inbox-${includeAttachments?'':'text-'}${new Date().toISOString().slice(0,10)}.json`);
  if(result.status!=='cancelled')tell(result.status==='saved'?'备份已保存':'备份已下载');
 }
 async function importBackup(file:File){
  if(file.size>70*1024*1024)throw new Error('备份超过 70 MB，无法导入。');
  const data=JSON.parse(await file.text());let records=parseBackup(data);
  const restored=await restoreFiles(data.attachments??[],records);records=restored.notices;
  const current=repository.load();
  // Preserve the current version when a backup contains an already-existing ID.
  const added=records.filter(n=>!current.some(old=>old.id===n.id));
  save([...current,...added]);await cleanupFiles(restored.ids,fileReferences());
  tell(`已导入 ${added.length} 条通知，现有通知保留。`);
 }
 async function receiveShare(){
  if(busy||receivingShare.current)return false;
  receivingShare.current=true;let received=false;
  try{for(let count=0;count<20;count++){
   if(draftRef.current.length>=20&&!draftRef.current.some(d=>!d.text.trim()&&!d.attachments.length)){tell('先整理或移除一条草稿，再接收分享。');break;}
   const text=await platform.getSharedText();if(!text)break;
   const empty=draftRef.current.find(d=>!d.text.trim()&&!d.attachments.length);
   if(empty)changeDraft(empty.id,text);else addDraft(text);received=true;
  }return received;}finally{receivingShare.current=false;}
 }
 return {notices,drafts,busy,stage,retryAt,error,setError,toast,setToast,pending,recoverResult,latestAddedID,analysisJobs,unconfirmedSubmissions,jobStatusError,refreshAnalysisJobs,restoreAnalysisJob,saveAnalysisJob,confirmAnalysisSubmission,legacyWork,legacyRecords,legacyMissingFiles,setLegacyMissingFiles,recoverLegacyResult,exportLegacyWork,config,platform,capabilities,cloud,auth,authOptions,email,sync,username,theme,setTheme,bootError:boot.error,
  report,tell,update,act,remove,changeDraft,pasteDraft,insertDraft,addDraft,attach,detach,removeDraft,analyze,cancel:()=>abort.current?.abort(),loadExamples,backup,importBackup,login,logout,bindEmail,receiveShare};
}
export type CampusController=ReturnType<typeof useCampus>;
